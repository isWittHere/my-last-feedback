# MCP 协议

My Last Feedback 实现了模型上下文协议（MCP）来与 AI 编程 Agent 进行通信。

## 概述

模型上下文协议是 AI 工具与外部服务之间通信的标准。My Last Feedback 作为 MCP 服务器，为 AI Agent 提供反馈收集功能。

## MCP 服务器实现

### 服务器入口点

MCP 服务器在 `server.mjs` 中实现，作为 Node.js 进程运行，使用 stdio 传输。

```javascript
// server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'my-last-feedback',
  version: '1.0.0'
});

// 注册工具和提示
// ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

## 可用工具

### request_feedback

向开发者请求反馈。

**参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `summary` | string | 是 | Agent 完成的工作摘要 |
| `options` | string[] | 否 | 开发者的快捷操作选项 |
| `caller` | string | 否 | 调用的 AI Agent 名称 |

**示例：**

```json
{
  "summary": "我创建了一个新的 React 待办事项组件。该组件包括：\n- 添加待办事项功能\n- 切换完成状态\n- 删除待办事项\n\n请审查，如果你需要任何更改请告诉我。",
  "options": ["继续", "修复问题", "添加测试"],
  "caller": "cursor"
}
```

**响应：**

```json
{
  "feedback": "看起来不错！请为空输入添加错误处理。",
  "action": "修复问题"
}
```

### get_session_info

获取当前反馈会话的信息。

**参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 会话标识符 |

**响应：**

```json
{
  "session_id": "uuid",
  "caller": "cursor",
  "status": "active",
  "created_at": "2026-04-18T12:00:00Z"
}
```

## 可用提示

### feedback_prompt

用于请求反馈的提示模板。

**参数：**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `task` | string | 是 | 正在处理的任务描述 |
| `progress` | string | 否 | 当前进度描述 |

## 配置

### MCP 配置文件

MCP 服务器配置取决于你的 AI 工具：

**Cursor (`~/.cursor/mcp.json`)：**

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

**VS Code Copilot：**

添加到 VS Code 设置：

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

### 自动检测

My Last Feedback 包含一个配置助手，可以自动检测安装路径。使用侧边栏中的"MCP 配置"按钮生成正确的配置。

## 传输

### stdio 传输

默认传输使用标准输入/输出（stdio）进行通信。这是 MCP 服务器最常见的传输方式。

### HTTP 传输（实验性）

实验性 HTTP 传输可用于开发：

```bash
npm run start:http
```

这会在端口 3000 上启动 HTTP 服务器。

## 消息格式

### 请求格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "request_feedback",
    "arguments": {
      "summary": "工作摘要",
      "options": ["继续", "修复"]
    }
  }
}
```

### 响应格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "看起来不错！请添加错误处理。"
      }
    ]
  }
}
```

## 错误处理

### 常见错误

| 错误代码 | 说明 | 解决方案 |
|----------|------|----------|
| -32700 | 解析错误 | 检查 JSON 语法 |
| -32600 | 无效请求 | 检查请求格式 |
| -32601 | 方法未找到 | 检查可用方法 |
| -32602 | 无效参数 | 检查参数类型 |
| -32603 | 内部错误 | 检查服务器日志 |

### 调试

要调试 MCP 通信：

1. 检查你的 AI 工具的 MCP 日志
2. 手动运行 MCP 服务器：
   ```bash
   node mcp/mlfb/index.mjs
   ```
3. 使用 MCP Inspector 工具进行测试

## 安全考虑

- **仅本地**：MCP 服务器仅接受来自 localhost 的连接
- **无认证**：本地连接不需要认证
- **输入验证**：所有输入在处理前都经过验证
- **进程隔离**：MCP 服务器作为单独进程运行

## 最佳实践

### 对于 AI Agent 开发者

1. **清晰摘要**：提供清晰、简洁的工作摘要
2. **相关选项**：包含相关的快捷操作选项
3. **错误处理**：优雅地处理反馈响应
4. **会话管理**：使用会话进行多轮对话

### 对于用户

1. **彻底审查**：在响应前花时间审查 Agent 的工作
2. **具体反馈**：提供具体反馈以获得更好的结果
3. **使用快捷操作**：对常见响应使用快捷操作
4. **检查历史**：查看会话历史以获取上下文

## 示例

### 基本反馈请求

```javascript
// AI Agent 代码
const result = await mcp.callTool('request_feedback', {
  summary: '我已实现带有验证的登录表单。',
  options: ['继续', '添加测试', '修复问题']
});

console.log(result.feedback);
```

### 多轮对话

```javascript
// 第一次请求
const result1 = await mcp.callTool('request_feedback', {
  summary: '开始实现用户认证。',
  caller: 'cursor'
});

// 根据反馈继续
if (result1.action === '继续') {
  const result2 = await mcp.callTool('request_feedback', {
    summary: '认证实现完成。添加了：\n- 登录\n- 注销\n- 会话管理',
    options: ['添加测试', '部署']
  });
}
```

## 故障排除

### MCP 服务器无法启动

- 检查 Node.js 版本（需要 18+）
- 验证 `@modelcontextprotocol/sdk` 已安装
- 检查 `server.mjs` 中的语法错误

### AI Agent 无法连接

- 验证 MCP 配置路径是否正确
- 配置更改后重启你的 AI 工具
- 检查 MCP 服务器是否正在运行

### 反馈不显示

- 确保 My Last Feedback GUI 正在运行
- 检查 MCP 服务器和 GUI 之间的 IPC 连接
- 验证会话是否活跃