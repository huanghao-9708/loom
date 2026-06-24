# Lumo 音乐播放器插件 (com.loom.music) - 沙盒隔离层设计规范

基于最初的《Lumo 完整规划与设计》理念，本插件在 Loom 的三层沙盒底座架构下运行。
为了体现“底层不管业务，插件不论文件”的原则，我们对 Lumo 的原始数据库进行了沙盒视角的瘦身与改造。

## 一、 核心架构原则

1. **宿主拥有物理文件 (The Vault)**
   Loom 主程序统一挂载并索引了包括本地和 WebDAV 在内的所有的 `sources`。插件不需要（也没有权限）去知道物理磁盘的真实路径。
2. **插件拥有抽象映射 (The Sandbox)**
   插件沙盒内部的 `media_files` 表，不再存储绝对路径，而是存储对应的 `source_id` 和虚拟路径 `vpath`。插件所有的文件读取，必须通过 `loom-sdk.js` 中的 API 或 `loom://` 协议代办。
3. **文件与实体的分离**
   保留 Lumo 最核心的理念：一首歌（`tracks`）和音频文件（`media_files`）是 1:N 的关系。

---

## 二、 数据库实体设计 (Schema V1)

所有表都在 `AppData/Local/com.loom.app/plugins/com.loom.music/data.db` 内单独建立。

### 1. `media_files` (媒体文件映射)
核心隔离带。此表将沙盒内的数据与外部的 VFS 桥接起来。
```sql
CREATE TABLE media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,            -- 宿主环境赋予的存储源 ID
    vpath TEXT NOT NULL,                   -- 宿主环境理解的统一虚拟路径 (如 /music/1.mp3)
    track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL, -- 绑定到的歌曲实体
    file_ext TEXT,                         -- 扩展名
    file_size INTEGER,
    duration_ms INTEGER,                   -- 音频时长
    bitrate INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 唯一约束，防止同一个文件被重复记录
CREATE UNIQUE INDEX idx_media_files_vpath ON media_files(source_id, vpath);
```

### 2. `artists` (艺术家)
```sql
CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3. `albums` (专辑)
```sql
CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    album_artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
    cover_vpath TEXT,                      -- 封面图片在宿主内的 vpath
    cover_source_id INTEGER,               -- 封面图片所在的 source_id
    release_year INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4. `tracks` (歌曲实体)
```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
    track_no INTEGER,
    primary_file_id INTEGER REFERENCES media_files(id), -- 默认播放的最高优文件版本
    play_count INTEGER NOT NULL DEFAULT 0,
    last_played_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5. `playlists` 与 `playlist_items` (歌单)
```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 三、 数据流转

1. **扫描入库 (Scan & Index)**
   - 插件界面被呼出。用户点击“扫描源 ID=1”的按钮。
   - 插件内嵌脚本调用 `loom.vfs.list(1, "/")` 获取所有文件树。
   - 筛选后缀为 `.mp3`, `.flac` 的节点。
   - 使用 JavaScript 层级的 ID3 工具读取元数据。
   - 将信息写入自己独立的 SQLite (`artists`, `albums`, `tracks`, `media_files`)。

2. **音频渲染 (Playback)**
   - 用户在列表中双击歌曲。
   - 插件查询到 `media_files.vpath`。
   - 拼接 URL `loom://preview/1/music/xxx.mp3`。
   - 喂给原生的 `<audio src="...">` 进行播放。浏览器自动发起 HTTP Range 请求。
   - 宿主的 Tauri 网关截获请求，执行真正的 IO 磁盘流分段读取并返回给沙盒。

这套设计将系统高风险、高复杂度的 IO 与解码全盘抛给原生环境，插件只专注于其最擅长的 UI 展示与 SQL 业务状态机。
