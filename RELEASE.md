# My Last Feedback v0.2.0 Release Notes

## 🎯 Release Summary

本版本完成 `0.2.0` 版本升级与 Windows 发行包构建，统一了 Node、前端与 Tauri 后端版本元数据，并输出可分发压缩包。

---

## 🍎 macOS Branch (`macOS`)

基于 v0.2.0 的 macOS 平台适配分支，包含以下针对 macOS 的优化：

### 改动内容

#### 1. CallerTabs 拖拽方案替换 (`app/src/components/CallerTabs.tsx`)
- **问题**: HTML5 Drag and Drop API 在 macOS + Tauri 的 Overlay 标题栏模式下与 `data-tauri-drag-region` 冲突，导致图标无法拖动排序
- **方案**: 将 HTML5 DnD 替换为 Pointer Events API
  - `onDragStart` → `onPointerDown` + `setPointerCapture` 捕获指针
  - `onDragOver` → `onPointerMove`（3px 阈值区分点击与拖拽）
  - `onDragEnd` → `onPointerUp`
  - 移除 `draggable` 属性和 ghost 元素
  - `e.stopPropagation()` 阻止事件冒泡到窗口拖拽区域
- 保留上游所有功能（`hiddenCallerIds` 隐藏、`unreadCallerIds` 未读）

#### 2. 文本选择修复 (`app/src/index.css`)
- **问题**: 根容器的 `select-none`（Tailwind `user-select: none`）级联到所有子元素，导致 Summary 面板中的 Markdown 内容无法用光标选择和复制
- **方案**: 在 `.prose` CSS 类中添加 `user-select: text` 和 `cursor: text`，使所有 Markdown 渲染内容可正常选择复制

### 修改文件

| 文件 | 变更 |
|------|------|
| `app/src/components/CallerTabs.tsx` | +39 / -31 行，Pointer Events 替换 HTML5 DnD |
| `app/src/index.css` | +2 行，`.prose` 添加 `user-select: text` |

## ✅ Changes

- 升级根项目版本
  - `package.json` → `0.2.0`
- 升级前端应用版本
  - `app/package.json` → `0.2.0`
- 升级 Tauri Rust 包版本
  - `app/src-tauri/Cargo.toml` → `0.2.0`
- 升级 Tauri 配置版本
  - `app/src-tauri/tauri.conf.json` → `0.2.0`
- 构建并打包 Windows 发行目录
  - `dist/win-x64/my-last-feedback/`
- 生成压缩包
  - `dist/win-x64/my-last-feedback-win-x64.zip`

## 📦 Artifacts

- Windows package directory:
  - `dist/win-x64/my-last-feedback/`
- Windows zip archive:
  - `dist/win-x64/my-last-feedback-win-x64.zip`

## 🧪 Build Verification

- Tauri release build completed successfully
- Frontend build (`tsc + vite build`) completed successfully
- Packaging script completed successfully

## ℹ️ Notes

- 构建期间出现 Vite chunk size 警告，但不影响本次发行产物生成。
- 本次发布以版本升级与发行打包为主，不包含功能层新增说明。
