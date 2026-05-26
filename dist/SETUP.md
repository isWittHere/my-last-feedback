# My Last Feedback — Setup Guide (Latest)

A lightweight MCP feedback GUI for AI-assisted development tools.

This guide includes complete Codex usage steps:
- Streamable HTTP MCP setup (`tool_timeout_sec` supported)
- User-compatible hooks package installation
- Optional desktop quick launch and auto-start

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org

---

## 1) Install Dependencies

Run in repository root:

```bash
npm install
```

---

## 2) Start MCP Server (Recommended)

Use Streamable HTTP entry:

```bash
npm run start:http
```

Default endpoint:

- `http://127.0.0.1:3838/mcp`

---

## 3) Codex MCP Configuration

Edit `~/.codex/config.toml` and add/update:

```toml
[mcp_servers."my-last-feedback"]
type = "sse"
url = "http://127.0.0.1:3838/mcp"
tool_timeout_sec = 64800

[mcp_servers."my-last-feedback".tools.interactive_feedback]
approval_mode = "approve"
```

`64800` seconds = 18 hours.

---

## 4) Codex Hooks Configuration

Use packaged files in `dist/codex-hooks/`:

- `hooks.json` (generic template)
- `hooks.local.example.json` (local example)
- `scripts/inject-agent-name.mjs`
- `README.md` (install instructions)

Recommended install:

1. Copy `dist/codex-hooks/scripts/inject-agent-name.mjs` to:
   `C:\Users\<YOUR_USER>\.codex\hooks\scripts\inject-agent-name.mjs`
2. Copy `dist/codex-hooks/hooks.json` to:
   `C:\Users\<YOUR_USER>\.codex\hooks.json`
3. Replace `<YOUR_USER>` in `hooks.json`.

If only for local machine, you can use `hooks.local.example.json` directly as `hooks.json`.

---

## 5) Agent Instructions

Use `dist/prompt.instructions.md` as Codex instruction source.

---

## 6) Optional: Desktop Quick Launch

You can create launchers for users:

- Visible launch via `.cmd`
- Silent launch via `.vbs`

Typical silent launch command:

```powershell
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList 'run','start:http' -WorkingDirectory 'E:\Dev\my-last-feedback'
```

---

## 7) Optional: Auto-Start on Login (Windows)

If Scheduled Task is unavailable due to permission limits, use:

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

Register a hidden startup command that executes `npm run start:http`.

---

## Legacy STDIO Mode (Compatibility)

If your client only supports process-based MCP:

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"]
    }
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `EADDRINUSE 127.0.0.1:3838` | Another instance is running. Stop old process or change port using `MLFB_MCP_PORT`. |
| Tool call timeout | Verify `tool_timeout_sec` is configured on `my-last-feedback` MCP server entry. |
| Hook not triggered | Check `~/.codex/hooks.json` path and script command path. |
| GUI not showing | Ensure desktop app binary is available and MCP server can launch/connect to it. |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MLFB_MCP_HOST` | HTTP bind host | `127.0.0.1` |
| `MLFB_MCP_PORT` | HTTP bind port | `3838` |
| `MLF_APP_PATH` | Override GUI binary path | auto-detect |
| `MLF_CALLER_NAME` | Caller display name | `codex` |

---

MIT License © 2025
