# My Last Feedback

A developer companion GUI for AI-assisted workflows. Provides interactive feedback, integrated development tools, and knowledge management — all in a single desktop app that works with your AI coding agent.

Works with [Cursor](https://www.cursor.com), [VS Code Copilot](https://code.visualstudio.com/), [Cline](https://cline.bot), [Windsurf](https://windsurf.com), [Codex](https://github.com/openai/codex), and any AI tool supporting the [Model Context Protocol](https://modelcontextprotocol.io/).

Built with **Tauri 2.0 + React 19** — binary is only ~11 MB.

[中文文档](README_zh.md)

---

## Features

### Core — Interactive Feedback

| Feature | Description |
|---------|-------------|
| **Feedback Window** | Native desktop popup when the agent requests feedback |
| **Markdown Rendering** | Agent work summaries displayed as rich Markdown with KaTeX math and Mermaid diagrams |
| **Multi-Caller Support** | Multiple AI clients connect simultaneously — tab switching, caller merge, alias, reordering |
| **Image Attachments** | File picker, Ctrl+V clipboard paste, or drag-and-drop (up to 5 images) |
| **Structured Questions** | Agents can present radio-button choices or free-text inputs inside the feedback form |
| **Quick Actions** | One-click preset responses (Start, Continue, Analyze, Fix, etc.) |
| **Custom Prompts** | Drop `.prompt.md` files into `mcp_prompts/` to create clickable submit buttons |
| **MCP Config Helper** | Built-in config generator with auto-detected installation path and one-click copy |
| **Transfer & Split** | Forward feedback to another caller; split a request into separate sub-sessions |
| **Session Navigation** | Four view modes — active, recent, search, and per-caller history |

### Built-in Panels

| Panel | Description |
|-------|-------------|
| **Terminal** | Full PTY terminal with multi-tab support, buffer persistence, and PS1-aware output |
| **Git** | Log history, staged/unstaged diff breakdown, and one-click quick backup |
| **Preview Browser** | Embedded browser panel for inspecting running dev servers or local files |
| **My Last Chat (MLC)** | Knowledge base side panel — browse, search, favorite, and preview Markdown documents |
| **Project Resources** | Directory tree browser for the current workspace |
| **Subscriptions** | Monitor dashboard feeds, API usage, and model balance in one place |

### General

| Feature | Description |
|---------|-------------|
| **Dual Theme** | Dark and light theme support |
| **Bilingual** | Full English and Chinese interface |
| **Tray + Auto-Start** | System tray with show/quit; optional launch at system startup |
| **Single Instance** | Automatically reuses the running instance |
| **Persistent History** | All sessions, callers, and draft feedback survive restarts |
| **Dock Panels** | Resizable three-column dock layout — drag panels between columns |

---

## How It Works

```
AI Agent ──stdio──▶ MCP Server (Node.js) ──TCP IPC──▶ Tauri Desktop App (GUI)
                          ▲                                  ↓
                          │                             User Feedback
                          │                                  ↓
AI Agent ◀── Text + Images ◀─────────────────────────── Submit
```

1. The AI client calls the `interactive_feedback` tool via MCP protocol
2. `mcp/mlfb/index.mjs` connects to the Tauri desktop app over TCP IPC
3. The user views the agent's work summary, writes feedback, and attaches images
4. Feedback (text + images) is returned to the agent via MCP

The desktop app launches automatically on the first call and is reused for subsequent requests. On client disconnect, all pending sessions are automatically cancelled.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) **18+**

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your AI Tool

The MCP entry point is `mcp/mlfb/index.mjs`. Replace the path below with your actual installation path.

#### Cursor

Add to `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
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
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "timeout": 600
    }
  }
}
```

#### Codex

Edit `~/.codex/config.toml`:

```toml
[mcp_servers."my-last-feedback"]
type = "stdio"
command = "node"
args = ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"]
tool_timeout_sec = 64800
enabled = true

[mcp_servers."my-last-feedback".tools.interactive_feedback]
approval_mode = "approve"
```

For Codex hook-based agent name injection, see `dist/codex-hooks/` and `dist/SETUP.md`.

#### Cline / Windsurf / Other

Use the same `command` / `args` pattern in the tool's MCP settings. A template is available at `mcp.json.template`.

> The built-in **MCP Config Helper** (gear icon → General tab) can auto-generate the correct configuration with your actual installation path.

### 3. Add Agent Instructions

Add these rules to your AI tool's custom instructions:

| Tool | Location |
|------|----------|
| Cursor | `<project>/.cursor/rules/interactive_feedback.instructions.md` |
| VS Code | `.github/copilot-instructions.md` or `.vscode/*.instructions.md` |
| Codex | Copy the content of `dist/prompt.instructions.md` into your Codex instructions |
| Cline | Custom instructions in settings |

```markdown
## MUST FOLLOW:
Whenever you're about to complete a user request, call the interactive_feedback tool.

## Rules:
- Call interactive_feedback when user confirmation is needed (testing, terminal commands, reports, questions)
- Call interactive_feedback before completing any user request
- Keep calling interactive_feedback until the user's feedback is empty, then end the request
- Every interactive_feedback call MUST include request_type.

## Agent Identity (agent_name)
- agent_name is required. Use the 4-character identifier assigned by the feedback response or hook context.
- Do not invent or replace agent_name. If unknown, obtain the assigned identifier before calling interactive_feedback.
- On ALL subsequent calls, you MUST pass that identifier back as agent_name.

## Request Type (request_type)
- request_type is required in every call.
- Allowed values: analysis, completion, planning, document.
- Use analysis for analysis or reports, completion for finished work, planning for plans, document for document-related tasks.
- request_type is metadata for categorization and visual display only; it does not change tool behavior, permissions, routing, or available capabilities.

## Questions Feature
- When you need the user to supplement information or choose from options, use the questions parameter.
- questions is an array of { label, options? }. With options → radio buttons; without → free-text input.
- Questions are short labels only. Describe full context in summary, use questions for concise choices.

## Transfer Feature (transfer_to_alias)
- When user feedback contains transfer instructions (e.g. "send this to Alice"), set transfer_to_alias to the target alias in the next interactive_feedback call.
- Once transfer is triggered, continue calling interactive_feedback normally — the new caller will handle the remaining workflow.
```

