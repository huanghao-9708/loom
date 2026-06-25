# Loom 插件系统与零成本插件商城执行蓝图

本文档定义了 Loom 本地优先软件生态下的插件系统架构，涵盖了从插件包规范、本地生命周期管理，到零成本（基于 GitHub）的云端插件商城的完整实现路径。

---

## 1. 核心定义与插件包规范

### 1.1 插件格式 (`.loom` 包)
Loom 插件将采用专有的 `.loom` 扩展名，本质上是一个标准 ZIP 压缩包。该设计保证了分发的便利性与底层解析的高效性。

标准的 `.loom` 内部结构必须如下：
```text
com.developer.plugin_name.loom
 ├── manifest.json       # 唯一标识、版本号、所需系统权限 (Capabilities)、入口配置
 ├── index.html          # UI 入口点（由 iframe 沙盒或独立窗口加载）
 ├── src/                # 编译后的前端/后端辅助脚本逻辑
 └── assets/             # 插件图标、资源文件
```

### 1.2 `manifest.json` 规范
这是插件被 Loom 识别的身份证，严格控制沙盒边界：
```json
{
  "id": "com.loom.music",
  "name": "Loom Music",
  "version": "1.0.0",
  "author": "Loom Team",
  "entry": "index.html",
  "icon": "assets/icon.png",
  "capabilities": ["vfs:read", "sqlite:dedicated"] 
}
```

---

## 2. 本地生命周期管理系统 (Tauri Core)

### 2.1 安装流程 (Install)
1. **下载/读取**：前端触发安装指令，传入本地 `.loom` 文件路径或云端下载链接。
2. **下载与缓存 (如为云端)**：Rust 核心使用 `reqwest` 下载文件至系统的 `/tmp`。
3. **安全校验与解压**：
   - 校验 `manifest.json` 格式，拦截未授权的高危权限。
   - Rust 调用 zip 引擎，将其解压到沙盒专属目录：`~/.loom/plugins/<plugin_id>/`。
4. **元数据注册**：在系统主库 `core.db` 的 `installed_plugins` 表中写入记录。
5. **事件广播**：通过 Tauri Event `plugin-installed` 触发前端的热加载（左侧导航条动态新增入口）。

### 2.2 卸载流程 (Uninstall)
1. **进程清理**：前端发送卸载指令 `uninstall_plugin(id)`。Rust 终止任何属于该插件的后台进程或定时任务。
2. **物理擦除**：利用 Rust 原生文件系统强制递归删除 `~/.loom/plugins/<plugin_id>`。
3. **数据主权选择**：提示用户：“是否同时删除该插件产生的数据（独立 SQLite 库和本地配置）？”
4. **注销元数据**：将该插件从 `installed_plugins` 移除，前端触发 `plugin-uninstalled` 事件销毁侧边栏及 DOM 挂载点。

---

## 3. 基于 GitHub 的零成本云端商城架构

采用去中心化、基于开源基建的方式，无需购买服务器或 CDN，即可为全网用户提供高速稳定的下载体验。

### 3.1 云端数据库 (Plugins Registry)
创建一个公开的 GitHub Repository（如 `loom-plugins-registry`）。
利用仓库根目录下的 `plugins.json` 作为“云端数据库”：
```json
[
  {
    "id": "com.loom.music",
    "name": "音乐播放器",
    "description": "本地高解析度音乐播放体验",
    "version": "1.0.0",
    "icon_url": "https://raw.githubusercontent.com/.../icon.png",
    "download_url": "https://github.com/developer/repo/releases/download/v1.0/com.loom.music.loom"
  }
]
```
**生态优势**：任何外部开发者开发完毕后，都可以通过向该仓库提交 Pull Request (PR) 申请上架。审核通过合并代码后，所有 Loom 用户即刻可见。

### 3.2 托管分发 (CDN)
- 插件开发者将打包好的 `.loom` 上传至他们自己插件仓库的 **GitHub Releases** 中。
- GitHub 会自动为 Release Assets 提供全球 CDN 加速的极速下载，作为 `download_url` 的来源。

### 3.3 商城前端 (Marketplace UI)
在 Loom 主界面新建「发现 / 插件市场」Tab。
1. **拉取列表**：前端直接通过 HTTP GET 请求 `https://raw.githubusercontent.com/.../plugins.json` 获取商城列表，并按 UI 规范渲染卡片。
2. **无缝安装**：用户点击“获取”，向 Rust 核心传入 `download_url`，进入静默下载 -> 解压 -> 热部署流程。

---

## 4. 分阶段执行路线图 (Milestones)

### Phase 1: 本地核心基建 (MVP)
- [ ] **打包脚手架**：实现 `loom-cli pack`，能将现有的 `public/plugins/com.loom.music` 打包为 `.loom`。
- [ ] **Tauri 解压引擎**：在 Rust 侧实现 ZIP 的受控解压，将解压后的文件同步到插件工作区。
- [ ] **本地热加载注册表**：通过读取本地已安装的目录，在启动时动态挂载侧边栏图标。

### Phase 2: 生命周期与卸载管理
- [ ] **卸载能力封装**：在应用设置页加入插件列表和卸载按钮，实现代码沙盒的安全销毁机制。
- [ ] **UI 状态机对接**：确保在卸载时，Vue 前端不会产生路由崩溃或页面白屏。

### Phase 3: 云端商城构建
- [ ] **GitHub 仓库筹备**：创建官方 Registry 仓库，初始化 `plugins.json` 模板。
- [ ] **应用商城界面开发**：开发符合 TE (Teenage Engineering) 设计规范的 Marketplace UI 界面，包括列表页、详情弹窗。
- [ ] **云端静默安装通道**：将 HTTP 下载器与 Phase 1 的解压引擎对接。

### Phase 4: 生态繁荣与自动化
- [ ] **GitHub Actions 自动化**：为官方插件配备 CI/CD，每次推送 Main 分支自动打 Tag、创建 Release 并在 Registry 中更新最新版本号。
- [ ] **上架规范制定**：撰写《Loom 插件开发者白皮书》，招募早期开发者生态。
