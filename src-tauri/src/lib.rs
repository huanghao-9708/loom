pub mod db;
pub mod scanner;
pub mod vfs;
pub mod plugin_mgr;

use crate::db::{BentoStats, DbManager, FileRecord, SourceRecord};
use crate::vfs::VfsSource;
use crate::plugin_mgr::PluginManager;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::RwLock;

/// 内存中的 VFS 数据源管理器，管理活动的数据源适配器实例
pub struct VfsManager {
    pub sources: RwLock<HashMap<i32, Arc<dyn VfsSource>>>,
}

impl VfsManager {
    pub fn new() -> Self {
        Self {
            sources: RwLock::new(HashMap::new()),
        }
    }
}

/// 辅助函数：从 SQLite 加载数据源配置并序列化注入内存管理器
async fn load_sources_to_vfs(db: &DbManager, vfs_mgr: &VfsManager) -> Result<(), String> {
    let sources = db.get_sources().await.map_err(|e| e.to_string())?;
    let mut map = vfs_mgr.sources.write().await;

    for s in sources {
        let config: serde_json::Value = serde_json::from_str(&s.config_json)
            .map_err(|e| format!("Failed to parse JSON config for source {}: {}", s.name, e))?;

        let source_instance: Arc<dyn VfsSource> = match s.kind.as_str() {
            "local" => {
                let path_str = config["root_path"].as_str().ok_or("Missing root_path")?;
                Arc::new(crate::vfs::LocalSource::new(std::path::PathBuf::from(
                    path_str,
                )))
            }
            "webdav" => {
                let url = config["url"].as_str().ok_or("Missing url")?.to_string();
                let username = config["username"]
                    .as_str()
                    .ok_or("Missing username")?
                    .to_string();
                let token = config["token"].as_str().ok_or("Missing token")?.to_string();
                Arc::new(crate::vfs::WebdavSource::new(url, username, token))
            }
            _ => continue,
        };

        map.insert(s.id, source_instance);
    }

    Ok(())
}

// ==========================================
// Tauri Commands 桥接层实现
// ==========================================

#[tauri::command]
async fn cmd_add_source(
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    kind: String,
    name: String,
    config_json: String,
) -> Result<i32, String> {
    // 1. 写入数据库
    let source_id = db
        .add_source(&kind, &name, &config_json)
        .await
        .map_err(|e| e.to_string())?;

    // 2. 动态创建适配器并塞入内存管理器，免去重启
    let config: serde_json::Value =
        serde_json::from_str(&config_json).map_err(|e| e.to_string())?;

    let source_instance: Arc<dyn VfsSource> = match kind.as_str() {
        "local" => {
            let path_str = config["root_path"].as_str().ok_or("Missing root_path")?;
            Arc::new(crate::vfs::LocalSource::new(std::path::PathBuf::from(
                path_str,
            )))
        }
        "webdav" => {
            let url = config["url"].as_str().ok_or("Missing url")?.to_string();
            let username = config["username"]
                .as_str()
                .ok_or("Missing username")?
                .to_string();
            let token = config["token"].as_str().ok_or("Missing token")?.to_string();
            Arc::new(crate::vfs::WebdavSource::new(url, username, token))
        }
        _ => return Err("Unsupported source type".to_string()),
    };

    vfs_mgr
        .sources
        .write()
        .await
        .insert(source_id, source_instance);

    Ok(source_id)
}

