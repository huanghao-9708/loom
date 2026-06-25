# Loom 插件上架规范（Registry Contribution Guide）

本仓库是 Loom 在线插件市场的**云端数据库**（Registry）。第三方开发者通过向本仓库提交 Pull Request 来上架插件，审核合并后所有 Loom 用户即刻可见。

---

## 1. 仓库结构

```text
├── plugins.json              # 总索引（市场列表数据源，前端首屏拉取）
├── plugins.schema.json       # plugins.json 的 JSON Schema（CI 校验依据）
├── plugins/
│   └── <plugin_id>.json      # 每个插件的详情与版本历史（详情页/回滚用）
└── .github/workflows/
    └── validate.yml          # PR 自动校验：Schema 合法性 + 必填字段
```

## 2. 上架流程（开发者）

### 步骤 1：打包并发布 `.loom`
1. 使用 `loom pack <插件目录>` 打包出 `<plugin_id>.loom`（本质 ZIP）。
2. 计算校验和：`sha256sum com.loom.music.loom`（Linux/mac）或 `certutil -hashfile com.loom.music.loom SHA256`（Win）。
3. 在**你自己的插件仓库**创建 GitHub Release（Tag 形如 `v1.0.0`），上传 `.loom` 作为 Release Asset。
   - GitHub 会自动为 Asset 提供全球 CDN 加速，作为 `downloadUrl` 来源。

### 步骤 2：登记到 Registry
向本仓库提交 PR，修改两处：

**① `plugins.json`** —— 在 `plugins` 数组追加（或更新）你的条目：
```json
{
  "id": "com.you.plugin",
  "name": "你的插件",
  "description": "一句话简介（≤280 字符）",
  "version": "1.0.0",
  "iconUrl": "https://raw.githubusercontent.com/you/repo/main/assets/icon.png",
  "author": "你的名字",
  "tags": ["music"],
  "downloadUrl": "https://github.com/you/repo/releases/download/v1.0.0/com.you.plugin.loom",
  "sha256": "真实的64位校验和",
  "minAppVersion": "0.1.0",
  "homepage": "https://github.com/you/repo",
  "permissions": { "vfs": ["read"], "db": true }
}
```

**② `plugins/<plugin_id>.json`** —— 创建详情文件，含版本历史：
```json
{
  "id": "com.you.plugin",
  "name": "你的插件",
  "versions": [
    {
      "version": "1.0.0",
      "releasedAt": "2026-06-25T00:00:00Z",
      "downloadUrl": "...",
      "sha256": "...",
      "minAppVersion": "0.1.0",
      "changelog": "首次发布"
    }
  ]
}
```

### 步骤 3：等待 CI 与审核
- CI（`.github/workflows/validate.yml`）会自动校验 JSON Schema 与必填字段。
- 维护者审核后合并，合并即上架。

---

## 3. 必填字段说明（红线）

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `id` | ✅ 必填 | 反向域名格式 `com.xxx.yyy`，全局唯一 |
| `version` | ✅ 必填 | 语义化版本 `MAJOR.MINOR.PATCH` |
| `downloadUrl` | ✅ 必填 | 必须 HTTPS，指向 `.loom` 包 |
| `sha256` | ✅ 必填 | **真实**的 64 位十六进制校验和，不接受全 0 占位 |
| `minAppVersion` | ✅ 必填 | 兼容性闸门，低于此版本的宿主拒绝安装 |

> ⚠️ `sha256` 为空或全 0 的 PR 会被 CI 直接拒绝——这是防篡改的核心安全机制。

## 4. 发版更新流程

发布新版本时：
1. 在插件仓库打新 Tag + Release 上传新 `.loom`，计算新 sha256。
2. 更新 `plugins.json` 中该条目的 `version` / `downloadUrl` / `sha256`。
3. 在 `plugins/<id>.json` 的 `versions` 数组**头部**插入新版记录（保留历史，便于客户端回滚/展示）。
4. 提 PR。

## 5. 图标与资源托管建议
- 图标 `iconUrl` 推荐 `raw.githubusercontent.com`（免费、稳定）。
- 体积控制在 256×256 以下，PNG/WebP 格式。
- 不要把二进制资源（图片除外）放进 Registry——大文件走各自仓库的 Release。

## 6. 自动化（可选，进阶）
官方插件可配置 GitHub Actions：push main → 自动 tag → 创建 Release 上传 `.loom` → 计算 sha256 → 用 `gh pr create` / GitHub bot 向本 Registry 仓库自动提交更新 PR。模板见 Loom 官方插件仓库。
