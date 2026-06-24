use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs as tokio_fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsEntry {
    pub name: String,
    pub vpath: String, // 相对当前数据源根目录的路径，例如 /Folder/file.mp3
    pub size_bytes: Option<u64>,
    pub is_dir: bool,
    pub mtime: Option<String>, // ISO8601 格式
    pub ext: Option<String>,
    pub category: String, // image | audio | video | doc | other
}

#[derive(Debug, Serialize, Deserialize)]
pub enum VfsError {
    Io(String),
    Network(String),
    XmlParse(String),
    Database(String),
    NotFound,
    Unauthorized,
    Unknown(String),
}

impl std::fmt::Display for VfsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VfsError::Io(e) => write!(f, "IO Error: {}", e),
            VfsError::Network(s) => write!(f, "Network Error: {}", s),
            VfsError::XmlParse(s) => write!(f, "XML Parser Error: {}", s),
            VfsError::Database(s) => write!(f, "Database Error: {}", s),
            VfsError::NotFound => write!(f, "File not found"),
            VfsError::Unauthorized => write!(f, "Unauthorized access (401)"),
            VfsError::Unknown(s) => write!(f, "Unknown error: {}", s),
        }
    }
}

impl std::error::Error for VfsError {}

impl From<std::io::Error> for VfsError {
    fn from(err: std::io::Error) -> Self {
        VfsError::Io(err.to_string())
    }
}

/// 根据扩展名智能检测文件大类
pub fn detect_category(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" => "image",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => "audio",
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "3gp" => "video",
        "pdf" | "txt" | "md" | "epub" | "docx" | "xlsx" | "pptx" | "json" | "xml" | "html" => "doc",
        "zip" | "rar" | "7z" | "tar" | "gz" | "zipx" => "archive",
        _ => "other",
    }
}

/// 统一数据源异步操作接口
#[async_trait]
pub trait VfsSource: Send + Sync {
    async fn list_dir(&self, path: &str) -> Result<Vec<VfsEntry>, VfsError>;
    async fn read_file(&self, path: &str) -> Result<Vec<u8>, VfsError>;
    async fn read_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, VfsError>;
    async fn get_size(&self, path: &str) -> Result<u64, VfsError>;
    async fn get_capacity(&self) -> Result<Option<u64>, VfsError>;
    async fn delete(&self, path: &str) -> Result<(), VfsError>;
    async fn rename(&self, path: &str, new_name: &str) -> Result<(), VfsError>;
    async fn mkdir(&self, path: &str) -> Result<(), VfsError>;
}

// ==========================================
// 1. 本地磁盘数据源实现 (LocalSource)
// ==========================================

pub struct LocalSource {
    pub root_path: PathBuf,
}

impl LocalSource {
    pub fn new(root_path: PathBuf) -> Self {
        Self { root_path }
    }

    fn resolve(&self, path: &str) -> PathBuf {
        let cleaned = path.trim_start_matches('/');
        self.root_path.join(cleaned)
    }
}

#[async_trait]
impl VfsSource for LocalSource {
    async fn list_dir(&self, path: &str) -> Result<Vec<VfsEntry>, VfsError> {
        let full_path = self.resolve(path);
        let mut entries = Vec::new();

        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }

        let mut dir = tokio_fs::read_dir(&full_path).await?;

        while let Some(entry) = dir.next_entry().await? {
            let meta = entry.metadata().await?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = meta.is_dir();
            let size_bytes = if is_dir { None } else { Some(meta.len()) };

            let mtime = meta.modified().ok().and_then(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                Some(datetime.to_rfc3339())
            });

            let ext = entry
                .path()
                .extension()
                .map(|e| e.to_string_lossy().to_string());
            let category = ext
                .as_ref()
                .map(|e| detect_category(e))
                .unwrap_or("other")
                .to_string();

            let relative_path = if path.is_empty() || path == "/" {
                format!("/{}", name)
            } else {
                format!("{}/{}", path.trim_end_matches('/'), name)
            };

