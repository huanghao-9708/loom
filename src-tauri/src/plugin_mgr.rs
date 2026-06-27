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
    // ---- 市场展示与兼容性字段（均向后兼容，老插件可省略）----
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(rename = "minAppVersion", default)]
    pub min_app_version: Option<String>,
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

    /// 解析插件**静态资源**（UI 代码）所在目录。
    ///
    /// - 生产环境 / 未设置开关：返回安装目录 `base_dir/plugins/<id>`。
    /// - 开发环境且设置了环境变量 `LOOM_DEV_PLUGIN_SRC`（仅 debug 编译生效）：
    ///   返回 `<dev_src>/<id>`，直接从仓库源码加载，编辑即生效。
    ///
    /// 注意：数据库（data.db）始终使用安装目录（见 `get_plugin_pool`），
    /// 实现数据隔离——dev 模式下代码与用户数据互不干扰。
    pub fn get_plugin_resource_dir(&self, plugin_id: &str) -> PathBuf {
        #[cfg(debug_assertions)]
        {
            if let Ok(dev_src) = std::env::var("LOOM_DEV_PLUGIN_SRC") {
                let dev_path = std::path::Path::new(&dev_src).join(plugin_id);
                if dev_path.join("manifest.json").exists() {
                    return dev_path;
                }
                // 源码目录不存在该插件，回退到安装目录
            }
        }
        self.get_plugin_dir(plugin_id)
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

    /// 统计某个插件目录的总占用字节（含代码资源 + data.db + 用户数据）。
    /// 用于卸载确认弹窗展示「将释放 X MB」。
    pub async fn get_disk_usage(&self, plugin_id: &str) -> Result<u64, String> {
        let plugin_dir = self.get_plugin_dir(plugin_id);
        if !plugin_dir.exists() {
            return Ok(0);
        }
        Ok(Self::dir_size(&plugin_dir))
    }

    /// 递归计算目录体积（同步辅助函数）
    fn dir_size(path: &std::path::Path) -> u64 {
        let mut total = 0u64;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    total += Self::dir_size(&p);
                } else if let Ok(meta) = entry.metadata() {
                    total += meta.len();
                }
            }
        }
        total
    }

    /// 卸载插件：先回收数据库连接池，再物理删除目录。
    /// - `purge_data == false`：删除插件代码目录，但把 data.db 等用户数据移到
    ///   `~/.loom/.trash/<plugin_id>/` 暂存，以便未来重装可恢复数据。
    /// - `purge_data == true`：连同用户数据彻底擦除。
    ///
    /// 返回被释放的字节数，供前端反馈。
    pub async fn uninstall_plugin(
        &self,
        plugin_id: &str,
        purge_data: bool,
    ) -> Result<u64, String> {
        let plugin_dir = self.get_plugin_dir(plugin_id);
        if !plugin_dir.exists() {
            // 目录已不存在视为幂等成功，但先回收可能残留的连接池
            self.evict_plugin_pool(plugin_id).await;
            return Ok(0);
        }

        // 1. 先回收该插件的 SQLite 连接池，避免文件句柄占用导致删除失败
        self.evict_plugin_pool(plugin_id).await;

        // 2. 统计将被释放的体积
        let freed_bytes = Self::dir_size(&plugin_dir);

        // 3. 处理用户数据：保留则迁移 data.db 到回收站
        if !purge_data {
            let db_file = plugin_dir.join("data.db");
            if db_file.exists() {
                let trash_dir = self.base_dir.join(".trash").join(plugin_id);
                tokio::fs::create_dir_all(&trash_dir)
                    .await
                    .map_err(|e| format!("Failed to create trash dir: {}", e))?;
                tokio::fs::rename(&db_file, trash_dir.join("data.db"))
                    .await
                    .map_err(|e| format!("Failed to move data.db to trash: {}", e))?;
                println!(
                    "[PluginManager] Preserved data.db for '{}' in trash (purge_data=false)",
                    plugin_id
                );
            }
        }

        // 4. 物理删除插件目录
        tokio::fs::remove_dir_all(&plugin_dir)
            .await
            .map_err(|e| format!("Failed to remove plugin dir: {}", e))?;

        println!(
            "[PluginManager] Uninstalled '{}', freed {} bytes (purge_data={})",
            plugin_id, freed_bytes, purge_data
        );

        Ok(freed_bytes)
    }

    /// 恢复回收站中暂存的插件数据（重装时若回收站有同名数据则自动还原）
    pub async fn restore_data_if_any(&self, plugin_id: &str) -> Result<(), String> {
        let trash_db = self.base_dir.join(".trash").join(plugin_id).join("data.db");
        if !trash_db.exists() {
            return Ok(());
        }
        let plugin_dir = self.get_plugin_dir(plugin_id);
        if !plugin_dir.exists() {
            tokio::fs::create_dir_all(&plugin_dir)
                .await
                .map_err(|e| e.to_string())?;
        }
        let target = plugin_dir.join("data.db");
        if !target.exists() {
            tokio::fs::rename(&trash_db, &target)
                .await
                .map_err(|e| format!("Failed to restore data.db: {}", e))?;
            // 还原后清理空的 trash 子目录
            let _ = tokio::fs::remove_dir_all(self.base_dir.join(".trash").join(plugin_id)).await;
            println!("[PluginManager] Restored data.db for '{}' from trash", plugin_id);
        }
        Ok(())
    }

    /// 升级插件（Sprint 2）：
    /// 1. 下载完成后传入新版 .loom 的临时路径
    /// 2. 备份旧目录到 `~/.loom/.cache/<id>.bak`
    /// 3. 解压新版到插件目录
    /// 4. 把旧版备份中的 data.db 迁移进新目录（保证升级不丢数据）
    /// 5. 成功后清理备份；失败则回滚（删除新目录、还原备份）
    ///
    /// 返回更新后的 plugin_id。
    pub async fn update_plugin(&self, new_zip_path: &str) -> Result<String, String> {
        let plugins_dir = self.base_dir.join("plugins");

        // 先读取新版 zip 中的 manifest 获取 plugin_id
        let new_file = std::fs::File::open(new_zip_path).map_err(|e| e.to_string())?;
        let mut new_archive = zip::ZipArchive::new(new_file).map_err(|e| e.to_string())?;

        let mut plugin_id = String::new();
        for i in 0..new_archive.len() {
            let mut file = new_archive.by_index(i).map_err(|e| e.to_string())?;
            if file.name() == "manifest.json" {
                let mut content = String::new();
                std::io::Read::read_to_string(&mut file, &mut content)
                    .map_err(|e| e.to_string())?;
                if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                    plugin_id = manifest.id.clone();
                }
                break;
            }
        }
        if plugin_id.is_empty() {
            return Err("升级失败：新版包缺少有效 manifest.json".to_string());
        }

        let old_dir = plugins_dir.join(&plugin_id);
        if !old_dir.exists() {
            return Err(format!(
                "升级失败：插件 '{}' 未安装，请使用安装功能",
                plugin_id
            ));
        }

        // 1. 回收旧版连接池，释放文件句柄
        self.evict_plugin_pool(&plugin_id).await;

        // 2. 备份旧目录
        let backup_dir = self.base_dir.join(".cache").join(format!("{}.bak", &plugin_id));
        if backup_dir.exists() {
            let _ = tokio::fs::remove_dir_all(&backup_dir).await;
        }
        // 使用同步 rename 做原子备份（同一文件系统下极快）
        std::fs::rename(&old_dir, &backup_dir).map_err(|e| {
            format!("升级失败：无法备份旧版本目录 ({})", e)
        })?;

        // 3. 用现有 install_plugin 逻辑解压新版到插件目录
        let install_result: Result<String, String> = async {
            // 重新打开 zip（ZipArchive 消耗了）
            let file = std::fs::File::open(new_zip_path).map_err(|e| e.to_string())?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

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
                            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                        }
                    }
                    let mut outfile =
                        std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                }
            }

            Ok(plugin_id.clone())
        }
        .await;

        match install_result {
            Ok(id) => {
                // 4. 从备份中迁移 data.db（仅当新目录尚无 data.db 时）
                let bak_db = backup_dir.join("data.db");
                let new_db = plugins_dir.join(&id).join("data.db");
                if bak_db.exists() && !new_db.exists() {
                    tokio::fs::rename(&bak_db, &new_db)
                        .await
                        .map_err(|e| e.to_string())?;
                    println!(
                        "[PluginManager] Update: migrated data.db for '{}'",
                        id
                    );
                }

                // 5. 清理备份
                let _ = tokio::fs::remove_dir_all(&backup_dir).await;

                Ok(id)
            }
            Err(e) => {
                // 回滚：删除不完整的新目录，还原备份
                let _ = tokio::fs::remove_dir_all(plugins_dir.join(&plugin_id)).await;
                let _ = std::fs::rename(&backup_dir, &old_dir);
                Err(format!("升级失败并已回滚：{}", e))
            }
        }
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

        // 重装场景：若回收站存有该插件的历史数据且当前目录尚无 data.db，则自动还原
        if let Err(e) = self.restore_data_if_any(&plugin_id).await {
            println!("[PluginManager] Warning: data restore skipped for '{}': {}", plugin_id, e);
        }

        Ok(plugin_id)
    }
}
