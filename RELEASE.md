# My Last Feedback v0.3.0 Release Notes

## 🎯 Release Summary

本版本为 **v0.3.0** 重大功能更新，引入 MLRA（Multi-Level Review Agent）多级审查代理系统，包含完整的后端编排、6 角色前端迁移、统一 Launcher 页面等核心功能。

---

## ✨ 新功能 — MLRA (Multi-Level Review Agent)

### 核心架构
- **Backend Orchestrator**: 完整的后端编排引擎，支持多 Worker 协作
- **6-Role Frontend Migration**: CEO / Planning Expert / Planning Inspector / Execution Expert / Execution Inspector / Worker 六角色前端界面
- **Tauri Event Integration**: 深度集成 Tauri 事件系统 + AGENTS.md 尾部注入引导

### UI 框架
- **MLRA UI Scaffold**: IdenticonAvatar 头像、双行标题栏、Phase 切换、Light Theme 支持
- **Unified Launcher Page**: 统一启动页面 + Sidebar 去重
- **Timer Stats Popover**: 计时统计弹出面板改进
- **Task Input UI**: 任务输入界面 + 任务上下文展示

### 可靠性修复（4 项中风险）
- 消息队列机制
- 停滞仲裁（Stall Arbitration）
- Progress 进度追踪
- Worker 超时处理

### Prompt Engineering
- Prompt engineering refactor
- Rejection lock 机制
- Worker dormancy（休眠）模式

## 🔧 其他改进

- SummaryPanel 链接点击处理（支持 Web URL / 本地文件路径）
- P0-P3 UI 组件标准化重构
- 版本号统一升级至 `0.3.0`

## 📊 变更规模

- **121 files changed**, +27,072 / -1,058 行（相对 main 分支）
- **15 commits** since v0.2.1

## ✅ Version Bumps

- `package.json` → `0.3.0`
- `app/package.json` → `0.3.0`
- `app/src-tauri/Cargo.toml` → `0.3.0`
- `app/src-tauri/tauri.conf.json` → `0.3.0`

## 📦 Artifacts

- Windows package directory: `dist/win-x64/my-last-feedback/`
- Windows zip archive: `dist/win-x64/my-last-feedback-win-x64.zip` (~29 MB)

### 发行包内容

| 文件 | 大小 |
|------|------|
| `app.exe` | ~11 MB |
| `node_modules/` | ~21 MB |
| 其他（server.mjs, SETUP.md 等） | < 1 MB |
| **总计** | ~32 MB |
| **zip 压缩后** | ~29 MB |

## 🧪 Build Verification

- Tauri release build: ✅ (`release` profile, 31.67s)
- Frontend build (`tsc + vite build`): ✅ (3.34s)
- Packaging script: ✅ (exit code 0)
- Zip archive: ✅

## ℹ️ Notes

- 构建分支: `DEV/0408/witt/MLRA`
- 构建日期: 2026-04-18
- Vite chunk size 警告（683 kB > 500 kB limit）属已知情况，不影响运行
