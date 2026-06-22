# 织 · Loom —— BYOS 文件管理平台

<p align="center">
  <img src="./public/tauri.svg" width="80" height="80" alt="Loom Logo" />
</p>

**织（Loom）** 是一个**本地优先（Local-first）**、**无云端存储**的虚拟文件管理平台。它秉持 BYOS（Bring Your Own Storage）理念，将您连接的多个本地磁盘、WebDAV（例如坚果云）、云存储等“编织”（Weave）成一个统一视图，提供文件浏览、磁盘占用统计、流式预览等核心能力。

项目界面设计深度启发自 **Teenage Engineering (TE)** 风格，追求极简工业风、严谨网格对齐以及极致的工具感。

---

## 🛠 开发准备前提 (Prerequisites)

在开始运行和开发本项目之前，请确保您的开发机已配置好以下环境：

### 1. 跨平台通用依赖

*   **Node.js**: 推荐 **v18.0.0** 或以上版本（推荐最新的 LTS 版本）。
*   **Rust**: Tauri v2 要求 Rust 稳定版。请确保已安装 **Rust 1.77+**。
    *   *安装命令*：运行 `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` (macOS/Linux) 或在 Windows 上下载 [rustup-init.exe](https://rustup.rs/) 安装。

### 2. 操作系统特定依赖

由于 Tauri 使用系统原生的 WebView，您需要安装对应的系统开发库：

#### 🖥 Windows (推荐环境)
*   **Microsoft Visual Studio C++ 生成工具**:
    *   需要在 Visual Studio Installer 中勾选 **“使用 C++ 的桌面开发”** 工作负荷。
*   **WebView2**:
    *   Windows 10/11 通常已内置。如未安装，可下载安装 [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)。

#### 🍏 macOS
*   **CLang & Xcode 命令行工具**:
    *   *安装命令*：`xcode-select --install`

---

## 🚀 快速开始 (Getting Started)

配置好上述依赖后，按照以下步骤在本地启动开发环境：

### 1. 克隆并进入项目目录
```bash
git clone https://github.com/huanghao-9708/loom.git
cd loom
```

### 2. 安装前端依赖
```bash
npm install
```

### 3. 启动开发环境 (Hot-reload)
运行以下命令，该命令会同时启动 Vite 前端服务器，并编译拉起本地 Rust 后端的桌面窗口：
```bash
npm run tauri dev
```
> **首次运行提示**：首次启动时，Cargo 需要在线下载并编译 Rust 依赖包（如 `tauri`、`wry` 等），可能需要 2~5 分钟。后续启动将实现秒级编译和热重载。

### 4. 编译并打包应用
要生成可分发的原生安装包（如 `.exe`、`.msi` 或 macOS 的 `.app` / `.dmg`）：
```bash
npm run tauri build
```

---

## 📂 项目结构 (Project Directory)

```text
loom/
├── .vscode/               # VS Code 开发环境推荐配置
├── resources/
│   └── doc/              # 设计与独立开发设计书
│       ├── teenageEngineeringUI.md   # TE 风格极简 UI 规范
│       └── 织 · Loom · 独立开发计划书   # 项目系统设计与路线图
├── src/                   # 前端源码 (Vue 3 + TS)
│   ├── assets/            # 静态资源
│   ├── App.vue            # 主界面（Teenage Engineering 调音台版面）
│   ├── index.css          # Tailwind CSS v4 与自定义色盘
│   └── main.ts            # 前端入口
├── src-tauri/             # 后端源码 (Rust / Tauri v2 Core)
│   ├── capabilities/      # Tauri 安全权限控制声明
│   ├── src/
│   │   ├── lib.rs         # 核心逻辑入口
│   │   └── main.rs        # 二进制入口
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 应用配置
├── package.json           # 前端依赖与构建脚本
└── vite.config.ts         # Vite 与 @tailwindcss/vite 配置
```

---

## 🎨 技术选型与风格

*   **外壳框架**：Tauri v2 (Rust 驱动，极低内存占用)
*   **前端框架**：Vue 3 + TypeScript
*   **样式构建**：Tailwind CSS v4 (无配置文件，全 CSS 自定义 `@theme` 变量)
*   **UI 风格**：Teenage Engineering 极简工业风格
*   **文档参考**：
    *   了解设计规范细节请阅读：[teenageEngineeringUI.md](file:///d:/code/rust/loom/resources/doc/teenageEngineeringUI.md)
    *   了解架构与插件计划请阅读：[织 · Loom 独立开发计划书](file:///d:/code/rust/loom/resources/doc/%E7%BB%87%20%C2%B7%20Loom%20%E2%80%94%E2%80%94%20BYOS%20%E6%96%87%E4%BB%B6%E7%AE%A1%E7%90%86%E5%B9%B3%E5%8F%B0%20%C2%B7%20%E7%8B%AC%E7%AB%8B%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E4%B9%A6%20d0491256e1cc4913ac17684da0a76450.md)
