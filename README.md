# My Last Feedback

A lightweight MCP feedback GUI that lets AI agents request confirmation and feedback from you before completing tasks.

Works with [Cursor](https://www.cursor.com), [VS Code Copilot](https://code.visualstudio.com/), [Cline](https://cline.bot), [Windsurf](https://windsurf.com), and any AI tool supporting the [Model Context Protocol](https://modelcontextprotocol.io/).

Built with **Tauri 2.0 + React 19** — binary is only ~11 MB.

[中文文档](README_zh.md)

---

## Features

| Feature | Description |
|---------|-------------|
| **Feedback Window** | Native desktop popup when the agent requests feedback |
| **Markdown Rendering** | Agent work summaries displayed as rich Markdown |
| **Multi-Caller Support** | Multiple AI clients can connect simultaneously with tab switching and multi-column layout |
| **Image Attachments** | File picker, Ctrl+V clipboard paste, or drag-and-drop (up to 5 images) |
| **Quick Actions** | One-click preset responses (Start, Continue, Analyze, Fix, etc.) |
| **Custom Prompts** | Drop `.prompt.md` files into `mcp_prompts/` to create clickable buttons |
| **MCP Config Helper** | Built-in config generator with auto-detected installation path and one-click copy |
| **Settings Panel** | General settings, display (theme/language), prompt management, about |
| **Dual Theme** | Dark and light theme support |
| **Bilingual** | Full English and Chinese interface |
| **Always-on-Top** | Pin the window above other windows |
| **Auto-Start** | Optional launch at system startup |
| **Single Instance** | Automatically reuses the running instance |

---

## How It Works

```
AI Agent ──stdio──▶ server.mjs (MCP Server) ──TCP IPC──▶ Tauri App (GUI)
                                                              ↓
                                                         User Feedback
                                                              ↓
AI Agent ◀──────── Text + Images returned ◀────────────── Submit
```

1. The AI client calls the `interactive_feedback` tool via MCP protocol
2. `server.mjs` connects to the Tauri desktop app over TCP IPC
3. The user views the agent's work summary and enters feedback in the GUI
4. Feedback (text + images) is returned to the agent via MCP

The desktop app launches automatically on first call and is reused for subsequent requests.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) **18+**

### 1. Install Dependencies

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
      "args": ["/path/to/my-last-feedback/server.mjs"],
      "timeout": 600,
      "autoApprove": ["interactive_feedback"]
    }
  }
}
```

#### VS Code (Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/server.mjs"],
      "timeout": 600
    }
  }
}
```

#### Cline / Windsurf

Use the same `command` / `args` pattern in the tool's MCP settings.

> Replace `/path/to/my-last-feedback` with the actual installation path. After launching the app, the built-in **MCP Config Helper** can auto-generate the correct configuration.

### 3. Add Agent Instructions

Add these rules to your AI tool's custom instructions:

| Tool | Location |
|------|----------|
| Cursor | `<project>/.cursor/rules/interactive_feedback.instructions.md` |
| VS Code | `.github/copilot-instructions.md` or `.vscode/*.instructions.md` |
| Cline | Custom instructions in settings |

```markdown
## MUST FOLLOW:
Whenever you're about to complete a user request, call the interactive_feedback tool.

## Rules:
- Call interactive_feedback when user confirmation is needed (testing, terminal commands, reports, questions)
- Call interactive_feedback before completing any user request
- Keep calling interactive_feedback until the user's feedback is empty, then end the request

## Agent Identity (agent_name)
- On your first call, leave agent_name empty or omit it.
- The response will assign you an agent identifier (e.g. "B780").
- On ALL subsequent calls, you MUST pass that identifier back as agent_name.

## Questions Feature
- When you need the user to supplement information or choose from options, use the questions parameter.
- questions is an array of { label, options? }. With options → radio buttons; without → free-text input.
- Questions are short labels only. Describe full context in summary, use questions for concise choices.
```

### 4. Done

The agent will now pop up a feedback window whenever it needs your confirmation.

