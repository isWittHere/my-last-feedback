# MLRA ACP PoC

验证 Copilot CLI 的 ACP 协议核心能力，确认 MLRA 架构假设。

## 测试项

| 测试 | 脚本 | 验证内容 |
|------|------|---------|
| Basic | `test-acp-basic.mjs` | 进程启动、ACP 握手、Session 创建、Prompt 发送/响应 |
| Multi-Session | `test-acp-multi-session.mjs` | 单进程多 Session、上下文隔离 |
| MCP Inject | `test-acp-mcp-inject.mjs` | mcpServers 注入、Agent 调用自定义 MCP 工具 |

## 运行

```bash
cd .myLastChat/acp-poc
npm install
node test-acp-basic.mjs
node test-acp-multi-session.mjs
node test-acp-mcp-inject.mjs
```

## 依赖

- `@agentclientprotocol/sdk` — ACP TypeScript SDK
- `@modelcontextprotocol/sdk` + `zod` — MCP Server (poc-mcp-server.mjs 用)
- Copilot CLI 已安装且已认证