            entries.push(VfsEntry {
                name,
                vpath: relative_path,
                size_bytes,
                is_dir,
                mtime,
                ext,
                category,
            });
        }

        Ok(entries)
    }

    async fn read_file(&self, path: &str) -> Result<Vec<u8>, VfsError> {
        let full_path = self.resolve(path);
        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }
        let data = tokio_fs::read(full_path).await?;
        Ok(data)
    }

    async fn read_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, VfsError> {
        let full_path = self.resolve(path);
        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }
        let mut file = tokio_fs::File::open(full_path).await?;
        file.seek(SeekFrom::Start(start)).await?;

        let mut buffer = vec![0u8; length as usize];
        let bytes_read = file.read(&mut buffer).await?;
        buffer.truncate(bytes_read);
        Ok(buffer)
    }

    async fn get_size(&self, path: &str) -> Result<u64, VfsError> {
        let full_path = self.resolve(path);
        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }
        let meta = tokio_fs::metadata(full_path).await?;
        Ok(meta.len())
    }

    async fn get_capacity(&self) -> Result<Option<u64>, VfsError> {
        use sysinfo::Disks;
        let disks = Disks::new_with_refreshed_list();
        
        let mut best_match: Option<u64> = None;
        let mut max_len = 0;
        
        // 跨平台统一将反斜杠转为正斜杠进行匹配比对
        let root_str = self.root_path.to_string_lossy().to_string().replace('\\', "/");
        
        for disk in disks.list() {
            let mount_point = disk.mount_point().to_string_lossy().to_string().replace('\\', "/");
            // 大小写不敏感匹配 (Windows 经常大小写混杂)
            if root_str.to_lowercase().starts_with(&mount_point.to_lowercase()) {
                if mount_point.len() > max_len {
                    max_len = mount_point.len();
                    best_match = Some(disk.total_space());
                }
            }
        }
        
        Ok(best_match)
    }

    async fn delete(&self, path: &str) -> Result<(), VfsError> {
        let full_path = self.resolve(path);
        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }
        let meta = tokio_fs::metadata(&full_path).await?;
        if meta.is_dir() {
            tokio_fs::remove_dir_all(&full_path).await?;
        } else {
            tokio_fs::remove_file(&full_path).await?;
        }
        Ok(())
    }

    async fn rename(&self, path: &str, new_name: &str) -> Result<(), VfsError> {
        let full_path = self.resolve(path);
        if !full_path.exists() {
            return Err(VfsError::NotFound);
        }
        let parent = full_path.parent().ok_or_else(|| VfsError::Io("Cannot rename root".to_string()))?;
        let new_full_path = parent.join(new_name);
        tokio_fs::rename(&full_path, &new_full_path).await?;
        Ok(())
    }

    async fn mkdir(&self, path: &str) -> Result<(), VfsError> {
        let full_path = self.resolve(path);
        tokio_fs::create_dir_all(&full_path).await?;
        Ok(())
    }
}

// ==========================================
// 2. WebDAV 云存储数据源实现 (WebdavSource)
// ==========================================

pub struct WebdavSource {
    pub url: String,
    pub username: String,
    pub token: String,
    client: reqwest::Client,
}

impl WebdavSource {
    pub fn new(url: String, username: String, token: String) -> Self {
        let client = reqwest::Client::new();
        Self {
            url,
            username,
            token,
            client,
        }
    }

    /// 安全地拼接并进行 URL 转义
    fn build_url(&self, path: &str) -> Result<reqwest::Url, VfsError> {
        let base_url = reqwest::Url::parse(&self.url)
            .map_err(|e| VfsError::Network(format!("Invalid base WebDAV URL: {}", e)))?;
        let cleaned_path = path.trim_start_matches('/');

        let mut url = base_url;
        for segment in cleaned_path.split('/') {
            if !segment.is_empty() {
                url = url
                    .join(&format!("{}/", segment))
                    .map_err(|e| VfsError::Network(format!("URL path join failed: {}", e)))?;
            }
        }

        if !path.ends_with('/') && url.as_str().ends_with('/') {
            let mut s = url.to_string();
            s.pop();
            url = reqwest::Url::parse(&s)
                .map_err(|e| VfsError::Network(format!("URL ending fix failed: {}", e)))?;
        }

        Ok(url)
    }
}

#[async_trait]
impl VfsSource for WebdavSource {
    async fn list_dir(&self, path: &str) -> Result<Vec<VfsEntry>, VfsError> {
        let request_url = self.build_url(path)?;

        // 发送 WebDAV PROPFIND 请求
        let response = self
            .client
            .request(
                reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
                request_url,
            )
            .basic_auth(&self.username, Some(&self.token))
            .header("Depth", "1")
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() {
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err(VfsError::Unauthorized);
            }
            return Err(VfsError::Network(format!(
                "WebDAV Server returned: {}",
                response.status()
            )));
        }

