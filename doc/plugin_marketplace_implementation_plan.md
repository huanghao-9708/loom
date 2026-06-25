# Loom 在线插件商城 —— 从 0 到在线安装 / 卸载 / 更新 实现计划

> 本文档是 `plugin_system_design.md` 的 Phase 3/4 落地执行手册。
> 它基于「本地插件安装能力已完成」这一前提，规划从零搭建一套基于 GitHub 的零成本在线插件市场，覆盖**安装、卸载、更新**三大生命周期闭环。

---

## 0. 前置基线盘点（已完成，作为本计划起点）

在开始本计划前，仓库已具备以下能力，**本计划不再重复实现，只在其上扩展**：

| 能力 | 代码位置 | 状态 |
| --- | --- | --- |
| `.loom` 包格式（ZIP + manifest.json） | `doc/plugin_system_design.md` §1 | ✅ |
| 本地打包脚手架 | `scripts/pack.cjs` | ✅ |
| Rust 解压安装引擎（从本地路径） | `src-tauri/src/plugin_mgr.rs::install_plugin` | ✅ |
| 沙箱隔离（iframe + 独立 SQLite 池 + `loom://` 协议路由） | `PluginHost.vue` / `lib.rs` | ✅ |
| 已安装插件列表读取（扫描目录） | `plugin_mgr.rs::get_installed_plugins` | ✅ |
| 前端「文件选择 → 安装 → 刷新侧边栏」 | `src/App.vue::installPlugin` | ✅ |
| 数据迁移机制（schemaVersion + migrations） | `plugin_mgr.rs::migrate_pool` | ✅ |

**本计划要补齐的缺口**：卸载、云端 Registry、HTTP 下载、版本检测、更新流程、市场 UI、完整性/签名校验。

---

## 1. 总体目标与设计原则

### 1.1 目标
1. **在线安装**：用户在「插件市场」Tab 点击获取 → 静默下载 → 校验 → 解压 → 热加载，全程无弹窗中断。
2. **卸载**：一键卸载，含进程清理、目录删除、数据保留/清除二选一。
3. **更新**：启动时与手动「检查更新」时拉取 Registry，对已安装插件做版本比对，提供一键升级。
4. **零成本运营**：全部依赖 GitHub（Releases 做分发 CDN，Repo 做 Registry 数据库，Actions 做自动化），不引入自建服务器。

### 1.2 设计原则
- **本地优先**：市场列表可离线缓存，已安装插件断网仍可用。
- **安全第一**：所有 `.loom` 下载后必须做 SHA-256 校验；manifest 权限在安装前对用户显式展示。
- **复用既有基建**：下载链路对接已有的 `install_plugin` 解压引擎，不另造轮子。
- **渐进增强**：Registry schema 做版本化，老客户端能安全忽略未知字段。

---

## 2. 架构总览

```text
┌──────────────────────────────────────────────────────────────┐
│                        Loom 客户端                            │
│  ┌────────────────────┐        ┌──────────────────────────┐  │
│  │  Marketplace UI    │◄──────►│  Market Service (TS)     │  │
│  │  (发现/详情/已安装) │        │  - 拉取 Registry         │  │
│  └────────────────────┘        │  - 版本比对              │  │
│                                │  - 触发 install/update   │  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Tauri Rust Core (src-tauri)               │ │
│  │  cmd_market_download ──► reqwest 下载 ──► SHA256 校验  │ │
│  │  cmd_install_plugin  ──► (复用) ZIP 解压引擎           │ │
│  │  cmd_uninstall_plugin ─► 目录删除 + 池回收 + 数据清理  │ │
│  │  cmd_check_updates ────► Registry 比对                 │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
              ┌────────────────┼─────────────────┐
              ▼                 ▼                  ▼
   ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
   │ GitHub Registry  │  │ GitHub       │  │ GitHub Actions   │
   │ (plugins.json)   │  │ Releases CDN │  │ (CI/CD 自动化)    │
   │ loom-plugins-    │  │ 各插件 .loom │  │ tag/release/登记 │
   │ registry 仓库    │  │              │  │                  │
   └──────────────────┘  └──────────────┘  └──────────────────┘
```

---

## 3. Registry 规范设计（GitHub 仓库）

### 3.1 仓库结构
创建公开仓库 `loom-plugins-registry`：
```text
loom-plugins-registry/
├── plugins.json              # 总索引（市场列表数据源）
├── plugins/
│   ├── com.loom.music.json   # 每个插件的完整元数据（含历史版本）
│   └── ...
├── CONTRIBUTING.md           # 上架规范
└── .github/workflows/
    └── validate.yml          # PR 校验：JSON Schema 合法性 + 必填字段
```

