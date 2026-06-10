# Installation

This guide will help you install and set up My Last Feedback on your system.

## Prerequisites

Before installing My Last Feedback, ensure you have the following:

- **Node.js** 18 or higher
- **npm** (comes with Node.js)

## Download

### Windows

1. Download the latest release from [GitHub Releases](https://github.com/anthropics/my-last-feedback/releases)
2. Extract the ZIP archive to a location of your choice
3. Run `My Last Feedback.exe`

### macOS

1. Download the latest release from [GitHub Releases](https://github.com/anthropics/my-last-feedback/releases)
2. Extract the TAR.GZ archive to a location of your choice
3. Make the binary executable:
   ```bash
   chmod +x app
   ```
4. Run the application:
   ```bash
   ./app
   ```

## MCP Configuration

To use My Last Feedback with your AI coding agent, you need to configure the MCP server:

### Automatic Configuration

1. Launch My Last Feedback
2. Click the "MCP Config" button in the sidebar
3. The app will auto-detect your installation path
4. Click "Copy" to copy the configuration to your clipboard
5. Paste the configuration into your AI tool's MCP settings file

### Manual Configuration

Add the following to your AI tool's MCP configuration file:

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

Replace `/path/to/my-last-feedback` with the actual path to your installation.

## Supported AI Tools

My Last Feedback works with any AI tool that supports the Model Context Protocol:

- **Cursor**: Add to `~/.cursor/mcp.json`
- **VS Code Copilot**: Add to VS Code settings
- **Cline**: Add to Cline's MCP configuration
- **Windsurf**: Add to Windsurf's MCP settings
- **Codex**: Add to Codex configuration

## Verification

After configuration:

1. Restart your AI coding tool
2. Start a conversation with your AI agent
3. When the agent needs feedback, My Last Feedback should display a popup window

## Troubleshooting

### Application doesn't start

- Ensure Node.js 18+ is installed: `node --version`
- Check if the binary has execute permissions (macOS/Linux)

### MCP connection fails

- Verify the path in your MCP configuration is correct
- Ensure the MCP server is running: `node mcp/mlfb/index.mjs`
- Check your AI tool's MCP settings for syntax errors

### Popup doesn't appear

- Ensure My Last Feedback is running
- Check if the application is minimized to system tray
- Verify your AI tool is properly configured to use the MCP server