        let body = response
            .text()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        let raw_entries = parse_webdav_xml(&body)?;

        let mut entries = Vec::new();
        // 坚果云请求路径包含 URL 编码，解码出来便于比对
        let decoded_path_target = percent_decode_str(path)?
            .trim_end_matches('/')
            .to_lowercase();

        for raw in raw_entries {
            let decoded_href = percent_decode_str(&raw.href)?;

            // 提取文件名
            let name = decoded_href
                .trim_end_matches('/')
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();

            if name.is_empty() {
                continue;
            }

            // 过滤掉查询目标目录自身
            let cleaned_href = decoded_href.trim_end_matches('/').to_lowercase();
            // 在坚果云中，href 可能会带前缀 "/dav/"，需要比对尾部是否与目标重合
            if cleaned_href.ends_with(&decoded_path_target)
                && (cleaned_href.len() == decoded_path_target.len()
                    || cleaned_href
                        .chars()
                        .nth(cleaned_href.len() - decoded_path_target.len() - 1)
                        == Some('/'))
            {
                continue;
            }

            let ext = name
                .split('.')
                .last()
                .filter(|&e| e != &name)
                .map(|e| e.to_string());
            let category = ext
                .as_ref()
                .map(|e| detect_category(e))
                .unwrap_or("other")
                .to_string();

            let relative_path = if path.is_empty() || path == "/" {
                format!("/{}", name)
            } else {
                format!("{}/{}", path.trim_end_matches('/'), name)
            };

            entries.push(VfsEntry {
                name,
                vpath: relative_path,
                size_bytes: raw.size,
                is_dir: raw.is_dir,
                mtime: raw.mtime,
                ext,
                category,
            });
        }

