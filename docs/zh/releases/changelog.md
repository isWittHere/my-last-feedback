# 更新日志

My Last Feedback 的所有显著更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增
- 使用 VitePress 构建的文档网站
- GitHub Pages 自动部署

## [0.3.0] - 2026-04-18

### 新增
- **MLRA（多级审查代理）系统**
  - 后端编排引擎，支持多 Worker 协作
  - 6 角色前端迁移（CEO、规划专家、规划审查员、执行专家、执行审查员、Worker）
  - Tauri 事件集成 + AGENTS.md 尾部注入引导
- **UI 框架**
  - MLRA UI 脚手架：IdenticonAvatar 头像、双行标题栏、Phase 切换
  - 统一 Launcher 页面 + Sidebar 去重
  - 计时统计弹出面板改进
  - 任务输入界面 + 任务上下文展示
- **可靠性修复**
  - 消息队列机制
  - 停滞仲裁（Stall Arbitration）
  - Progress 进度追踪
  - Worker 超时处理
- **Prompt Engineering**
  - Prompt engineering 重构
  - Rejection lock 机制
  - Worker dormancy（休眠）模式

### 变更
- SummaryPanel 链接点击处理（支持 Web URL / 本地文件路径）
- P0-P3 UI 组件标准化重构
- 版本号统一升级至 `0.3.0`

### 修复
- 各种稳定性改进

## [0.2.1] - 2026-04-01

### 新增
- MCP 配置助手，支持自动检测
- Git 面板中的快速备份功能
- 自定义 Prompt 按钮支持

### 变更
- 改进终端面板性能
- 增强国际化支持

### 修复
- 会话持久化问题
- 主题切换错误

## [0.2.0] - 2026-03-15

### 新增
- 多 Caller 支持，带标签切换
- 图片附件支持（最多 5 张）
- 反馈表单中的结构化问题
- 快捷操作预设回复

### 变更
- 重新设计反馈窗口 UI
- 改进 Markdown 渲染

### 修复
- IPC 连接稳定性
- 会话管理中的内存泄漏

## [0.1.0] - 2026-03-01

### 新增
- 首次发布
- 基本反馈窗口，支持 Markdown
- MCP 服务器实现
- Tauri 桌面应用程序
- 系统托盘支持
- 暗色和亮色主题
- 中英文界面

---

## 版本历史

有关更早的版本，请参阅 [GitHub Releases](https://github.com/anthropics/my-last-feedback/releases) 页面。

---

## 贡献

要添加此更新日志的条目：

1. 在 `[未发布]` 部分下添加你的更改
2. 发布时，将条目从 `[未发布]` 移动到新的版本部分
3. 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 格式
4. 使用以下类别：
   - **新增** 用于新功能
   - **变更** 用于现有功能的更改
   - **弃用** 用于即将移除的功能
   - **移除** 用于已移除的功能
   - **修复** 用于任何错误修复
   - **安全** 用于漏洞修复