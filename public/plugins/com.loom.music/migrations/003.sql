CREATE TABLE IF NOT EXISTS scan_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
