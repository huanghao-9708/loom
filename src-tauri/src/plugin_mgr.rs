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

    pub fn get_plugin_dir(&self, plugin_id: &str) -> PathBuf {
        self.base_dir.join("plugins").join(plugin_id)
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

        // 尝试自动读取 manifest 并执行迁移
        if let Ok(manifest_data) = tokio::fs::read_to_string(plugin_dir.join("manifest.json")).await {
            if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&manifest_data) {
                if let Err(e) = Self::migrate_pool(&pool, plugin_id, &plugin_dir, &manifest).await {
                    println!("[PluginManager] Warning: Auto-migration failed for '{}': {}", plugin_id, e);
                }
            }
        }

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
        let plugin_dir = self.base_dir.join("plugins").join(plugin_id);
        Self::migrate_pool(&pool, plugin_id, &plugin_dir, manifest).await
    }

    async fn migrate_pool(pool: &SqlitePool, plugin_id: &str, plugin_dir: &std::path::Path, manifest: &PluginManifest) -> Result<(), String> {
        let target_version = manifest.schema_version;

        // 获取当前库内的 user_version
        let current_version: i32 = sqlx::query_scalar("PRAGMA user_version;")
            .fetch_one(pool)
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
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to update PRAGMA user_version: {}", e))?;
        }

        Ok(())
    }

    pub async fn get_installed_plugins(&self) -> Result<Vec<PluginManifest>, String> {
        let plugins_dir = self.base_dir.join("plugins");
            
        let mut result = Vec::new();
        if !plugins_dir.exists() {
            return Ok(result);
        }
        
        let mut entries = tokio::fs::read_dir(plugins_dir).await.map_err(|e| e.to_string())?;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                let manifest_path = path.join("manifest.json");
                if manifest_path.exists() {
                    if let Ok(manifest_data) = tokio::fs::read_to_string(&manifest_path).await {
                        if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&manifest_data) {
                            result.push(manifest);
                        }
                    }
                }
            }
        }
        Ok(result)
    }

    pub async fn install_plugin(&self, zip_path: &str) -> Result<String, String> {
        let plugins_dir = self.base_dir.join("plugins");
            
        let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        let mut plugin_id = String::new();
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if file.name() == "manifest.json" {
                let mut content = String::new();
                std::io::Read::read_to_string(&mut file, &mut content).map_err(|e| e.to_string())?;
                if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                    plugin_id = manifest.id.clone();
                }
                break;
            }
        }
        
        if plugin_id.is_empty() {
            return Err("Invalid plugin package: missing manifest.json with id".to_string());
        }
        
        let target_dir = plugins_dir.join(&plugin_id);
        if !target_dir.exists() {
            std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        }
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => target_dir.join(path),
                None => continue,
            };
            
            if file.is_dir() {
                std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
        
        Ok(plugin_id)
    }
}