#[tauri::command]
async fn cmd_get_sources(db: State<'_, DbManager>) -> Result<Vec<SourceRecord>, String> {
    db.get_sources().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_remove_source(
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    id: i32,
) -> Result<(), String> {
    db.remove_source(id).await.map_err(|e| e.to_string())?;
    vfs_mgr.sources.write().await.remove(&id);
    Ok(())
}

#[tauri::command]
async fn cmd_get_bento_stats(
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
) -> Result<BentoStats, String> {
    let mut stats = db.get_bento_stats().await.map_err(|e| e.to_string())?;

    // 为每个在线的数据源注入物理总容量探测结果
    let sources_map = vfs_mgr.sources.read().await;
    for source_stat in stats.source_statistics.iter_mut() {
        if let Some(vfs) = sources_map.get(&source_stat.source_id) {
            if let Ok(cap) = vfs.get_capacity().await {
                source_stat.physical_capacity = cap;
            }
        }
    }

    Ok(stats)
}

#[tauri::command]
async fn cmd_search_files(
    db: State<'_, DbManager>,
    query: String,
) -> Result<Vec<FileRecord>, String> {
    db.search_files(&query).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_list_dir(
    app: tauri::AppHandle,
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    source_id: i32,
    path: String,
) -> Result<Vec<FileRecord>, String> {
    // 1. 先查 SQLite 缓存是否有该文件夹的内容
    let cached = db
        .get_files_in_dir(source_id, &path)
        .await
        .map_err(|e| e.to_string())?;

    if !cached.is_empty() {
        return Ok(cached);
    }

    // 2. 缓存为空，触发懒加载：只拉取本目录数据并通知前端 (放弃阻塞)
    let source_opt = {
        let map = vfs_mgr.sources.read().await;
        map.get(&source_id).cloned()
    };

    if let Some(source) = source_opt {
        let db_inner = db.inner().clone();
        let path_clone = path.clone();
        
        tokio::spawn(async move {
            if let Ok(fresh_entries) = source.list_dir(&path_clone).await {
                let inserts: Vec<crate::db::FileInsert> = fresh_entries
                    .into_iter()
                    .map(|entry| crate::db::FileInsert {
                        source_id,
                        vpath: entry.vpath,
                        name: entry.name,
                        ext: entry.ext,
                        category: entry.category,
                        size_bytes: entry.size_bytes,
                        is_dir: entry.is_dir,
                        mtime: entry.mtime,
                    })
                    .collect();

                if let Ok(_) = db_inner.insert_file_records(inserts).await {
                    let _ = app.emit("vfs-dir-updated", serde_json::json!({
                        "source_id": source_id,
                        "path": path_clone
                    }));
                }
            }
        });
        
        // 立即返回空数组
        Ok(Vec::new())
    } else {
        Err("Active VFS Source instance not found".to_string())
    }
}

#[tauri::command]
async fn cmd_trigger_scan(
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    source_id: i32,
) -> Result<(), String> {
    let source_opt = {
        let map = vfs_mgr.sources.read().await;
        map.get(&source_id).cloned()
    };

    if let Some(source) = source_opt {
        let db_clone = db.inner().clone();
        let source_info = db.get_source(source_id).await.map_err(|e| e.to_string())?;
        let is_webdav = source_info.kind == "webdav";

        // 异步派发后台扫描，防止页面假死
        tokio::spawn(async move {
            let scanner = crate::scanner::Scanner::new(db_clone);
            println!("[Scanner] Async scan started for source_id: {}", source_id);
            match scanner.scan_source(source_id, source, is_webdav).await {
                Ok(_) => println!(
                    "[Scanner] Async scan finished successfully for source_id: {}",
                    source_id
                ),
                Err(e) => eprintln!(
                    "[Scanner Error] Async scan failed for source_id: {}: {}",
                    source_id, e
                ),
            }
        });

        Ok(())
    } else {
        Err("VFS Source instance not found".to_string())
    }
}

#[tauri::command]
async fn cmd_file_delete(
    app: tauri::AppHandle,
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    source_id: i32,
    path: String,
) -> Result<(), String> {
    let source = {
        let map = vfs_mgr.sources.read().await;
        map.get(&source_id).cloned().ok_or("Source not found")?
    };
    source.delete(&path).await.map_err(|e| e.to_string())?;

    let parent_path = if let Some(idx) = path.trim_end_matches('/').rfind('/') {
        if idx == 0 { "/".to_string() } else { path[..idx].to_string() }
    } else {
        "/".to_string()
    };
    
    // 精准外科手术：仅删除被删文件及其下属所有子节点记录，无须全盘扫描
    let cascade_prefix = format!("{}/%", path.trim_end_matches('/'));
    let _ = sqlx::query("DELETE FROM files WHERE source_id = ? AND (vpath = ? OR vpath LIKE ?)")
        .bind(source_id)
        .bind(&path)
        .bind(&cascade_prefix)
        .execute(&db.pool)
        .await;

    let _ = app.emit("vfs-dir-updated", serde_json::json!({
        "source_id": source_id,
        "path": parent_path
    }));

    Ok(())
}

#[tauri::command]
async fn cmd_file_rename(
    app: tauri::AppHandle,
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    source_id: i32,
    path: String,
    new_name: String,
) -> Result<(), String> {
    let source = {
        let map = vfs_mgr.sources.read().await;
        map.get(&source_id).cloned().ok_or("Source not found")?
    };
    source.rename(&path, &new_name).await.map_err(|e| e.to_string())?;

    let parent_path = if let Some(idx) = path.trim_end_matches('/').rfind('/') {
        if idx == 0 { "/".to_string() } else { path[..idx].to_string() }
    } else {
        "/".to_string()
    };
    
    // 强制清除父目录的局部缓存以触发前端即时懒加载重拉取，杜绝全盘扫描
    let _ = sqlx::query("DELETE FROM files WHERE source_id = ? AND parent_vpath = ?")
        .bind(source_id)
        .bind(&parent_path)
        .execute(&db.pool)
        .await;

    let _ = app.emit("vfs-dir-updated", serde_json::json!({
        "source_id": source_id,
        "path": parent_path
    }));

    Ok(())
}

#[tauri::command]
async fn cmd_file_mkdir(
    app: tauri::AppHandle,
    db: State<'_, DbManager>,
    vfs_mgr: State<'_, VfsManager>,
    source_id: i32,
    path: String,
) -> Result<(), String> {
    let source = {
        let map = vfs_mgr.sources.read().await;
        map.get(&source_id).cloned().ok_or("Source not found")?
    };
    source.mkdir(&path).await.map_err(|e| e.to_string())?;

    let parent_path = if let Some(idx) = path.trim_end_matches('/').rfind('/') {
        if idx == 0 { "/".to_string() } else { path[..idx].to_string() }
    } else {
        "/".to_string()
    };
    
    // 清除父目录的局部缓存以迫使前端触发即时懒加载，实现毫秒级 UI 刷新反馈
    let _ = sqlx::query("DELETE FROM files WHERE source_id = ? AND parent_vpath = ?")
        .bind(source_id)
        .bind(&parent_path)
        .execute(&db.pool)
        .await;

    let _ = app.emit("vfs-dir-updated", serde_json::json!({
        "source_id": source_id,
        "path": parent_path
    }));

    Ok(())
}

// 解析 Range HTTP 请求头，以便自定义协议进行流式分片读取 (例如 bytes=100-200 或 bytes=100-)
fn parse_range_header(range_str: &str) -> Option<(u64, u64)> {
    if !range_str.starts_with("bytes=") {
        return None;
    }
    let val = range_str.strip_prefix("bytes=")?;
    let parts: Vec<&str> = val.split('-').collect();
    if parts.is_empty() {
        return None;
    }
    let start = parts[0].parse::<u64>().ok()?;
    let end = if parts.len() > 1 && !parts[1].is_empty() {
        parts[1].parse::<u64>().ok()?
    } else {
        start + 1024 * 1024 - 1 // 未定义结束时默认回馈 1MB 分段
    };
    Some((start, end))
}

// ==========================================
// 插件隔离沙箱通信网关
// ==========================================

#[tauri::command]
async fn cmd_plugin_db_execute(
    plugin_mgr: State<'_, PluginManager>,
    plugin_id: String,
    sql: String,
) -> Result<u64, String> {
    let pool = plugin_mgr.get_plugin_pool(&plugin_id).await?;
    let result = sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn cmd_plugin_db_query(
    plugin_mgr: State<'_, PluginManager>,
    plugin_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, String> {
    use sqlx::{Column, Row};
    let pool = plugin_mgr.get_plugin_pool(&plugin_id).await?;
    
    let mut q = sqlx::query(&sql);
    for p in params {
        match p {
            serde_json::Value::String(s) => q = q.bind(s),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q = q.bind(i);
                } else if let Some(f) = n.as_f64() {
                    q = q.bind(f);
                }
            }
            serde_json::Value::Bool(b) => q = q.bind(b),
            serde_json::Value::Null => q = q.bind(None::<i64>),
            _ => q = q.bind(p.to_string()),
        }
    }

    let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    
    for row in rows {
        let mut map = serde_json::Map::new();
        for col in row.columns() {
            let col_name = col.name().to_string();
            // try to extract as integer first, then real, then string
            let val = if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                serde_json::Value::Number(v.into())
            } else if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                if let Some(num) = serde_json::Number::from_f64(v) {
                    serde_json::Value::Number(num)
                } else {
                    serde_json::Value::Null
                }
            } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                serde_json::Value::String(v)
            } else if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                serde_json::Value::Bool(v)
            } else {
                serde_json::Value::Null
            };
            map.insert(col_name, val);
        }
        result.push(map);
    }
    
    Ok(result)
}

