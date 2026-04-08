# MLRA PoC - VS Code Chat Automation Tests

## 目的

验证 VS Code Chat 编程化命令能力，确认 MLRA 可以通过 VS Code 扩展自动化以下操作：

1. 创建 Copilot Chat session 并设置 agent mode
2. 编程化切换模型
3. 打开多个独立 chat session
4. 选择自定义 agent（.agent.md）
5. 列出可用命令、模型、工具

## 安装

1. 在 VS Code 中按 `Ctrl+Shift+P` → `Developer: Install Extension From Location...`
2. 选择此目录（`.myLastChat/acp-poc/vscode-ext/`）
3. 重新加载 VS Code

或者：

```bash
cd .myLastChat/acp-poc/vscode-ext
ln -s $(pwd) ~/.vscode/extensions/mlra-poc-chat-automation
# 重启 VS Code
```

## 运行测试

`Ctrl+Shift+P` → 搜索 "MLRA PoC" → 选择测试：

| 命令 | 测试内容 |
|------|---------|
| Test 1 - Open Chat | 验证 chat.open 命令参数（mode, query, isPartialQuery） |
| Test 2 - Change Model | 验证 chat.changeModel 命令 |
| Test 3 - Multi Session | 验证打开多个独立 session 的方法 |
| Test 4 - Custom Agent | 验证自定义 agent 选择方法（@语法、agent参数、toggleAgentMode） |
| Test 5 - List Commands | 列出所有 chat/agent/session 相关命令 + 可用模型 + 可用工具 |
| Run All | 按顺序运行全部测试 |

## 查看结果

- **输出面板**：查看 → 输出 → 选择 "MLRA PoC" 通道
- **Chat 面板**：观察 Chat UI 的变化

## 关键验证点

- [ ] chat.open 是否可以自动提交（不设 isPartialQuery）
- [ ] chat.open 是否可以仅预填（isPartialQuery:true）
- [ ] changeModel 是否对当前 session 生效
- [ ] 是否能打开多个独立 chat session
- [ ] @agent 语法是否在 query 中有效
- [ ] agent 参数是否被 chat.open 接受
- [ ] toggleAgentMode 是否支持自定义 agent name
