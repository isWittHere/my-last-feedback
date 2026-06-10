# Build Guide

This guide covers building and packaging My Last Feedback for production.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | MCP Server runtime + frontend build |
| **npm** | Comes with Node.js | Dependency management |
| **Rust** | 1.70+ | Tauri backend compilation |
| **Cargo** | Comes with Rust | Rust package management |

### Installing Rust

```bash
# Windows / macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

On Windows, you also need to install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "C++ desktop development" workload.

## Project Structure

```
my-last-feedback/
├── mcp/                    # MCP Server (Node.js, stdio transport)
├── package.json            # MCP Server dependencies
├── mcp.json.template       # MCP configuration template
├── mcp_prompts/            # Custom Prompt button templates
├── BUILD.md                # This file
├── README.md               # Project documentation
│
├── app/                    # Tauri 2.0 desktop application
│   ├── package.json        # Frontend dependencies (React 19, Zustand, i18next...)
│   ├── vite.config.ts      # Vite build configuration
│   ├── tsconfig.json       # TypeScript configuration
│   ├── src/                # React frontend source code
│   │   ├── components/     # UI components
│   │   ├── store/          # Zustand state management
│   │   └── i18n/           # Internationalization (Chinese/English)
│   └── src-tauri/          # Rust backend
│       ├── Cargo.toml      # Rust dependencies
│       ├── tauri.conf.json # Window/application configuration
│       ├── capabilities/   # Tauri permission declarations
│       └── src/
│           ├── lib.rs      # Tauri commands + plugin registration
│           ├── session.rs  # IPC session management
│           ├── ipc.rs      # IPC communication protocol
│           └── main.rs     # Entry point
│
├── scripts/                # Packaging scripts
│   ├── package-win.sh      # Windows packaging
│   └── package-mac.sh      # macOS packaging
│
└── dist/                   # Release package output directory
    ├── SETUP.md            # User installation guide (distributed with release)
    ├── prompt.instructions.md  # Agent instruction file (distributed with release)
    └── win-x64/            # Windows release package
        └── my-last-feedback/
```

## Development Build

### 1. Install Dependencies

```bash
# Project root — MCP Server dependencies
npm install