#[tauri::command]
async fn cmd_plugin_vfs_list(
    vfs_manager: State<'_, VfsManager>,
    plugin_id: String,
    source_id: i32,
    path: String,
) -> Result<Vec<crate::vfs::VfsEntry>, String> {
    // 【未来扩展点】根据插件 Manifest，在此拦截不允许的 source_id 和 path
    println!("[Security Gateway] Plugin '{}' requests VFS list at {}/{}", plugin_id, source_id, path);
    // 此处复用原有的 VFS 能力下发
    let sources = vfs_manager.sources.read().await;
    let source = sources.get(&source_id).ok_or("Source not mounted")?.clone();
    drop(sources);
    source.list_dir(&path).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vfs_manager = VfsManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // 获取并创建 App 本地数据目录下的 SQLite 数据库
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .expect("Failed to locate AppLocalData Directory");
            let db_path = app_data_dir.join("loom.db");

            println!("[Database] Initializing loom.db at: {}", db_path.display());

            // 采用 Tauri 的异步运行时做数据库阻断式初始化
            let db_manager = tauri::async_runtime::block_on(async move {
                DbManager::init(&db_path)
                    .await
                    .expect("Failed to initialize database")
            });

            // 启动时将已配置的数据源预加载并注入内存
            let db_clone = db_manager.clone();
            tauri::async_runtime::block_on(async {
                if let Err(e) = load_sources_to_vfs(&db_clone, &vfs_manager).await {
                    eprintln!("[VFS Warning] Preloading sources failed: {}", e);
                }
            });

            // 挂载 Tauri 全局状态托管
            app.manage(db_manager);
            app.manage(vfs_manager);
            app.manage(PluginManager::new(app_data_dir.clone()));

            Ok(())
        })
        // 注册 loom://preview/ 统一安全分片预览协议，支持 Range 头以支持边下边播
        .register_uri_scheme_protocol("loom", |app_handle, request| {
            let uri_path = request.uri().path();
            let tail = if let Some(t) = uri_path.strip_prefix("/preview/") {
                t
            } else {
                let err_msg = format!("Invalid custom protocol path: {}", uri_path);
                eprintln!("[Protocol Error] {}", err_msg);
                return tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::BAD_REQUEST)
                    .body(err_msg.into_bytes())
                    .unwrap();
            };

            let parts: Vec<&str> = tail.splitn(2, '/').collect();
            if parts.len() < 2 {
                let err_msg = format!("Malformed preview path, expected <source_id>/<path>: {}", tail);
                eprintln!("[Protocol Error] {}", err_msg);
                return tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::BAD_REQUEST)
                    .body(err_msg.into_bytes())
                    .unwrap();
            }

            let source_id_str = parts[0];
            // 对路径进行 URL percent decode（前端传递过来的可能会把空格变成 %20）
            let raw_vpath = parts[1];
            let mut decoded_bytes = Vec::new();
            let mut chars = raw_vpath.as_bytes().iter().peekable();
            while let Some(&b) = chars.next() {
                if b == b'%' {
                    if let (Some(&h1), Some(&h2)) = (chars.next(), chars.next()) {
                        if let Ok(decoded) = u8::from_str_radix(std::str::from_utf8(&[h1, h2]).unwrap_or(""), 16) {
                            decoded_bytes.push(decoded);
                            continue;
                        }
                    }
                }
                decoded_bytes.push(b);
            }
            let decoded_vpath = String::from_utf8_lossy(&decoded_bytes).into_owned();
            let vpath = format!("/{}", decoded_vpath);

            let Ok(source_id) = source_id_str.parse::<i32>() else {
                let err_msg = format!("Invalid source_id, must be integer: {}", source_id_str);
                eprintln!("[Protocol Error] {}", err_msg);
                return tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::BAD_REQUEST)
                    .body(err_msg.into_bytes())
                    .unwrap();
            };

            let vfs_mgr = app_handle.app_handle().state::<VfsManager>();

            let vpath_clone = vpath.clone();
            // 异步 block_on 阻塞读取数据源，显式标注类型以消除编译器类型推导歧义
            let read_res: Result<(Vec<u8>, Option<(u64, u64, u64)>), String> =
                tauri::async_runtime::block_on(async move {
                    let map = vfs_mgr.sources.read().await;
                    if let Some(source) = map.get(&source_id) {
                        let range_header = request
                            .headers()
                            .get("range")
                            .and_then(|val| val.to_str().ok());

                        if let Some(range_str) = range_header {
                            if let Some(range) = parse_range_header(range_str) {
                                if let Ok(size) = source.get_size(&vpath_clone).await {
                                    if size > 0 {
                                        let start = range.0;
                                        // Protect against malicious start > size
                                        if start < size {
                                            let mut length = range.1.saturating_sub(range.0) + 1;
                                            if start + length > size {
                                                length = size.saturating_sub(start);
                                            }

                                            if length > 0 {
                                                match source.read_range(&vpath_clone, start, length).await {
                                                    Ok(bytes) => {
                                                        return Ok((
                                                            bytes,
                                                            Some((start, start + length - 1, size)),
                                                        ));
                                                    }
                                                    Err(e) => return Err(e.to_string()),
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        match source.read_file(&vpath_clone).await {
                            Ok(bytes) => Ok((bytes, None)),
                            Err(e) => Err(e.to_string()),
                        }
                    } else {
                        Err("Target source adaptor not mounted".to_string())
                    }
                });

            match read_res {
                Ok((bytes, range_info)) => {
                    let mut response_builder = tauri::http::Response::builder();

                    let ext = vpath.split('.').last().unwrap_or("").to_lowercase();
                    let mime_type = match ext.as_str() {
                        "jpg" | "jpeg" => "image/jpeg",
                        "png" => "image/png",
                        "gif" => "image/gif",
                        "webp" => "image/webp",
                        "mp3" => "audio/mpeg",
                        "wav" => "audio/wav",
                        "flac" => "audio/flac",
                        "mp4" => "video/mp4",
                        "pdf" => "application/pdf",
                        "txt" | "md" => "text/plain; charset=utf-8",
                        _ => "application/octet-stream",
                    };

                    response_builder = response_builder
                        .header("content-type", mime_type)
                        .header("access-control-allow-origin", "*");

                    if let Some((start, end, total)) = range_info {
                        response_builder = response_builder
                            .status(tauri::http::StatusCode::PARTIAL_CONTENT)
                            .header(
                                "content-range",
                                format!("bytes {}-{}/{}", start, end, total),
                            )
                            .header("content-length", bytes.len().to_string());
                    } else {
                        response_builder = response_builder
                            .status(tauri::http::StatusCode::OK)
                            .header("content-length", bytes.len().to_string());
                    }

                    response_builder.body(bytes).unwrap()
                }
                Err(e) => tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                    .body(e.into_bytes())
                    .unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            cmd_plugin_db_execute,
            cmd_plugin_db_query,
            cmd_plugin_vfs_list,
            cmd_add_source,
            cmd_get_sources,
            cmd_remove_source,
            cmd_get_bento_stats,
            cmd_search_files,
            cmd_list_dir,
            cmd_trigger_scan,
            cmd_file_delete,
            cmd_file_rename,
            cmd_file_mkdir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