### 3.2 `plugins.json` 总索引（轻量，前端首屏拉取）
```json
{
  "registryVersion": 1,
  "updatedAt": "2026-06-25T10:00:00Z",
  "plugins": [
    {
      "id": "com.loom.music",
      "name": "音乐播放器",
      "description": "本地优先的跨平台音乐库",
      "version": "1.2.0",
      "iconUrl": "https://raw.githubusercontent.com/.../icon.png",
      "author": "Loom Team",
      "tags": ["music", "media"],
      "downloadUrl": "https://github.com/huanghao-9708/loom-music/releases/download/v1.2.0/com.loom.music.loom",
      "sha256": "e3b0c44f98a1c4eb8d...",
      "minAppVersion": "0.1.0",
      "homepage": "https://github.com/huanghao-9708/loom-music"
    }
  ]
}
```

### 3.3 单插件详情 `plugins/<id>.json`（含版本历史，详情页/回滚用）
```json
{
  "id": "com.loom.music",
  "name": "音乐播放器",
  "versions": [
    {
      "version": "1.2.0",
      "releasedAt": "2026-06-20T00:00:00Z",
      "downloadUrl": ".../v1.2.0/com.loom.music.loom",
      "sha256": "...",
      "minAppVersion": "0.1.0",
      "changelog": "修复歌词滚动偏移"
    },
    { "version": "1.1.0", "...": "..." }
  ]
}
```

> **字段约束**：`sha256` 与 `downloadUrl` 为必填；客户端无校验和则拒绝安装。

---

## 4. Manifest 扩展（向后兼容）

当前 `manifest.json` 仅含运行所需字段。为支撑市场展示与权限确认，**新增可选字段**，老插件不受影响：

```jsonc
{
  "id": "com.loom.music",
  "name": "音乐播放器",
  "version": "1.0.0",
  "description": "...",          // 新增：市场展示
  "author": "Loom Team",          // 新增
  "icon": "assets/icon.png",      // 新增（已有约定，正式纳入 schema）
  "entry": "index.html",
  "schemaVersion": 1,
  "minAppVersion": "0.1.0",       // 新增：兼容性闸门
  "permissions": { "vfs": ["read"], "db": true },
  "migrations": ["migrations/001.sql"]
}
```

Rust 侧 `PluginManifest` 结构体相应增加 `#[serde(default)]` 的可选字段，零破坏升级。

---

## 5. 实施路线图（4 个 Sprint）

> 每个 Sprint 可独立交付、可独立验证。建议按顺序执行。

### Sprint 0：卸载能力（补齐本地生命周期闭环）⭐ 最高优先
**为什么先做**：当前能装不能卸，是完成「在线安装/卸载/更新」闭环的前置。在线安装后用户必然需要卸载兜底。

**任务清单**：
- [ ] **Rust：`cmd_uninstall_plugin(plugin_id, purge_data: bool)`**
  - 回收该插件的 SQLite 连接池：`plugin_mgr.evict_plugin_pool(id)`（已存在）。
  - 递归删除插件目录 `~/.loom/plugins/<plugin_id>/`（或按 `purge_data` 决定是否保留 `data.db`）。
  - 返回成功后，Rust 广播 Tauri Event `plugin-uninstalled { id }`。
  - 前端如果当前正打开该插件，需先卸载 iframe（切换到默认 Tab）。
- [ ] **Rust：`cmd_get_plugin_disk_usage(plugin_id)`**
  - 统计插件目录 + 独立 data.db 体积，供卸载确认弹窗显示「将释放 X MB」。
- [ ] **前端：设置页「已安装插件」子页**
  - 列表展示每个已装插件的版本、占用空间、权限摘要。
  - 「卸载」按钮 → 确认弹窗（含「同时删除插件数据」勾选项）→ 调用 `cmd_uninstall_plugin`。
- [ ] **前端：事件监听 `plugin-uninstalled`**
  - 从侧边栏移除入口；若激活中则切回首页 Tab。

**验收标准**：
1. 装一个插件 → 卸载 → 目录物理消失、侧边栏入口消失、data.db 按选择保留或删除。
2. 卸载当前正在运行的插件不导致白屏/崩溃。

---

