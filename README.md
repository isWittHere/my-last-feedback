# My Last Feedback

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides a **human-in-the-loop feedback GUI** for AI-assisted development tools such as [Cursor](https://www.cursor.com), [Cline](https://cline.bot), [Windsurf](https://windsurf.com), and VS Code Copilot.

Built with **Tauri 2.0 + React 19**, replacing the original PySide6 implementation with a lightweight (~9 MB) native binary.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Interactive feedback window** | A native desktop GUI pops up whenever the AI agent requests feedback |
| **Markdown summary** | Agent summaries are rendered as rich Markdown |
| **Task title in title bar** | The `request_name` is displayed in the custom title bar |
| **Image attachments** | Attach via file picker, Ctrl+V clipboard paste, or drag-and-drop |
| **Quick action buttons** | One-click preset responses (Start, Continue, Analyze, Fix, Explain) |
| **Custom prompt buttons** | Load `.prompt.md` files from `mcp_prompts/` as clickable buttons |
| **Test log section** | Dedicated area for pasting test output |
| **Enhancement reminder** | Optional checkbox that reminds the agent to call feedback again |
| **Always-on-top** | Pin button keeps the window above other windows |
| **Dark theme** | Modern dark UI with custom title bar |
| **i18n** | English and Chinese interface |
| **Tiny binary** | ~9 MB vs ~150 MB+ for PySide6 |

---

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) **18+** and npm
- [Rust](https://rustup.rs/) **1.70+** (for building the GUI app)

---

## 📦 Build

```bash
# 1. Install MCP server dependencies (project root)
npm install

# 2. Install frontend dependencies
cd app
npm install

# 3. Build the Tauri app (produces app/src-tauri/target/release/app.exe)
npx tauri build --no-bundle
```

The built binary is at:
- **Windows**: `app/src-tauri/target/release/app.exe`
- **macOS/Linux**: `app/src-tauri/target/release/app`

---

## ⚙️ MCP Configuration

### Cursor

Add to your Cursor MCP configuration (`~/.cursor/mcp.json` or project-level):

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": [
        "/path/to/my-last-feedback/server.mjs"
      ],
      "timeout": 600,
      "autoApprove": [
        "interactive_feedback"
      ]
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "my-last-feedback": {
      "command": "node",
      "args": [
        "/path/to/my-last-feedback/server.mjs"
      ],
      "timeout": 600
    }
  }
}
```

### Cline / Windsurf

Use the same `command` / `args` pattern in the respective tool's MCP settings.

> Replace `/path/to/my-last-feedback` with the actual path to this project directory.

See [`mcp.json.template`](mcp.json.template) for a ready-to-use template.

---

## 📝 Prompt Setup

Add the following to your AI assistant's custom rules (e.g. `.cursor/rules/`, VS Code `.instructions.md`):

```markdown
---
name: interactive-feedback
description: For ALL Requests, use the interactive-feedback tool to get user confirmation.
applyTo: '**'
---
## MUST FOLLOW:
Whenever you're about to complete a user request, call the interactive_feedback tool instead of simply ending the process.

## Usage Rules:
- Call interactive_feedback when user confirmation is needed (testing, terminal commands, reports, questions)
- Call interactive_feedback before completing any user request
- Keep calling interactive_feedback until the user's feedback is empty, then end the request
```

---

## 🔧 Tool Reference

### `interactive_feedback`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_directory` | `string` | ✅ | Full path to the project directory |
| `summary` | `string` | ✅ | Summary in **Markdown format** — use headings (`##`), lists (`-`), bold (`**text**`), code blocks |
| `request_name` | `string` | ✅ | Concise task title (5–10 words) shown in the title bar |

#### Example

```json
{
  "project_directory": "/path/to/your/project",
  "request_name": "Refactor authentication module",
  "summary": "## Changes Made\n\n- Extracted token logic into `auth/token.py`\n- Added unit tests\n\n## Next Steps\n\n- Review updated tests"
}
```

#### Return Value

Returns a list of MCP content blocks (`TextContent` and/or `ImageContent`):

```json
[
  {
    "type": "text",
    "text": "## User Feedback\n[feedback text]\n\n## Reminder\nPlease use interactive_feedback again."
  },
  {
    "type": "image",
    "data": "<base64>",
    "mimeType": "image/png"
  }
]
```

---

## 🖼️ Image Attachments

| Method | How |
|--------|-----|
| **File picker** | Click the **📎 Attach** button |
| **Clipboard** | Press **Ctrl+V** in the feedback text area |
| **Drag & drop** | Drag files onto the window |

### Limits

| Limit | Value |
|-------|-------|
| Max images | 5 |
| Max per image | 5 MB |
| Max total | 20 MB |
| Formats | PNG, JPG, JPEG, GIF, WEBP, BMP |

---

## 📁 Custom Prompt Buttons

Place `.prompt.md` files in `mcp_prompts/`. Each file needs YAML front matter:

```markdown
---
name: "Run Tests"
description: "Ask the agent to run the test suite"
---
Please run the full test suite and report any failures.
```

Clicking the button appends the prompt body to feedback and submits immediately.

---

## 🏗️ Project Structure

```
my-last-feedback/
├── server.mjs              # MCP Server (Node.js, stdio transport)
├── package.json            # Node.js project config
├── mcp.json.template       # MCP config template
├── mcp_prompts/            # Custom prompt button templates
│   ├── compact.prompt.md
│   └── knowledge_maker.prompt.md
├── app/                    # Tauri 2.0 desktop app
│   ├── src/                # React 19 frontend
│   │   ├── components/     # UI components
│   │   ├── store/          # Zustand state management
│   │   └── i18n/           # Internationalization (en/zh)
│   └── src-tauri/          # Rust backend
│       ├── src/lib.rs      # Tauri commands
│       └── tauri.conf.json # Window config
└── ref-repos/              # Reference implementation (PySide6)
```

---

## 🔄 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MLF_APP_PATH` | Override Tauri binary path | Auto-detect |

---

## 📄 License

See [LICENSE](LICENSE) for details.
