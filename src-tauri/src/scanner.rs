use std::sync::Arc;
use tokio::sync::mpsc;
use crate::vfs::{VfsSource, VfsError, VfsEntry};
use crate::db::{DbManager, FileInsert};

pub struct Scanner {
    db: DbManager,
}

impl Scanner {
    pub fn new(db: DbManager) -> Self {
        Self { db }
    }

    /// 触发指定数据源的后台增量文件扫描任务
    pub async fn scan_source(
        &self,
        source_id: i32,
        source: Arc<dyn VfsSource>,
        is_webdav: bool,
    ) -> Result<(), String> {
        // 创建用于解耦遍历线程与数据库写入线程的 Channel
        let (tx, mut rx) = mpsc::channel::<Vec<FileInsert>>(100);
        let db_clone = self.db.clone();

        // 1. 开启一个后台 DB 写入任务，采用 Transaction 批量写入
        let db_writer_handle = tokio::spawn(async move {
            let mut total_count = 0;
            let mut total_bytes = 0u64;

            while let Some(batch) = rx.recv().await {
                for r in &batch {
                    if !r.is_dir {
                        total_count += 1;
                        total_bytes += r.size_bytes.unwrap_or(0);
                    }
                }
                if let Err(e) = db_clone.insert_file_records(batch).await {
                    eprintln!("[Scanner Error] Failed to write batch: {}", e);
                }
            }
            (total_count, total_bytes)
        });

        // 2. 在当前线程递归遍历文件源
        let scan_res = self.recursive_scan(source_id, "/", source.as_ref(), is_webdav, 0, &tx).await;

        // 关闭通道发送端，使写入端退出循环并提交
        drop(tx);

        let (total_count, total_bytes) = db_writer_handle.await.map_err(|e| e.to_string())?;

        if let Err(e) = scan_res {
            return Err(format!("Scanning VFS failed: {}", e));
        }

        // 3. 统计该数据源的已用空间，快速同步写入到 disk_usage 表中
        let updated_at = chrono::Utc::now().to_rfc3339();
        let pool = &self.db.pool;
        
        let _ = sqlx::query(
            "INSERT INTO disk_usage (source_id, total_bytes, used_bytes, free_bytes, item_count, updated_at)
             VALUES (?, 0, ?, 0, ?, ?)
             ON CONFLICT(source_id) DO UPDATE SET
                used_bytes = excluded.used_bytes,
                item_count = excluded.item_count,
                updated_at = excluded.updated_at;"
        )
        .bind(source_id)
        .bind(total_bytes as i64)
        .bind(total_count as i32)
        .bind(updated_at)
        .execute(pool)
        .await;

        Ok(())
    }

    /// 递归遍历文件源。如果是 WebDAV，限制深度不得超过 3 (0-indexed: 0, 1, 2)
    async fn recursive_scan(
        &self,
        source_id: i32,
        current_path: &str,
        source: &dyn VfsSource,
        is_webdav: bool,
        current_depth: usize,
        tx: &mpsc::Sender<Vec<FileInsert>>,
    ) -> Result<(), VfsError> {
        // 如果是 WebDAV 且深度达到 3 (只扫描前 3 级目录：根目录 / 深度 0, 一级子目录 1, 二级子目录 2)
        if is_webdav && current_depth >= 3 {
            return Ok(());
        }

        let entries = match source.list_dir(current_path).await {
            Ok(list) => list,
            Err(e) => {
                // 如果是未授权或无法连接，向上层抛出；如果是其他临时目录失败，则跳过并继续，保障鲁棒性
                if matches!(e, VfsError::Unauthorized) {
                    return Err(e);
                }
                eprintln!("[Scanner Warning] Skip listing path '{}' due to: {}", current_path, e);
                return Ok(());
            }
        };

        if entries.is_empty() {
            return Ok(());
        }

        let mut insert_batch = Vec::new();
        let mut subdirs = Vec::new();

        for entry in entries {
            let relative_vpath = entry.vpath.clone();
            
            insert_batch.push(FileInsert {
                source_id,
                vpath: relative_vpath.clone(),
                name: entry.name,
                ext: entry.ext,
                category: entry.category,
                size_bytes: entry.size_bytes,
                is_dir: entry.is_dir,
                mtime: entry.mtime,
            });

            if entry.is_dir {
                subdirs.push(relative_vpath);
            }
        }

        // 发送当前目录层级的批次文件记录到数据库异步写入任务中
        if tx.send(insert_batch).await.is_err() {
            return Err(VfsError::Unknown("Database writer channel is broken".to_string()));
        }

        // 深度递归子目录
        for subdir in subdirs {
            // 对子目录执行递归遍历，深度自增
            let res = Box::pin(self.recursive_scan(
                source_id, 
                &subdir, 
                source, 
                is_webdav, 
                current_depth + 1, 
                tx
            )).await;

            if let Err(e) = res {
                eprintln!("[Scanner Warning] Failed to scan sub-directory '{}': {}", subdir, e);
            }
        }

        Ok(())
    }
}