### Sprint 1：云端 Registry 与 HTTP 下载链路
**目标**：打通「点一个 URL → 落地为已安装插件」的最小链路（暂不做 UI，用命令行/测试入口验证）。

**任务清单**：
- [ ] **创建 `loom-plugins-registry` 公开仓库**，落地 `plugins.json` 与 JSON Schema 校验 workflow。
- [ ] **Rust：HTTP 下载器 `cmd_market_download(url, expected_sha256)`**
  - 用 `reqwest`（已在依赖中）流式下载到临时目录 `~/.loom/.cache/<id>.loom`。
  - 下载中通过 Tauri Event `download-progress { id, received, total }` 上报进度。
  - 下载完成后计算 SHA-256，与 `expected_sha256` 不符则删除文件并返回错误。
- [ ] **Rust：组合命令 `cmd_market_install(entry: RegistryEntry)`**
  - 内部串联：`download` → `sha256 校验` → 调用现有 `install_plugin(本地临时路径)` → 清理临时文件。
  - 这条命令是市场「获取」按钮的单一入口，对外屏蔽下载细节。
- [ ] **Rust：Registry 拉取 `cmd_fetch_registry()`**
  - GET `https://raw.githubusercontent.com/<org>/loom-plugins-registry/main/plugins.json`。
  - 解析后返回结构化 `Vec<RegistryEntry>` 给前端。
  - 失败时回退读取本地缓存 `~/.loom/.cache/registry.json`（离线可用）。
- [ ] **Cargo 依赖补充**：`sha2 = "0.10"`（SHA-256）。

**验收标准**：
1. 在 `plugins.json` 登记一个真实 `.loom`（含正确 sha256），通过临时测试按钮触发 `cmd_market_install`，能成功落地并可打开。
2. 篡改 `sha256` 后安装被拒绝，临时文件被清理。
3. 断网时 `cmd_fetch_registry` 回退到上次缓存。

---

### Sprint 2：更新检测与一键升级
**目标**：让「已安装插件」能感知新版本并升级。

**任务清单**：
- [ ] **Rust：版本比较工具**
  - 实现语义化版本比较（`1.2.0` > `1.1.0`）。可手写轻量解析，或引入 `semver = "1"`。
- [ ] **Rust：`cmd_check_updates()`**
  - 拉取 Registry，与本地 `get_installed_plugins()` 的 version 逐一比对。
  - 返回 `Vec<UpdateInfo { id, current, latest, entry }>`。
- [ ] **Rust：`cmd_market_update(entry)`**
  - 复用 `cmd_market_install` 的下载+校验链路。
  - **关键差异**：解压前先备份旧版本目录到 `~/.loom/.cache/<id>.bak`；解压成功后，把旧目录的 `data.db` 与用户数据迁移进新目录（保证升级不丢数据）；确认无误后删除 `.bak`。失败则回滚。
  - 升级后触发 `plugin-updated { id, version }` 事件，前端热重载 iframe。
- [ ] **前端：更新徽标**
  - 启动后静默 `cmd_check_updates`；侧边栏插件项出现「↑」红点提示有新版。
  - 详情/已安装页提供「更新到 vX.Y.Z」按钮。

**验收标准**：
1. 升级 `com.loom.music` 从 1.0.0 → 1.1.0 后，音乐库数据（data.db）完整保留。
2. 升级失败（如校验不过）时，旧版本仍可正常使用。
3. 升级后 iframe 自动加载新版本入口。

---

### Sprint 3：插件市场 UI（发现 / 详情 / 安装交互）
**目标**：面向用户的完整商城界面，遵循 TE 极简工业风。

**任务清单**：
- [ ] **新增顶级 Tab：「发现」**
  - 卡片网格布局：图标 + 名称 + 简介 + 作者 + 「获取/已安装/更新」状态按钮。
  - 顶部搜索框 + 标签筛选（music / media / tools …）。
- [ ] **插件详情弹窗**
  - 大图头图 + 完整描述 + 权限清单（高亮 vfs/db/net）+ 版本历史 + 更新日志。
  - 安装前**权限确认步骤**：明确列出该插件申请的能力，用户「允许并安装」才继续。
- [ ] **下载进度反馈**
  - 监听 `download-progress` 事件，在卡片/按钮上显示百分比环形进度。
- [ ] **「已安装」管理视图**（与 Sprint 0 的设置页整合或互链）
  - 统一入口管理：打开 / 更新 / 卸载 / 查看权限。
- [ ] **空状态与错误态**
  - Registry 拉取失败、无网络、无插件时的友好提示与重试按钮。

