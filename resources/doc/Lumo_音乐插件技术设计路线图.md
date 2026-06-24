# Lumo 本地音乐插件：详细技术设计与执行路线图

根据架构指导思想，我们计划在沙盒内部采用 **Vue 3 (ESM) + Tailwind CSS** 进行轻量级重构，避免构建工具带来的复杂性，同时享受现代化的组件开发体验。本技术设计文档将开发过程拆解为 6 个高内聚、低耦合的阶段，确保每个阶段均可独立验证。

---

## 阶段 1：产品功能定义与数据库架构设计

**目标：对齐 MVP（最小可行性产品）的功能边界，并敲定底层 SQLite 关系型数据库的表结构规范。**

### 1.1 MVP 功能边界确认
MVP 版本将聚焦于构建一个坚如磐石的**本地/网盘音乐文件管理播放器**。
*   **包含的功能**：音乐目录挂载与深度递归扫描、MP3/FLAC 基础 ID3 标签解析（提取标题、歌手、专辑、封面）、防刷新组件化 UI 布局、歌曲/专辑/艺人三维视图切换、基础全局搜索、支持随机/循环的播放队列系统、我的最爱收藏功能。
*   **不包含的功能**：跨端数据云同步、在线歌词自动拉取匹配、 gapless (无缝) 播放、高级 DSP 音效调节。

### 1.2 核心数据库表结构设计 (Schema V1)
遵循《规划与设计》中“实体与文件分离”的核心原则，底层 SQLite 将被设计为包含以下 6 张核心表的星型拓扑结构：

1.  **`artists` (艺人表)**：存放歌手实体。
    *   `id` (PK), `name` (原名), `normalized_name` (用于无大小写差异的拼音/搜索)。
2.  **`albums` (专辑表)**：存放专辑实体，由艺人表驱动。
    *   `id` (PK), `title`, `album_artist_id` (FK), `cover_vpath` (封面缓存路径), `release_year`。
3.  **`tracks` (歌曲实体表)**：代表一首音乐作品。
    *   `id` (PK), `title`, `album_id` (FK), `track_no` (音轨号), `play_count` (播放次数统计)。
4.  **`media_files` (物理文件表)**：代表歌曲在 VFS（如某网盘、某本地磁盘）中的实际物理映射。如果一首歌被删除了，只会删除 file，而 tracks 可以保留（置灰表示文件丢失）。
    *   `id` (PK), `source_id`, `vpath`, `track_id` (FK), `file_ext`, `file_size`。
5.  **`playlists` & `playlist_items` (用户歌单)**：
    *   包含歌单基本信息及所绑定 `track_id` 的位置排序 (`position`)。

---

## 阶段 2：前端架构脚手架与基础环境搭建

**目标：将现有的面条代码 (Spaghetti Code) 转换为清晰的 Vue 组件树结构，验证 ESM 模块在沙盒环境的可用性。**

- **2.1 依赖引入**：在 `index.html` 中通过 ESM (ES Modules) 引入 Vue 3 和 Tailwind CSS，摒弃构建工具包袱，实现纯净运行。
- **2.2 目录与组件重构**：在 `/plugins/com.loom.music/` 下创建 `/src/main.js`, `/src/App.js` 等基础生命周期入口。建立 `components`（播放条、侧边栏）和 `views`（全库、专辑）。
- **2.3 SDK 平滑迁移**：将现有的 `loom-sdk.js` 调用封装为 Vue 可订阅的 Composable 钩子 (如 `useLoomDB()`)。

---

## 阶段 3：元数据引擎与入库逻辑实现 (ID3 & Scanner)

**目标：让扫描器能够真正读取音乐标签，基于阶段 1 的 Schema 完成数据灌入。**

- **3.1 流式解析器接入**：引入轻量级纯 JS ID3 解析库。
- **3.2 Range 截取探测**：通过 `fetch` 的 HTTP Range 请求，从 `http://loom.localhost/preview/...` 拉取文件头部几百 KB，精准剥离出 Title, Artist, Album, Cover 数据，杜绝全量下载带来的卡顿。
- **3.3 关系型入库算法**：按照 `artists -> albums -> tracks -> media_files` 的外键层级依赖顺序，重写 `walk()` 扫描函数，保证插入数据的引用完整性。

---

## 阶段 4：响应式全局状态与播放核心逻辑

**目标：将底层的 DOM `<audio>` 剥离，抽象为 Vue 的全局响应式状态机 (State Machine)。**

- **4.1 Player Store 构建**：基于 Vue `reactive` 封装全局 `currentTrack`, `isPlaying`, `progress`。
- **4.2 Queue Manager (队列状态机)**：负责维护上下文播放队列，实现核心的 `next()`, `prev()` 算法以及播放模式状态流转（单曲循环、列表循环、随机播放 Shuffle）。
- **4.3 Audio API 隐式桥接**：创建一个后台静默的 HTML5 Audio 实例，接管宿主系统的播放能力，捕获异常并吞并 `AbortError`。

---

## 阶段 5：Lumo 原生风格界面骨架与四大核心视图

**目标：利用 Vue 完成数据驱动的视图渲染，完全遵循 `ui_style_prompt.md` 规范，与 Loom 主程序界面保持 100% 视觉一致性。**

- **5.1 响应式骨架**：完成经典 左 Sidebar + 中 Main View + 底 PlayerBar 布局。无缝接入 Tailwind v4 的 `@theme` 变量（如 `bg-bg-base`, `text-text-primary`），杜绝任何硬编码颜色。
- **5.2 Tracks View (全部歌曲)**：类似 Spotify 列表的极简冷峻排版，支持多列数据展示与动态排序，严格遵守等宽数字对齐约束。
- **5.3 Albums View (专辑墙)**：基于提取到的 `cover_vpath` 渲染正方形专辑卡片瀑布流。
- **5.4 Artists View (艺人录)**：渲染二级树状结构。

---

## 阶段 6：搜索、用户交互与边界测试

**目标：完善体验细节，达成高质量可交付的 MVP。**

- **6.1 全局检索**：基于防抖 (Debounce) 的 SQLite 实时过滤。
- **6.2 异常自愈**：播放过程中遇到文件已被远端移动（404）时，静默跳过并自动播放下一首。
- **6.3 数据库脏数据清理**：提供手动清理幽灵文件（已被删除但在库中残留的 `media_files`）的工具函数。
