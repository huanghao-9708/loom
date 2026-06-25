use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

// ==========================================
// Registry 数据结构（对应 registry/plugins.json）
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryIndex {
    #[serde(rename = "registryVersion")]
    pub registry_version: i32,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub plugins: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub version: String,
    #[serde(rename = "iconUrl", default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    #[serde(rename = "sha256")]
    pub sha256: String,
    #[serde(rename = "minAppVersion", default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub permissions: Option<PluginPermissionDecl>,
}

/// Registry 条目中声明的权限摘要（仅用于安装前展示，实际鉴权仍以 manifest.json 为准）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginPermissionDecl {
    #[serde(default)]
    pub vfs: Option<Vec<String>>,
    #[serde(default)]
    pub db: Option<bool>,
    #[serde(default)]
    pub net: Option<Vec<String>>,
}

// ==========================================
// Marketplace 核心服务
// ==========================================

/// 官方 Registry 的 raw 地址（托管于 GitHub）。
/// 通过环境变量 LOOM_REGISTRY_URL 可覆盖，便于开发期联调自建 Registry。
fn registry_url() -> String {
    std::env::var("LOOM_REGISTRY_URL").unwrap_or_else(|_| {
        "https://raw.githubusercontent.com/huanghao-9708/loom-plugins-registry/main/plugins.json".to_string()
    })
}

/// 拉取 Registry 总索引。
/// 成功后写入本地缓存 `~/.loom/.cache/registry.json`，断网时回退读取缓存。
pub async fn fetch_registry(base_dir: &PathBuf) -> Result<RegistryIndex, String> {
    let cache_path = base_dir.join(".cache").join("registry.json");

    // 先尝试在线拉取
    match fetch_registry_online().await {
        Ok(index) => {
            // 持久化缓存（失败不影响主流程）
            if let Ok(json) = serde_json::to_string_pretty(&index) {
                let _ = tokio::fs::create_dir_all(cache_path.parent().unwrap()).await;
                let _ = tokio::fs::write(&cache_path, json).await;
            }
            Ok(index)
        }
        Err(online_err) => {
            // 在线失败 → 回退本地缓存（离线可用）
            match tokio::fs::read_to_string(&cache_path).await {
                Ok(cached) => {
                    serde_json::from_str::<RegistryIndex>(&cached).map_err(|e| {
                        format!(
                            "在线拉取失败（{}）且本地缓存解析失败：{}",
                            online_err, e
                        )
                    })
                }
                Err(_) => Err(format!(
                    "无法连接 Registry 且无本地缓存可用：{}",
                    online_err
                )),
            }
        }
    }
}

async fn fetch_registry_online() -> Result<RegistryIndex, String> {
    let client = reqwest::Client::builder()
        .user_agent("Loom-Client")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败：{}", e))?;

    let resp = client
        .get(registry_url())
        .send()
        .await
        .map_err(|e| format!("请求 Registry 失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Registry 返回非成功状态码：{}", resp.status()));
    }

    resp.json::<RegistryIndex>()
        .await
        .map_err(|e| format!("解析 Registry 响应失败：{}", e))
}

/// 流式下载 `.loom` 包到临时目录，并通过 Tauri Event 上报下载进度。
/// 下载完成后立即校验 SHA-256，不符则删除文件并返回错误。
///
/// 成功时返回本地临时文件路径。
pub async fn download_with_progress(
    app: &AppHandle,
    base_dir: &PathBuf,
    plugin_id: &str,
    download_url: &str,
    expected_sha256: &str,
) -> Result<PathBuf, String> {
    let client = reqwest::Client::builder()
        .user_agent("Loom-Client")
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败：{}", e))?;

    let resp = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("下载失败，HTTP 状态码：{}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);

    let cache_dir = base_dir.join(".cache");
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("创建缓存目录失败：{}", e))?;

    let tmp_path = cache_dir.join(format!("{}.loom", plugin_id));

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("创建临时文件失败：{}", e))?;

    use tokio::io::AsyncWriteExt;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("读取下载数据流失败：{}", e))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入临时文件失败：{}", e))?;
        received += chunk.len() as u64;

        // 上报进度（每收到一段数据触发一次事件）
        let _ = app.emit(
            "download-progress",
            serde_json::json!({
                "id": plugin_id,
                "received": received,
                "total": total,
            }),
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("刷新临时文件失败：{}", e))?;
    drop(file);

    // SHA-256 校验
    let actual_hash = format!("{:x}", hasher.finalize());
    if !actual_hash.eq_ignore_ascii_case(expected_sha256) {
        // 校验失败：删除已下载文件，避免残留
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(format!(
            "SHA-256 校验失败：期望 {}，实际 {}。已删除损坏的下载文件。",
            expected_sha256, actual_hash
        ));
    }

    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": plugin_id,
            "received": received,
            "total": total,
            "verified": true,
        }),
    );

    Ok(tmp_path)
}

// ==========================================
// 版本比对与更新检测 (Sprint 2)
// ==========================================

/// 解析 "1.2.3" 为 (1, 2, 3) 元组。非法格式返回 (0, 0, 0)。
fn parse_semver(version: &str) -> (u32, u32, u32) {
    let parts: Vec<u32> = version
        .split('.')
        .filter_map(|s| s.parse::<u32>().ok())
        .collect();
    match parts.as_slice() {
        [major, minor, patch] => (*major, *minor, *patch),
        [major, minor] => (*major, *minor, 0),
        [major] => (*major, 0, 0),
        _ => (0, 0, 0),
    }
}

/// 判断 `remote` 版本是否高于 `local` 版本。
pub fn is_newer(remote: &str, local: &str) -> bool {
    let (rmaj, rmin, rpat) = parse_semver(remote);
    let (lmaj, lmin, lpat) = parse_semver(local);
    (rmaj, rmin, rpat) > (lmaj, lmin, lpat)
}

/// 更新可用信息，供前端渲染「有更新」徽标和「更新到 vX.Y.Z」按钮。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub id: String,
    pub current_version: String,
    pub latest_version: String,
    pub description: Option<String>,
    pub download_url: String,
    pub sha256: String,
    pub changelog: Option<String>,
}

/// 对比 Registry 与本地已安装列表，返回所有可更新的插件。
pub fn check_updates(
    registry: &RegistryIndex,
    installed: &[crate::plugin_mgr::PluginManifest],
) -> Vec<UpdateInfo> {
    let mut updates = Vec::new();

    for entry in &registry.plugins {
        // 在已安装列表中查找同 id 插件
        if let Some(local) = installed.iter().find(|p| p.id == entry.id) {
            if is_newer(&entry.version, &local.version) {
                updates.push(UpdateInfo {
                    id: entry.id.clone(),
                    current_version: local.version.clone(),
                    latest_version: entry.version.clone(),
                    description: entry.description.clone(),
                    download_url: entry.download_url.clone(),
                    sha256: entry.sha256.clone(),
                    changelog: None, // 需拉取详情文件才能填充，暂留空
                });
            }
        }
    }

    updates
}
