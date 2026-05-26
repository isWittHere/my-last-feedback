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

## 2) MCP Server Entry (Recommended)

Use stdio MCP entry:

```bash
node E:/Dev/my-last-feedback/mcp/mlfb/index.mjs
```

---

## 3) Codex MCP Configuration

Edit `~/.codex/config.toml` and add/update:

```toml
[mcp_servers."my-last-feedback"]
type = "stdio"
command = "node"
args = ["E:/Dev/my-last-feedback/mcp/mlfb/index.mjs"]
tool_timeout_sec = 64800
enabled = true

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

## Legacy JSON Mode (Compatibility)

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
| MCP process failed to start | Verify `node` is available in PATH and `args` points to `mcp/mlfb/index.mjs`. |
| Tool call timeout | Verify `tool_timeout_sec` is configured on `my-last-feedback` MCP server entry. |
| Hook not triggered | Check `~/.codex/hooks.json` path and script command path. |
| GUI not showing | Ensure desktop app binary is available and MCP server can launch/connect to it. |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MLF_APP_PATH` | Override GUI binary path | auto-detect |
| `MLF_CALLER_NAME` | Caller display name | `codex` |

---

MIT License © 2025
