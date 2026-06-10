# 介绍

My Last Feedback 是一款面向 AI 辅助开发流程的开发者伴侣 GUI。它集成交互式反馈、开发工具面板和知识管理于一体，通过一个桌面应用连接你的 AI 编程 Agent。

## 什么是 My Last Feedback？

My Last Feedback 是一个桌面应用程序，它弥合了 AI 编程 Agent 和开发者之间的差距。当你的 AI Agent 需要反馈或澄清时，My Last Feedback 会提供一个原生桌面弹窗，支持富文本格式、图片附件和结构化输入选项。

## 核心功能

- **交互式反馈**：AI Agent 请求反馈时弹出原生桌面窗口
- **内置开发工具**：终端、Git 面板、预览浏览器和项目资源浏览器
- **知识管理**：My Last Chat 侧栏面板，用于文档浏览和搜索
- **多 Agent 支持**：支持 Cursor、VS Code Copilot、Cline、Windsurf 等
- **双主题 & 双语**：暗色/亮色主题，支持中英文界面
- **轻量快速**：基于 Tauri 2.0 + React 19 构建 — 二进制仅 ~11 MB

## 工作原理

My Last Feedback 使用模型上下文协议（MCP）与 AI 编程 Agent 进行通信。当 Agent 需要反馈时，它通过 MCP 发送请求，My Last Feedback 会显示一个原生桌面窗口供开发者响应。

```
AI Agent → MCP Server → TCP IPC → Tauri GUI → 开者反馈 → 返回给 Agent
```

## 支持的 AI 工具

My Last Feedback 支持所有支持模型上下文协议的 AI 工具：

- [Cursor](https://www.cursor.com)
- [VS Code Copilot](https://code.visualstudio.com/)
- [Cline](https://cline.bot)
- [Windsurf](https://windsurf.com)
- [Codex](https://github.com/openai/codex)
- 任何其他兼容 MCP 的工具

## 快速开始

准备开始了吗？请查看[安装指南](/zh/guide/installation)以在你的系统上设置 My Last Feedback。