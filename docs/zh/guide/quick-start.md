# 快速开始

几分钟内即可开始使用 My Last Feedback。

## 第一步：安装 My Last Feedback

按照[安装指南](/zh/guide/installation)下载并在你的系统上设置 My Last Feedback。

## 第二步：配置你的 AI 工具

### 对于 Cursor

1. 打开 Cursor 设置
2. 导航到 MCP 配置
3. 添加以下配置：

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "env": {}
    }
  }
}
```

### 对于 VS Code Copilot

1. 打开 VS Code 设置
2. 在设置中搜索"MCP"
3. 添加 My Last Feedback MCP 服务器配置

### 对于其他工具

请参考你的 AI 工具的文档了解 MCP 配置。使用上面显示的配置格式。

## 第三步：开始对话

1. 启动你的 AI 编程工具（Cursor、VS Code 等）
2. 开始与你的 AI Agent 进行新对话
3. 请 Agent 帮助你完成编码任务

## 第四步：提供反馈

当 AI Agent 需要你的反馈时：

1. My Last Feedback 将显示一个原生桌面弹窗
2. 查看 Agent 的工作摘要（以 Markdown 形式渲染）
3. 如有需要，添加图片或附件
4. 输入你的反馈或选择快捷操作
5. 点击"提交"将你的响应发送回 Agent

## 示例工作流程

以下是使用 My Last Feedback 的典型工作流程：

1. **提问**："帮我创建一个 React 待办事项列表组件"
2. **Agent 工作**：AI Agent 编写代码并创建文件
3. **反馈弹窗**：My Last Feedback 显示 Agent 做了什么
4. **审查**：你审查代码并提供反馈
5. **迭代**：Agent 根据你的反馈进行调整

## 提示

- **使用快捷操作**：使用预设回复（如"继续"、"分析"或"修复"）节省时间
- **附加截图**：使用 Ctrl+V 将截图直接粘贴到反馈表单中
- **自定义 Prompt**：在 `mcp_prompts/` 中创建 `.prompt.md` 文件，用于常用的反馈模板
- **多 Agent**：同时连接多个 AI 工具 — My Last Feedback 支持标签切换

## 下一步

- 了解[功能特性](/zh/guide/features)以发现所有功能
- 阅读[开发指南](/zh/development/setup)以参与项目贡献
- 查看 [API 参考](/zh/api/mcp)了解技术细节