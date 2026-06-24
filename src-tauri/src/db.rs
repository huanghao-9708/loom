use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::fs;
use std::path::Path;

#[derive(Clone)]
pub struct DbManager {
    pub pool: SqlitePool,
}

impl DbManager {
    /// 初始化并连接到 SQLite 数据库，运行建表脚本
    pub async fn init(db_path: &Path) -> Result<Self, sqlx::Error> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(sqlx::Error::Io)?;
        }

        // 使用 sqlite: 前缀构建连接串
        let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

        // 创建数据库连接池
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await?;

        let manager = Self { pool };
        manager.run_migrations().await?;

        Ok(manager)
    }

    /// 执行建表与 FTS5 虚表及触发器初始化
    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        // 1. 数据源配置表
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sources (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                kind        TEXT NOT NULL,        -- local | webdav | plugin
                name        TEXT NOT NULL,
                config_json TEXT NOT NULL,        -- 加密或序列化的配置 (URL, Token, username 等)
                status      TEXT NOT NULL,        -- connected | offline | error
                created_at  TEXT NOT NULL
            );",
        )
        .execute(&self.pool)
        .await?;

        // 2. 统一虚拟文件缓存索引表
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS files (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id   INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                vpath       TEXT NOT NULL,        -- VFS 虚拟路径，格式：/source_id/path/to/file
                name        TEXT NOT NULL,
                ext         TEXT,
                category    TEXT,                 -- image | audio | video | doc | other
                size_bytes  INTEGER,
                is_dir      INTEGER NOT NULL,     -- 0 / 1
                mtime       TEXT,                 -- ISO8601 修改时间
                scanned_at  TEXT NOT NULL,
                parent_vpath TEXT NOT NULL DEFAULT '',
                UNIQUE(source_id, vpath)
            );",
        )
        .execute(&self.pool)
        .await?;

        // 3. 磁盘容量快照看板直读表
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS disk_usage (
                source_id   INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
                total_bytes INTEGER,
                used_bytes  INTEGER,
                free_bytes  INTEGER,
                item_count  INTEGER,
                updated_at  TEXT NOT NULL
            );",
        )
        .execute(&self.pool)
        .await?;

        // 4. 插件元数据注册表
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS plugins (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                version        TEXT NOT NULL,
                enabled        INTEGER NOT NULL,     -- 0 / 1
                data_dir       TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 0,
                manifest       TEXT NOT NULL
            );",
        )
        .execute(&self.pool)
        .await?;

        // 5. 初始化 FTS5 全文搜索虚表与触发器 (如虚表不存在则创建)
        let fts_check =
            sqlx::query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='files_fts';")
                .fetch_optional(&self.pool)
                .await?;

        if fts_check.is_none() {
            sqlx::query(
                "CREATE VIRTUAL TABLE files_fts USING fts5(
                    name, 
                    content='files', 
                    content_rowid='id'
                );",
            )
            .execute(&self.pool)
            .await?;

            // 当插入新文件时自动同步到全文检索
            sqlx::query(
                "CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
                    INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
                END;",
            )
            .execute(&self.pool)
            .await?;

            // 当删除文件时自动同步清理全文检索
            sqlx::query(
                "CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
                    INSERT INTO files_fts(files_fts, rowid, name) VALUES('delete', old.id, old.name);
                END;"
            )
            .execute(&self.pool)
            .await?;

            // 当更新文件名时自动同步全文检索
            sqlx::query(
                "CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
                    INSERT INTO files_fts(files_fts, rowid, name) VALUES('delete', old.id, old.name);
                    INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
                END;"
            )
            .execute(&self.pool)
            .await?;
        }

        // 尝试向后兼容地添加 parent_vpath 列（若已存在则忽略报错）
        let _ = sqlx::query("ALTER TABLE files ADD COLUMN parent_vpath TEXT NOT NULL DEFAULT '';")
            .execute(&self.pool)
            .await;

        // 建立 parent_vpath 联合索引以支持真正的 O(1) 父目录查询
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_parent ON files(source_id, parent_vpath);")
            .execute(&self.pool)
            .await?;

        // 4. 插件注册表（用于在主库中记录已经挂载的第三方沙盒信息）
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS plugins (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                version        TEXT NOT NULL,
                enabled        INTEGER NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 0,
                manifest       TEXT NOT NULL
            );"
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ==========================================
    // DAO 方法实现
    // ==========================================

    /// 添加新数据源连接
    pub async fn add_source(
        &self,
        kind: &str,
        name: &str,
        config_json: &str,
    ) -> Result<i32, sqlx::Error> {
        let created_at = chrono::Utc::now().to_rfc3339();
        let res = sqlx::query(
            "INSERT INTO sources (kind, name, config_json, status, created_at)
             VALUES (?, ?, ?, 'connected', ?);",
        )
        .bind(kind)
        .bind(name)
        .bind(config_json)
        .bind(created_at)
        .execute(&self.pool)
        .await?;

        Ok(res.last_insert_rowid() as i32)
    }

    /// 获取所有配置的数据源
    pub async fn get_sources(&self) -> Result<Vec<SourceRecord>, sqlx::Error> {
        let records = sqlx::query_as::<_, SourceRecord>("SELECT * FROM sources;")
            .fetch_all(&self.pool)
            .await?;
        Ok(records)
    }

    /// 根据 ID 获取单个数据源
    pub async fn get_source(&self, id: i32) -> Result<SourceRecord, sqlx::Error> {
        let record = sqlx::query_as::<_, SourceRecord>("SELECT * FROM sources WHERE id = ?;")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        Ok(record)
    }

    /// 删除指定数据源 (级联删除其下的所有 files 缓存)
    pub async fn remove_source(&self, id: i32) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM sources WHERE id = ?;")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 根据父目录的 vpath 获取其直属一级的子文件/子目录记录
    pub async fn get_files_in_dir(
        &self,
        source_id: i32,
        parent_vpath: &str,
    ) -> Result<Vec<FileRecord>, sqlx::Error> {
        let target_parent = if parent_vpath.is_empty() || parent_vpath == "/" {
            "/"
        } else {
            parent_vpath.trim_end_matches('/')
        };

        // 直接走 source_id 和 parent_vpath 联合索引，彻底实现 O(1) 量级的查询，规避全表扫描
        let filtered = sqlx::query_as::<_, FileRecord>(
            "SELECT * FROM files WHERE source_id = ? AND parent_vpath = ?;"
        )
        .bind(source_id)
        .bind(target_parent)
        .fetch_all(&self.pool)
        .await?;

        Ok(filtered)
    }

    /// 批量插入/更新文件记录到 SQLite 缓存中 (增量同步)
    pub async fn insert_file_records(&self, records: Vec<FileInsert>) -> Result<(), sqlx::Error> {
        if records.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await?;
        let scanned_at = chrono::Utc::now().to_rfc3339();

        for r in records {
            let parent_vpath = if r.vpath == "/" || r.vpath.is_empty() {
                "".to_string()
            } else {
                let trimmed = r.vpath.trim_end_matches('/');
                if let Some(idx) = trimmed.rfind('/') {
                    if idx == 0 { "/".to_string() } else { trimmed[..idx].to_string() }
                } else {
                    "/".to_string()
                }
            };

            sqlx::query(
                "INSERT INTO files (source_id, vpath, parent_vpath, name, ext, category, size_bytes, is_dir, mtime, scanned_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(source_id, vpath) DO UPDATE SET
                    parent_vpath = excluded.parent_vpath,
                    name = excluded.name,
                    ext = excluded.ext,
                    category = excluded.category,
                    size_bytes = excluded.size_bytes,
                    is_dir = excluded.is_dir,
                    mtime = excluded.mtime,
                    scanned_at = excluded.scanned_at;"
            )
            .bind(r.source_id)
            .bind(r.vpath)
            .bind(parent_vpath)
            .bind(r.name)
            .bind(r.ext)
            .bind(r.category)
            .bind(r.size_bytes.map(|s| s as i64))
            .bind(if r.is_dir { 1 } else { 0 })
            .bind(r.mtime)
            .bind(&scanned_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// 全文搜索文件名 (基于 FTS5)
    pub async fn search_files(&self, query: &str) -> Result<Vec<FileRecord>, sqlx::Error> {
        let fts_query = format!("*{}*", query.replace('"', "\"\""));
        let records = sqlx::query_as::<_, FileRecord>(
            "SELECT f.* FROM files f
             JOIN files_fts fts ON f.id = fts.rowid
             WHERE files_fts MATCH ?;",
        )
        .bind(&fts_query)
        .fetch_all(&self.pool)
        .await?;
        Ok(records)
    }

    /// 获取 Bento 便当盒统计看板数据
    pub async fn get_bento_stats(&self) -> Result<BentoStats, sqlx::Error> {
        // 1. 获取所有类别的最近 50 个最新文件变动
        let recent = sqlx::query_as::<_, FileRecord>(
            "SELECT * FROM files WHERE is_dir = 0 ORDER BY mtime DESC LIMIT 50;",
        )
        .fetch_all(&self.pool)
        .await?;

        // 2. 按文件大类分类，统计文件数量与总大小 (使用 UNION ALL 将文件夹 count 统一查出)
        let category_distribution = sqlx::query_as::<_, CategoryStats>(
            "SELECT category, COUNT(*) as count, SUM(COALESCE(size_bytes, 0)) as total_size
             FROM files WHERE is_dir = 0 GROUP BY category
             UNION ALL
             SELECT 'folder' as category, COUNT(*) as count, 0 as total_size
             FROM files WHERE is_dir = 1;",
        )
        .fetch_all(&self.pool)
        .await?;

        // 3. 统计每个连接数据源的已用空间与总文件数
        let source_statistics = sqlx::query_as::<_, SourceSizeStats>(
            "SELECT s.id as source_id, s.name as source_name, 
                    SUM(COALESCE(f.size_bytes, 0)) as total_size,
                    COUNT(f.id) as file_count
             FROM sources s
             LEFT JOIN files f ON s.id = f.source_id AND f.is_dir = 0
             GROUP BY s.id;",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(BentoStats {
            recent,
            category_distribution,
            source_statistics,
        })
    }
}

// ==========================================
// 数据实体对象模型定义
// ==========================================

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct SourceRecord {
    pub id: i32,
    pub kind: String,
    pub name: String,
    pub config_json: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct FileRecord {
    pub id: i32,
    pub source_id: i32,
    pub vpath: String,
    pub name: String,
    pub ext: Option<String>,
    pub category: Option<String>,
    pub size_bytes: Option<i64>,
    pub is_dir: i32,
    pub mtime: Option<String>,
    pub scanned_at: String,
}

pub struct FileInsert {
    pub source_id: i32,
    pub vpath: String,
    pub name: String,
    pub ext: Option<String>,
    pub category: String,
    pub size_bytes: Option<u64>,
    pub is_dir: bool,
    pub mtime: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct CategoryStats {
    pub category: Option<String>,
    pub count: i32,
    pub total_size: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct SourceSizeStats {
    pub source_id: i32,
    pub source_name: String,
    pub total_size: i64,
    pub file_count: i32,
    #[sqlx(default)]
    pub physical_capacity: Option<u64>,
}

#[derive(serde::Serialize)]
pub struct BentoStats {
    pub recent: Vec<FileRecord>,
    pub category_distribution: Vec<CategoryStats>,
    pub source_statistics: Vec<SourceSizeStats>,
}
