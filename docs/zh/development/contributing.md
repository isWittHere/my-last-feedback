# 贡献指南

感谢你对 My Last Feedback 的贡献兴趣！本指南将帮助你开始。

## 开始

### 前置要求

- Node.js 18+
- Rust 1.70+
- Git

### 复制和克隆

1. 在 GitHub 上复制仓库
2. 克隆你的复制：
   ```bash
   git clone https://github.com/your-username/my-last-feedback.git
   cd my-last-feedback
   ```
3. 添加上游远程：
   ```bash
   git remote add upstream https://github.com/anthropics/my-last-feedback.git
   ```

## 开发工作流程

### 1. 创建分支

```bash
git checkout dev
git checkout -b feature/your-feature-name
```

### 2. 进行更改

- 遵循下面的代码风格指南
- 编写清晰的提交消息
- 彻底测试你的更改

### 3. 提交更改

```bash
git add -A
git commit -m "feat(ui): 你的更改描述"
```

### 4. 推送并创建 PR

```bash
git push origin feature/your-feature-name
```

然后在 GitHub 上创建拉取请求。

## 代码风格

### TypeScript / React

- **组件**：函数组件 + hooks，一个文件一个组件
- **状态管理**：Zustand store，localStorage 持久化
- **样式**：纯 CSS（`index.css`），使用 CSS 变量支持主题
- **i18n**：所有用户可见文本通过 `useTranslation()` + `t()` 调用
- **命名**：组件 PascalCase，函数/变量 camelCase，CSS 类 kebab-case

### Rust

- **Tauri 命令**：`#[tauri::command]` 宏，返回 `Result<T, String>` 或直接类型
- **错误处理**：`.map_err(|e| e.to_string())`
- **序列化**：全部使用 `serde::Serialize` / `Deserialize`
- **字符串**：优先 `String`，跨 FFI 边界使用 `to_string_lossy()`

### 文件组织

| 类型 | 位置 | 说明 |
|------|------|------|
| UI 组件 | `app/src/components/` | 每个功能一个 `.tsx` |
| 全局状态 | `app/src/store/feedbackStore.ts` | Zustand store |
| 样式 | `app/src/index.css` | 全局样式 + CSS 变量 |
| 翻译 | `app/src/i18n/locales/{zh,en}.json` | i18n 键值对 |
| 后端命令 | `app/src-tauri/src/lib.rs` | Tauri commands |
| IPC 通信 | `app/src-tauri/src/session.rs` + `ipc.rs` | TCP + JSON |

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

[optional body]
```

### Type

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `style` | 样式/UI 变更（不影响逻辑） |
| `refactor` | 代码重构 |
| `docs` | 文档 |
| `chore` | 构建/工具/依赖调整 |
| `i18n` | 国际化 |

### Scope（可选）

`ui` / `backend` / `mcp` / `ipc` / `build` / `i18n`

### 示例

```
feat(ui): add MCP config helper with path auto-detection
fix(backend): fix get_server_path fallback in dev mode
style(ui): welcome home two-column card layout
docs: add BUILD.md with comprehensive build guide
chore(build): update package-win.sh with zip creation
i18n: add mcpConfig translation keys
```

## 拉取请求流程

1. **更新文档**：如果你更改了行为，请更新相关文档
2. **添加测试**：如果适用，为新功能添加测试
3. **检查构建**：确保前端和后端都能成功构建
4. **审查**：请求维护者审查
5. **合并**：批准后，你的 PR 将被合并

## 报告问题

### Bug 报告

报告 bug 时，请包括：

1. **重现步骤**：重现问题的清晰步骤
2. **预期行为**：你预期会发生什么
3. **实际行为**：实际发生了什么
4. **环境**：操作系统、Node.js 版本、Rust 版本
5. **截图**：如果适用

### 功能请求

请求功能时：

1. **描述**：功能的清晰描述
2. **用例**：为什么这个功能有用
3. **实现想法**：任何实现想法

## 行为准则

请在所有互动中保持尊重和包容。我们致力于为每个人提供热情和包容的体验。

## 有问题？

如果你对贡献有疑问，请随时：

- 在 GitHub 上提出 issue
- 在讨论中提问
- 联系维护者

感谢你对 My Last Feedback 的贡献！