---

## Tool Reference

### `interactive_feedback`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_directory` | `string` | Yes | Full path to the project directory |
| `summary` | `string` | Yes | Work summary in Markdown format |
| `request_name` | `string` | Yes | Concise task title (5–10 words), shown in the title bar |
| `agent_name` | `string` | No | Agent identifier. Leave empty on first call; pass assigned ID on subsequent calls |
| `questions` | `array` | No | Structured questions: `[{ label: string, options?: string[] }]` |

#### Return Value

Returns a list of MCP content blocks (`TextContent` and/or `ImageContent`):

```json
[
  { "type": "text", "text": "User feedback text" },
  { "type": "image", "data": "<base64>", "mimeType": "image/png" }
]
```

---

## Image Attachments

| Method | How |
|--------|-----|
| File picker | Click the attach button |
| Clipboard | Press Ctrl+V in the feedback area |
| Drag & drop | Drag files onto the window |

| Limit | Value |
|-------|-------|
| Max images | 5 |
| Max per image | 5 MB |
| Max total | 20 MB |
| Formats | PNG, JPG, GIF, WEBP, BMP |

---

## Custom Prompt Buttons

Place `.prompt.md` files in the `mcp_prompts/` directory:

```markdown
---
name: "Run Tests"
description: "Ask the agent to run the test suite"
icon: "play"
---
Please run the full test suite and report any failures.
```

Clicking the button appends the prompt content to feedback and submits immediately.

### Available Icons

The `icon` field supports 45 preset icons:

`book` `file` `file-text` `edit` `code` `terminal` `search` `message` `chat` `brain` `lightbulb` `star` `folder` `settings` `database` `link` `list` `check` `play` `zap` `compass` `layers` `globe` `target` `shield` `clock` `tag` `tool` `box` `hash` `wand` `sparkles` `clipboard` `rocket` `bug` `summary` `knowledge` `magic` `refresh` `send` `download` `upload` `alert` `info`

---

## Settings

Open via the gear icon in the title bar:

| Tab | Contents |
|-----|----------|
| **General** | Auto-start, MCP config helper |
| **Display** | Theme (dark/light), language (中文/EN) |
| **Prompts** | Enable/disable custom prompt buttons |
| **About** | Version info |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MLF_APP_PATH` | Override Tauri binary path | Auto-detect |

---

## Building from Source

### Requirements

- Node.js 18+
- Rust 1.70+ (with cargo)
- Visual Studio Build Tools (Windows)

### Build

```bash
# Install dependencies
npm install
cd app && npm install

# Development mode
npx tauri dev

# Production build
npx tauri build --no-bundle
```

Output: `app/src-tauri/target/release/app.exe` (Windows) or `app/src-tauri/target/release/app` (macOS/Linux)

See [BUILD.md](BUILD.md) for the full build guide and [CONTRIBUTING.md](CONTRIBUTING.md) for the repository maintenance guide.

---

## Project Structure

```
my-last-feedback/
├── server.mjs              # MCP Server (Node.js, stdio + TCP IPC)
├── package.json            # MCP Server dependencies
├── mcp_prompts/            # Custom prompt button templates
├── app/                    # Tauri 2.0 desktop application
│   ├── src/                # React 19 frontend
│   │   ├── components/     # UI components
│   │   ├── store/          # Zustand state management
│   │   └── i18n/           # Internationalization (en/zh)
│   └── src-tauri/          # Rust backend
│       └── src/            # Tauri commands + IPC communication
├── scripts/                # Build & packaging scripts (Win/Mac)
├── BUILD.md                # Build guide
└── CONTRIBUTING.md         # Repository maintenance guide
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2.0 |
| Frontend | React 19 + TypeScript + Vite 7 |
| State management | Zustand 5 |
| Internationalization | i18next |
| MCP protocol | @modelcontextprotocol/sdk 1.12 |
| Backend | Rust 2021 |

---

## License

See [LICENSE](LICENSE).
