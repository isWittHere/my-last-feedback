# My Last Feedback — Setup Guide

A lightweight MCP feedback GUI for AI-assisted development tools (Cursor, VS Code Copilot, Cline, Windsurf).

---

## Prerequisites

- **Node.js 18+** — [https://nodejs.org](https://nodejs.org)

---

## Quick Start

### 1. Install Dependencies

Open a terminal in this directory and run:

```bash
npm install
```

### 2. Configure Your AI Tool

#### Cursor

Add to `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": [
        "C:/path/to/my-last-feedback/server.mjs"
      ],
      "timeout": 600,
      "autoApprove": [
        "interactive_feedback"
      ]
    }
  }
}
```

#### VS Code (Copilot)

Add to `<project>/.vscode/mcp.json`:

```json
{
  "servers": {
    "my-last-feedback": {
      "command": "node",
      "args": [
        "C:/path/to/my-last-feedback/server.mjs"
      ],
      "timeout": 600
    }
  }
}
```

#### Cline / Windsurf

Use the same `command` / `args` pattern in the respective tool's MCP settings.

> **Important**: Replace `C:/path/to/my-last-feedback` with the actual path where you placed this folder.

See `mcp.json.template` for a ready-to-use template.

### 3. Add Agent Instructions

Copy `prompt.instructions.md` to your AI tool's instruction directory:

| Tool | Location |
|------|----------|
| Cursor | `<project>/.cursor/rules/interactive_feedback.instructions.md` |
| VS Code | `<project>/.github/copilot-instructions.md` or `.vscode/` prompts |
| Cline | Custom instructions in settings |

This tells the AI agent to call `interactive_feedback` before completing requests.

### 4. Done!

The agent will now open a feedback window whenever it needs your confirmation.

---

## Directory Structure

```
my-last-feedback/
├── app.exe / app          # GUI application (Windows / macOS)
├── server.mjs             # MCP server (Node.js)
├── package.json           # Node dependencies
├── node_modules/          # (created after npm install)
├── mcp.json.template      # MCP config template
├── prompt.instructions.md # Agent instruction rules
├── SETUP.md               # This file
└── mcp_prompts/           # Custom prompt buttons
    ├── compact.prompt.md
    └── knowledge_maker.prompt.md
```

---

## Custom Prompt Buttons

Place `.prompt.md` files in the `mcp_prompts/` folder. Each file uses YAML front matter:

```markdown
---
name: "Button Label"
description: "Tooltip text"
icon: "book"
---
Your prompt content here...
```

### Available Icons

> book, file, file-text, edit, code, terminal, search, message, chat, brain, lightbulb, star, folder, settings, database, link, list, check, play, zap, compass, layers, globe, target, shield, clock, tag, tool, box, hash, wand, sparkles, clipboard, rocket, bug, summary, knowledge, magic, refresh, send, download, upload, alert, info

Buttons appear at the bottom of the feedback window. Clicking a button sends its content as feedback.

Prompts reload automatically when the window regains focus — no restart needed.

You can enable/disable individual prompts in **Settings → Prompts**.

---

## Settings

Click the ⚙ gear icon in the title bar to access:

- **Display**: Theme (Dark/Light) and Language (English/中文)
- **Prompts**: Enable/disable individual prompt buttons
- **About**: Version info

---

## Image Attachments

| Method | How |
|--------|-----|
| File picker | Click **📎 Attach** |
| Clipboard | **Ctrl+V** in the text area |
| Drag & drop | Drag files onto the window |

Limits: 5 images max, 5 MB each, 20 MB total. Formats: PNG, JPG, GIF, WEBP, BMP.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Window doesn't appear | Check that `app.exe` (or `app`) is in the same directory as `server.mjs` |
| "Cannot find module" error | Run `npm install` in this directory |
| Agent doesn't call the tool | Ensure `prompt.instructions.md` is added to your agent instructions |
| Port conflict | The app uses ports 19850–19860 for IPC |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MLF_APP_PATH` | Override the GUI binary path |
| `MLF_CALLER_NAME` | Set caller display name |

---

MIT License © 2025