        Ok(entries)
    }

    async fn read_file(&self, path: &str) -> Result<Vec<u8>, VfsError> {
        let request_url = self.build_url(path)?;
        let response = self
            .client
            .get(request_url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(VfsError::Network(format!(
                "Failed to read WebDAV file: {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;
        Ok(bytes.to_vec())
    }

    async fn read_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, VfsError> {
        if length == 0 {
            return Ok(Vec::new());
        }
        let request_url = self.build_url(path)?;
        let end = start + length - 1;
        let response = self
            .client
            .get(request_url)
            .basic_auth(&self.username, Some(&self.token))
            .header("Range", format!("bytes={}-{}", start, end))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            return Err(VfsError::Network(format!(
                "Failed WebDAV Range read: {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;
        Ok(bytes.to_vec())
    }

    async fn get_size(&self, path: &str) -> Result<u64, VfsError> {
        let request_url = self.build_url(path)?;
        let response = self
            .client
            .head(request_url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(VfsError::Network(format!(
                "Failed WebDAV HEAD: {}",
                response.status()
            )));
        }

        let size = response
            .headers()
            .get("content-length")
            .and_then(|val| val.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        Ok(size)
    }

    async fn get_capacity(&self) -> Result<Option<u64>, VfsError> {
        // 大多数 WebDAV（包括坚果云）并不支持标准的 quota 探测协议。
        // 为保证看板高并发快速渲染，对于 WebDAV 我们优雅降级返回 None，前端将回退至相对占比模式。
        Ok(None)
    }

    async fn delete(&self, path: &str) -> Result<(), VfsError> {
        let request_url = self.build_url(path)?;
        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"DELETE").unwrap(), request_url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(VfsError::Network(format!("WebDAV DELETE Failed: {}", response.status())));
        }
        Ok(())
    }

    async fn rename(&self, path: &str, new_name: &str) -> Result<(), VfsError> {
        let source_url = self.build_url(path)?;
        
        let cleaned_path = path.trim_end_matches('/');
        let parent_path = if let Some(idx) = cleaned_path.rfind('/') {
            &cleaned_path[..idx]
        } else {
            "" 
        };
        
        let dest_path = if parent_path.is_empty() {
            format!("/{}", new_name)
        } else {
            format!("{}/{}", parent_path, new_name)
        };
        
        let dest_url = self.build_url(&dest_path)?;

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"MOVE").unwrap(), source_url)
            .header("Destination", dest_url.as_str())
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() && response.status() != reqwest::StatusCode::CREATED {
            return Err(VfsError::Network(format!("WebDAV MOVE Failed: {}", response.status())));
        }
        Ok(())
    }

    async fn mkdir(&self, path: &str) -> Result<(), VfsError> {
        let request_url = self.build_url(path)?;
        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), request_url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| VfsError::Network(e.to_string()))?;

        if !response.status().is_success() && response.status() != reqwest::StatusCode::CREATED {
            return Err(VfsError::Network(format!("WebDAV MKCOL Failed: {}", response.status())));
        }
        Ok(())
    }
}

// ==========================================
// 3. 辅助功能 (XML & Percent Decoding)
// ==========================================

#[derive(Default)]
struct WebdavRawEntry {
    href: String,
    size: Option<u64>,
    is_dir: bool,
    mtime: Option<String>,
}

/// 健壮的 XML 207 响应解析器，基于 Reader 保证忽略 XML namespace 前缀差异的健壮性
fn parse_webdav_xml(xml: &str) -> Result<Vec<WebdavRawEntry>, VfsError> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut entries = Vec::new();
    let mut current_entry: Option<WebdavRawEntry> = None;
    let mut current_tag = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                let full_tag = String::from_utf8_lossy(name.as_ref());
                let tag_name = full_tag.split(':').last().unwrap_or(&full_tag).to_lowercase();
                current_tag = tag_name.clone();

                if tag_name == "response" {
                    current_entry = Some(WebdavRawEntry::default());
                } else if tag_name == "collection" {
                    if let Some(ref mut entry) = current_entry {
                        entry.is_dir = true;
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                // 处理诸如 <d:collection/> 这种自闭合标签
                let name = e.name();
                let full_tag = String::from_utf8_lossy(name.as_ref());
                let tag_name = full_tag.split(':').last().unwrap_or(&full_tag).to_lowercase();
                
                if tag_name == "collection" {
                    if let Some(ref mut entry) = current_entry {
                        entry.is_dir = true;
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.name();
                let full_tag = String::from_utf8_lossy(name.as_ref());
                let tag_name = full_tag.split(':').last().unwrap_or(&full_tag).to_lowercase();
                if tag_name == "response" {
                    if let Some(entry) = current_entry.take() {
                        entries.push(entry);
                    }
                }
                current_tag.clear();
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map(|c| c.into_owned()).unwrap_or_default();
                if let Some(ref mut entry) = current_entry {
                    match current_tag.as_str() {
                        "href" => {
                            entry.href = text;
                        }
                        "getcontentlength" => {
                            entry.size = text.parse::<u64>().ok();
                        }
                        "getlastmodified" => {
                            // 坚果云等会返回 rfc2822 时间，转换到 rfc3339 标准格式
                            if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(&text) {
                                entry.mtime = Some(dt.to_rfc3339());
                            } else {
                                entry.mtime = Some(text);
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(VfsError::XmlParse(format!("XML parse error: {}", e))),
            _ => {}
        }
    }

    Ok(entries)
}

/// 纯手写百分号 URL 解码器，实现零依赖的健壮 URL 解码
fn percent_decode_str(s: &str) -> Result<String, VfsError> {
    let mut bytes = Vec::new();
    let mut chars = s.as_bytes().iter().peekable();

    while let Some(&b) = chars.next() {
        if b == b'%' {
            let h1 = chars
                .next()
                .ok_or_else(|| VfsError::XmlParse("Malformed URL percent-encoding".to_string()))?;
            let h2 = chars
                .next()
                .ok_or_else(|| VfsError::XmlParse("Malformed URL percent-encoding".to_string()))?;
            let hex = format!("{}{}", *h1 as char, *h2 as char);
            let decoded_byte = u8::from_str_radix(&hex, 16).map_err(|e| {
                VfsError::XmlParse(format!("Failed to parse hex byte in URL: {}", e))
            })?;
            bytes.push(decoded_byte);
        } else {
            bytes.push(b);
        }
    }

    String::from_utf8(bytes)
        .map_err(|e| VfsError::XmlParse(format!("URL UTF-8 decoding error: {}", e)))
}
