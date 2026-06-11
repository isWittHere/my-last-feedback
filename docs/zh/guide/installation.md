# 安装指南

本指南将帮助你在系统上安装和设置 My Last Feedback。

## 前置要求

在安装 My Last Feedback 之前，请确保你已具备以下条件：

- **Node.js** 18 或更高版本
- **npm**（随 Node.js 一起安装）

## 下载

### Windows

1. 从 [GitHub Releases](https://github.com/isWittHere/my-last-feedback/releases) 下载最新版本
2. 将 ZIP 压缩包解压到你选择的位置
3. 运行 `My Last Feedback.exe`

### macOS

1. 从 [GitHub Releases](https://github.com/isWittHere/my-last-feedback/releases) 下载最新版本
2. 将 TAR.GZ 压缩包解压到你选择的位置
3. 使二进制文件可执行：
   ```bash
   chmod +x app
   ```
4. 运行应用程序：
   ```bash
   ./app
   ```

## MCP 配置

要将 My Last Feedback 与你的 AI 编程工具一起使用，你需要配置 MCP 服务器：

### 自动配置

1. 启动 My Last Feedback
2. 点击侧边栏中的"MCP 配置"按钮
3. 应用程序将自动检测你的安装路径
4. 点击"复制"将配置复制到剪贴板
5. 将配置粘贴到你的 AI 工具的 MCP 设置文件中

### 手动配置

将以下内容添加到你的 AI 工具的 MCP 配置文件中：

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

将 `/path/to/my-last-feedback` 替换为你的实际安装路径。

## 支持的 AI 工具

My Last Feedback 支持所有支持模型上下文协议的 AI 工具：

- **Cursor**：添加到 `~/.cursor/mcp.json`
- **VS Code Copilot**：添加到 VS Code 设置
- **Cline**：添加到 Cline 的 MCP 配置
- **Windsurf**：添加到 Windsurf 的 MCP 设置
- **Codex**：添加到 Codex 配置

## 验证

配置完成后：

1. 重启你的 AI 编程工具
2. 开始与你的 AI Agent 对话
3. 当 Agent 需要反馈时，My Last Feedback 应该会显示一个弹窗

## 故障排除

### 应用程序无法启动

- 确保已安装 Node.js 18+：`node --version`
- 检查二进制文件是否具有执行权限（macOS/Linux）

### MCP 连接失败

- 验证 MCP 配置中的路径是否正确
- 确保 MCP 服务器正在运行：`node mcp/mlfb/index.mjs`
- 检查你的 AI 工具的 MCP 设置是否有语法错误

### 弹窗不显示

- 确保 My Last Feedback 正在运行
- 检查应用程序是否最小化到系统托盘
- 验证你的 AI 工具是否正确配置为使用 MCP 服务器