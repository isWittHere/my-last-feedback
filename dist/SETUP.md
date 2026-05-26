# My Last Feedback — Setup Guide (Latest)

A lightweight MCP feedback GUI for AI-assisted development tools.

This guide is updated for the latest setup, including:
- `STDIO` mode (legacy-compatible)
- `Streamable HTTP` mode (recommended for long-running tools and `tool_timeout_sec`)

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

## 2) Choose Transport Mode

## Recommended: Streamable HTTP (for Codex)

### Start MCP HTTP server

```bash
npm run start:http
```

Default endpoint:

- `http://127.0.0.1:3838/mcp`

### Codex config (`~/.codex/config.toml`)

```toml
[mcp_servers."my-last-feedback"]
type = "sse"
url = "http://127.0.0.1:3838/mcp"
tool_timeout_sec = 64800

[mcp_servers."my-last-feedback".tools.interactive_feedback]
approval_mode = "approve"
```

`64800` seconds = 18 hours.

## Legacy: STDIO mode

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

## 3) Add Agent Instructions

Use `dist/prompt.instructions.md` as your tool instruction source.

The instruction must enforce calling `interactive_feedback` for important confirmations and before completion.

---

## 4) Optional: Desktop One-Click Launch

You can create local launchers for convenience:

- Visible launcher: `.cmd`
- Silent launcher: `.vbs`

Typical silent command:

```powershell
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList 'run','start:http' -WorkingDirectory 'E:\Dev\my-last-feedback'
```

---

## 5) Optional: Auto-Start on Login (Windows)

If Scheduled Task permissions are restricted, use `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

Startup command should launch `npm run start:http` in hidden mode.

---

## Directory Notes

Key files:

- `mcp/mlfb/index.mjs` — stdio entry
- `mcp/mlfb/http-server.mjs` — streamable HTTP entry
- `dist/prompt.instructions.md` — agent instruction template
- `package.json` — includes `start` and `start:http`

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `EADDRINUSE 127.0.0.1:3838` | Another instance already running. Stop old process or change port via `MLFB_MCP_PORT`. |
| Tool call times out in Codex | Verify `tool_timeout_sec` is set on the MCP server entry. |
| GUI not showing | Ensure desktop app binary is available and MCP server can launch/connect to it. |
| Client cannot connect `/mcp` | Check local firewall and confirm server is listening on `127.0.0.1:3838`. |

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