**验收标准**：
1. 用户可在「发现」浏览、搜索、查看详情、一键安装，全程有进度反馈。
2. 安装含高危权限（如 net）插件时，权限确认步骤强制弹出。
3. 已安装插件在市场卡片上正确显示「已安装」/「更新」状态。

---

## 6. 安全模型（贯穿所有 Sprint）

| 威胁 | 缓解措施 |
| --- | --- |
| 下载被中间人篡改 | Registry 必须填 `sha256`，客户端下载后强制校验，不符即丢弃 |
| 恶意插件申请越权 | 安装前向用户展示 `permissions`，高危（net/写 vfs）需二次确认 |
| 插件目录穿越攻击 | 解压时使用 `zip::enclosed_name()`（当前代码已用），拒绝 `../` 路径 |
| Registry 被投毒 | Registry 仓库启用 PR 审核 + CI 校验；客户端可加官方公钥签名校验（Phase 2 增强） |
| 升级中断导致数据损坏 | 先备份再覆盖，失败自动回滚（Sprint 2） |
| 离线降级 | Registry 本地缓存；已装插件完全本地运行 |

---

## 7. 自动化与生态（Phase 2，本计划之后）

- [ ] **GitHub Actions 模板**：插件仓库 push main → 自动 tag → 创建 Release 上传 `.loom` → 计算 sha256 → 向 `loom-plugins-registry` 提 PR 更新 `plugins.json`。
- [ ] **开发者白皮书**：`doc/plugin_developer_guide.md`，含 manifest 全字段、权限清单、打包发布流程。
- [ ] **可选增强**：官方对 `plugins.json` 做 Ed25519 签名，客户端内置公钥验签，彻底防投毒。

---

## 8. 文件改动清单（预估）

| 文件 | 改动 | Sprint |
| --- | --- | --- |
| `src-tauri/src/plugin_mgr.rs` | 新增 `uninstall_plugin`、`get_disk_usage`、`fetch_registry`、`market_download/install/update`、版本比对 | 0/1/2 |
| `src-tauri/src/lib.rs` | 注册新 commands：`cmd_uninstall_plugin`、`cmd_market_*`、`cmd_check_updates`、`cmd_fetch_registry` | 0/1/2 |
| `src-tauri/Cargo.toml` | 新增 `sha2`、`semver` 依赖 | 1/2 |
| `src/services/market.ts` *(新)* | 封装 Registry 拉取、版本比对、安装/更新调用的 TS 服务层 | 1/2/3 |
| `src/components/Marketplace.vue` *(新)* | 发现页 | 3 |
| `src/components/PluginDetailModal.vue` *(新)* | 详情 + 权限确认弹窗 | 3 |
| `src/components/InstalledPlugins.vue` *(新)* | 已安装管理（卸载/更新入口） | 0/3 |
| `src/App.vue` | 新增「发现」Tab、`plugin-uninstalled`/`plugin-updated` 事件监听、更新徽标 | 0/2/3 |
| `plugins-src/com.loom.music/manifest.json` | 补充 `description`/`author`/`minAppVersion` 等市场字段（示范） | 1 |
| 外部仓库 `loom-plugins-registry` *(新)* | `plugins.json` + JSON Schema + CI | 1 |

---

## 9. 验收里程碑定义

- **M0（卸载可用）**：本地插件可一键卸载，含数据清理选项，无残留。
- **M1（在线可装）**：从 Registry 的 `downloadUrl` 一键安装成功，含 sha256 校验。
- **M2（可更新）**：检测到新版后一键升级，用户数据不丢失，失败可回滚。
- **M3（商城上线）**：完整的发现/详情/已安装 UI，权限确认与进度反馈齐备。
- **M4（生态自动化）**：开发者通过 Actions 自动发布上架，PR 审核合并即对全用户可见。

---

## 10. 建议的执行顺序与依赖

```text
Sprint 0 (卸载) ──┐
                  ├──► Sprint 2 (更新) ──► Sprint 3 (UI) ──► Phase 2 (生态自动化)
Sprint 1 (下载) ──┘
```

- Sprint 0 与 Sprint 1 可并行（前者纯本地，后者纯网络）。
- Sprint 2 依赖 0（卸载/清理）+ 1（下载）。
- Sprint 3 依赖 1/2 的命令层就绪，UI 才有意义。

> **最小可演示路径**：Sprint 0 + Sprint 1 即可向用户演示「在线一键安装 + 卸载」，是最高性价比的里程碑组合。