### 4. Done

The agent will now pop up a feedback window whenever it needs your confirmation.

---

## Tool Reference

### `interactive_feedback`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_directory` | `string` | Yes | Full path to the project directory |
| `summary` | `string` | Yes | Work summary in Markdown format (no `\n` escape sequences) |
| `request_name` | `string` | Yes | Concise task title (5–10 words), shown in the title bar |
| `request_type` | `string` | Yes | One of `analysis`, `completion`, `planning`, `document` |
| `agent_name` | `string` | Yes | 4-character uppercase hex identifier. Pass the assigned ID on subsequent calls |
| `questions` | `array` | No | Structured questions: `[{ label: string, options?: string[] }]` |
| `transfer_to_alias` | `string` | No | Transfer the session to another caller by alias name |

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
| `MLF_DEV` | Run in dev mode (separate data directory) | Unset |
| `MLF_CALLER_NAME` | Override caller display name | `codex` |

| Variable (Rust backend) | Description | Default |
|--------------------------|-------------|---------|
| `MLFB_REMOTE_ENABLED` | Enable remote HTTP+WS server (experimental) | Unset |

---

## Experimental Features (In Development)

These features exist in the codebase but are **not shipped** in the current release. They may be gated behind feature flags, require manual opt-in, or have incomplete implementations.

### MLRA — Multi-agent Long-Running Agentic Workflow

An orchestration platform for multi-agent, multi-stage autonomous workflows with human-in-the-loop oversight.

| Component | Status |
|-----------|--------|
| Daemon (orchestrator, router, IPC bridge) | Code complete, not shipped |
| CEO / Expert / Inspector MCP servers | Code complete, not shipped |
| Frontend UI (MLRA view, role icons, stage pipeline) | Code complete, UI hidden (`VITE_DISABLE_MLRA_UI=true`) |
| Worker sub-agent pool | Disabled (`WORKER_ENABLED=false`), code retained |

See `.myLastChat/MLC_MLRA_v2_三Server重构架构.md` and `mcp/mlra/` for architecture details.

### Android Companion App (`android-mlfb/`)

A Kotlin-based Android app for receiving and responding to feedback requests from mobile devices. Built separately from the Tauri desktop app via Gradle.

See `android-mlfb/README.md` for build instructions.

### Remote Server

An HTTP + WebSocket server (`remote.rs`) enabling mobile clients to connect over Tailscale. Currently a Phase 0 skeleton — only a `/api/health` endpoint is implemented. Opt-in via `MLFB_REMOTE_ENABLED=1`.

### Agent Console

Full child-process management backend (`agent_process.rs`) — start, write stdin, read stdout/stderr, kill. The React frontend is complete but hidden behind `VITE_DISABLE_AGENT_UI=true`.

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

# Package for distribution
bash scripts/package-win.sh
```

Output: `app/src-tauri/target/release/app.exe` (Windows) or `app/src-tauri/target/release/app` (macOS/Linux)

See [BUILD.md](BUILD.md) for the full build guide and [CONTRIBUTING.md](CONTRIBUTING.md) for the repository maintenance guide.

---

## Project Structure

```
my-last-feedback/
├── mcp/                        # MCP servers (Node.js)
│   ├── common/                 # Shared utilities (port discovery, child launcher, bootstrap)
│   ├── mlfb/                   # My Last Feedback MCP server
│   │   ├── index.mjs           # Entry point (stdio MCP server)
│   │   ├── app-ipc.mjs         # TCP IPC bridge to the Tauri app
│   │   ├── http-server.mjs     # Optional HTTP MCP server
│   │   └── tools/              # Tool definitions
│   └── mlra/                   # MLRA multi-agent orchestration (development / not shipped)
├── app/                        # Tauri 2.0 desktop application
│   ├── src/                    # React 19 frontend
│   │   ├── components/         # UI components
│   │   ├── store/              # Zustand state management
│   │   ├── i18n/               # Internationalization (en/zh)
│   │   └── transport/          # IPC transport layer
│   └── src-tauri/              # Rust backend
│       └── src/                # Tauri commands, IPC, terminal, preview browser, git, etc.
├── mcp_prompts/                # Custom prompt button templates
├── dist/                       # Distribution package & Codex hooks
│   ├── codex-hooks/            # Codex hook scripts
│   └── win-x64/                # Windows x64 release package
├── android-mlfb/               # Android companion app (in development)
├── scripts/                    # Build & packaging scripts (Win/Mac)
├── BUILD.md                    # Build guide
└── CONTRIBUTING.md             # Repository maintenance guide
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri 2.0 |
| Frontend | React 19 + TypeScript + Vite 7 |
| CSS | Tailwind CSS 4 |
| State management | Zustand 5 |
| Terminal | xterm.js 6 |
| Markdown | react-markdown + remark-gfm + KaTeX + Mermaid |
| Internationalization | i18next |
| MCP protocol | @modelcontextprotocol/sdk 1.12 |
| Backend | Rust 2021 (tokio, axum, portable-pty) |

---

## License

MIT License — see [LICENSE](LICENSE) for full text.
