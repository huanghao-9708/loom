use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 插件管理器：负责调度所有第三方插件的独立数据库链接与沙箱鉴权
#[derive(Clone)]
pub struct PluginManager {
    /// key: plugin_id, value: 针对该插件独有的 data.db 连接池
    pools: Arc<RwLock<HashMap<String, SqlitePool>>>,
    /// 宿主应用的数据目录基址（通常为 AppData/Local/com.loom.app）
    base_dir: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub entry: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: i32,
    pub permissions: PluginPermissions,
    pub migrations: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PluginPermissions {
    pub vfs: Option<Vec<String>>,
    pub db: Option<bool>,
    pub net: Option<Vec<String>>,
    pub ui: Option<Vec<String>>,
}

impl PluginManager {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
            base_dir,
        }
    }

    /// 获取或创建指定插件的独立 SqlitePool。
    /// 第一次调用时会在 `plugins/<plugin_id>/data.db` 创建全新库文件。
    pub async fn get_plugin_pool(&self, plugin_id: &str) -> Result<SqlitePool, String> {
        // 先尝试读锁
        {
            let map = self.pools.read().await;
            if let Some(pool) = map.get(plugin_id) {
                return Ok(pool.clone());
            }
        }

        // 如果没有，开启写锁进行初始化
        let mut map = self.pools.write().await;
        // 双重检查防并发竞争
        if let Some(pool) = map.get(plugin_id) {
            return Ok(pool.clone());
        }

        // 构造沙箱库目录：`AppData/Local/com.loom.app/plugins/<plugin_id>`
        let plugin_dir = self.base_dir.join("plugins").join(plugin_id);
        if !plugin_dir.exists() {
            tokio::fs::create_dir_all(&plugin_dir)
                .await
                .map_err(|e| format!("Failed to create plugin sandbox dir: {}", e))?;
        }

        let db_path = plugin_dir.join("data.db");
        // 如果文件不存在，Sqlite 默认会自动创建它（带 CREATE_IF_MISSING 标志）
        let conn_str = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(3) // 插件独立库并发给个 3 足够了
            .connect(&conn_str)
            .await
            .map_err(|e| format!("Failed to connect plugin DB: {}", e))?;

        map.insert(plugin_id.to_string(), pool.clone());
        println!("[PluginManager] Initialized exclusive database pool for '{}'", plugin_id);

        Ok(pool)
    }

    /// 回收某个插件的连接池释放内存资源
    pub async fn evict_plugin_pool(&self, plugin_id: &str) {
        let mut map = self.pools.write().await;
        if let Some(pool) = map.remove(plugin_id) {
            pool.close().await;
            println!("[PluginManager] Evicted DB pool for '{}'", plugin_id);
        }
    }

    /// 在受控的沙箱 data.db 内执行属于该插件自身的 schema migration
    pub async fn migrate_plugin(&self, plugin_id: &str, manifest: &PluginManifest) -> Result<(), String> {
        let pool = self.get_plugin_pool(plugin_id).await?;
        let target_version = manifest.schema_version;

        // 获取当前库内的 user_version
        let current_version: i32 = sqlx::query_scalar("PRAGMA user_version;")
            .fetch_one(&pool)
            .await
            .map_err(|e| format!("Failed to read PRAGMA user_version: {}", e))?;

        if current_version >= target_version {
            return Ok(()); // 已经是最新或者更高版本
        }

        println!(
            "[PluginManager] Migrating sandbox DB for '{}': v{} -> v{}",
            plugin_id, current_version, target_version
        );

        // 获取 migrations 列表，里面包含相对路径（如 migrations/001.sql）
        let migrations = manifest.migrations.as_ref();
        if migrations.is_none() || migrations.unwrap().is_empty() {
            return Ok(());
        }
        let migrations = migrations.unwrap();

        // 计算需要执行哪些迁移脚本。假设 current_version 是已执行的脚本数量
        let plugin_dir = self.base_dir.join("plugins").join(plugin_id);
        
        let start_index = current_version as usize;
        for i in start_index..migrations.len() {
            let sql_path = plugin_dir.join(&migrations[i]);
            let sql_script = tokio::fs::read_to_string(&sql_path)
                .await
                .map_err(|e| format!("Failed to read migration script {:?}: {}", sql_path, e))?;

            // 执行多条 SQL
            let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
            for statement in sql_script.split(';') {
                let stmt = statement.trim();
                if !stmt.is_empty() {
                    sqlx::query(stmt)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| format!("Migration error in script {}: {}", migrations[i], e))?;
                }
            }
            tx.commit().await.map_err(|e| e.to_string())?;

            // 升级版本号
            let next_version = (i + 1) as i32;
            sqlx::query(&format!("PRAGMA user_version = {};", next_version))
                .execute(&pool)
                .await
                .map_err(|e| format!("Failed to update PRAGMA user_version: {}", e))?;
        }

        Ok(())
    }
}