# app directory — Frontend dependencies
cd app
npm install
```

### 2. Start Development Server

```bash
cd app
npx tauri dev
```

This will start:
- Vite hot-reload development server (frontend)
- Tauri development window (Rust backend)

### 3. Frontend-Only Build

```bash
cd app
npm run build    # tsc + vite build
npm run dev      # Vite development server only
```

## Production Build

### Build Command

```bash
cd app
npx tauri build --no-bundle
```

- `--no-bundle`: Only compiles binary, does not generate installer (.msi / .dmg)
- Frontend automatically runs `npm run build` (tsc + vite build) first
- Rust uses `release` profile (optimized compilation)

### Output Paths

| Platform | Path |
|----------|------|
| Windows | `app/src-tauri/target/release/app.exe` (~11 MB) |
| macOS | `app/src-tauri/target/release/app` |
| Linux | `app/src-tauri/target/release/app` |

### Build Time Reference

| Stage | First Time | Incremental (after code changes) |
|-------|------------|----------------------------------|
| Frontend (Vite) | ~3s | ~3s |
| Backend (Rust) | 3-5 min | 20-30s |

## Release Packaging

### Windows (x64)

**Automatic Packaging (Recommended):**

```bash
# Execute in project root directory
bash scripts/package-win.sh
```

Script flow:
1. `npx tauri build --no-bundle` — Compile release binary
2. Clean and create `dist/win-x64/my-last-feedback/` directory
3. Copy GUI executable as `My Last Feedback.exe`, and copy `mcp/`, `package.json`, `mcp.json.template`, `SETUP.md`, `prompt.instructions.md`
4. Copy `mcp_prompts/*.prompt.md`
5. `npm install --omit=dev` — Install production dependencies (only `@modelcontextprotocol/sdk`)

**Create ZIP Archive:**

```bash
cd dist/win-x64
tar -acf my-last-feedback-win-x64.zip my-last-feedback/
```

> Uses Windows built-in `tar`, the `zip` command in Git Bash may not be available.

**Manual Packaging Steps:**

```bash
# 1. Build
cd app && npx tauri build --no-bundle && cd ..

# 2. Prepare directory
mkdir -p dist/win-x64/my-last-feedback/mcp_prompts

# 3. Copy files
cp app/src-tauri/target/release/app.exe  "dist/win-x64/my-last-feedback/My Last Feedback.exe"
cp -R mcp                                dist/win-x64/my-last-feedback/
cp package.json                          dist/win-x64/my-last-feedback/
cp mcp.json.template                     dist/win-x64/my-last-feedback/
cp dist/SETUP.md                         dist/win-x64/my-last-feedback/
cp dist/prompt.instructions.md           dist/win-x64/my-last-feedback/
cp mcp_prompts/*.prompt.md               dist/win-x64/my-last-feedback/mcp_prompts/

# 4. Install production dependencies
cd dist/win-x64/my-last-feedback
npm install --omit=dev --ignore-scripts
```

### macOS (arm64)

> ⚠️ Must be executed on macOS, Tauri does not support cross-platform compilation.

```bash
# Execute in project root directory on macOS
bash scripts/package-mac.sh
```

Output directory: `dist/mac-arm64/my-last-feedback/`

Create archive:

```bash
cd dist/mac-arm64
tar -czf my-last-feedback-mac-arm64.tar.gz my-last-feedback/
```

## Release Package Contents

The final release package contains the following files:

```
my-last-feedback/
├── My Last Feedback.exe       # Windows GUI application (~11 MB)
├── app                        # macOS/Linux GUI application (for corresponding platform)
├── server.mjs                 # MCP Server (Node.js)
├── package.json               # Node.js project configuration
├── package-lock.json          # Dependency lock file
├── node_modules/              # Production dependencies (~21 MB)
│   └── @modelcontextprotocol/
├── mcp.json.template          # MCP configuration template
├── SETUP.md                   # User installation guide
├── prompt.instructions.md     # Agent instruction rules
└── mcp_prompts/               # Custom Prompt buttons
    ├── compact.prompt.md
    └── knowledge_maker.prompt.md
```

| Item | Size |
|------|------|
| `My Last Feedback.exe` | ~11 MB |
| `node_modules/` | ~21 MB |
| Other files | < 1 MB |
| **Total** | ~32 MB |
| **ZIP compressed** | ~28 MB |

## Custom Prompts

The `mcp_prompts/` directory in the release package can contain `.prompt.md` files as quick buttons in the GUI.

Format:

```markdown
---
name: "Button Name"
description: "Hover tooltip"
icon: "book"
Your prompt content...
```

### Available Icons

The `icon` field supports the following preset icon names:

`book` `file` `file-text` `edit` `code` `terminal` `search` `message` `chat` `brain` `lightbulb` `star` `folder` `settings` `database` `link` `list` `check` `play` `zap` `compass` `layers` `globe` `target` `shield` `clock` `tag` `tool` `box` `hash` `wand` `sparkles` `clipboard` `rocket` `bug` `summary` `knowledge` `magic` `refresh` `send` `download` `upload` `alert` `info`

## Troubleshooting

### Build Failed: `error: failed to remove file app.exe (os error 5)`

The app.exe is running. Close the application first or execute:

```bash
taskkill /f /im app.exe
```

### `zip` Command Not Available in Git Bash

Use Windows native `tar`:

```bash
tar -acf archive.zip folder/
```

The `-a` parameter lets tar automatically choose compression format based on extension.

### MCP Config Helper Shows Fake Paths in Dev Mode

`get_server_path` traverses 6 levels up from the exe location to find `server.mjs`. If still not found, check if `server.mjs` is in the project root.

### `app` Cannot Execute on macOS

```bash
chmod +x app
```

If Gatekeeper blocks:

```bash
xattr -d com.apple.quarantine app
```

### Rust Compilation Very Slow (First Time)

First compilation needs to download and compile all Rust dependencies, typically takes 3-5 minutes. Subsequent incremental compilations are about 20-30 seconds.

### How to Quickly Verify Frontend Changes

During development, use `npx tauri dev` for hot-reload frontend. If you only need to verify CSS/TSX changes without recompiling Rust:

```bash
cd app
npm run build  # Only check TypeScript + Vite build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MLF_APP_PATH` | Override Tauri binary path | Auto-detect |

## Technology Stack

| Layer | Technology |
|-------|------------|
| GUI Framework | Tauri 2.0 |
| Frontend | React 19 + TypeScript + Vite 7 |
| State Management | Zustand 5 |
| Internationalization | i18next |
| Markdown | react-markdown + remark-gfm |
| MCP Server | @modelcontextprotocol/sdk 1.12 |
| Backend Language | Rust (2021 edition) |
| Plugins | clipboard-manager, single-instance, autostart, opener