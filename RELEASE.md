# My Last Feedback v0.1.2 Release Notes

## ✨ New Features & Improvements

### 1. CallerManager Hide/Show Functionality
- Hide individual callers from the top bar tabs with an eye icon
- Auto-unhide when new requests arrive
- Hidden state persisted in localStorage

### 2. Caller Merge with [System] Injection
- When merging callers, pending sessions receive a `[System]` notification with the new agent_name
- Dual-layer implementation:
  - Summary prefix injection (frontend + backend)
  - Dynamic alias replacement in responses (MCP server)

### 3. macOS Drag-and-Drop Fix
- Fixed CallerTabs drag-reorder on macOS by:
  - Adding `setData()` call for WebKit compatibility
  - Ensuring tab button is always the drag event target with `pointer-events`
  - Removing redundant drag-region attributes

### 4. macOS UI Adaptation (Overlay Title Bar)
- Native traffic lights on macOS (red/yellow/green)
- Rounded window corners (automatic via native decorations)
- Proper spacing for traffic lights in the title bar
- Platform-specific button visibility (Windows buttons hidden on macOS)
- Acceptance of first mouse click on inactive windows

### 5. Bug Fixes
- Fixed clipboard copy buttons (added missing `clipboard-manager:allow-write-text` permission)

## 📦 Package Contents

- `app.exe` - Main application binary (11 MB)
- `server.mjs` - MCP server bridge
- `package.json` + `node_modules/` - Node.js dependencies
- `mcp.json.template` - MCP configuration template
- `SETUP.md` - Installation instructions
- `prompt.instructions.md` - Prompt customization guide
- `mcp_prompts/` - Example prompt files

**Total Package Size**: 7.65 MB (compressed)

## 🔧 Technical Details

### File Changes

#### Rust Backend
- **tauri.conf.json**: Added `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `acceptFirstMouse: true`
- **src/lib.rs**: Added platform-conditional `set_decorations(false)` for Windows
- **src/session.rs**: Extended FeedbackPayload with `caller_alias` field for dynamic alias injection
- **capabilities/default.json**: Added `clipboard-manager:allow-write-text` permission

#### React Frontend
- **components/FeedbackApp.tsx**: Added `IS_MACOS` platform detection, conditional rendering for window controls, title bar padding
- **components/CallerTabs.tsx**: Added `setData()` for WebKit drag compatibility
- **components/CallerManager.tsx**: Added hide/show eye icon buttons
- **index.css**: Added `pointer-events: none` for tab children, `cm-caller-hidden` styling
- **store/feedbackStore.ts**: Added hidden callers management with localStorage persistence

#### MCP Server
- **server.mjs**: Dynamic alias selection for [System] messages

## ✅ Verification

- Rust build: Clean (0 errors)
- TypeScript: Zero errors
- All locale files updated (Chinese + English)

## 🚀 Installation & Usage

See [SETUP.md](dist/win-x64/my-last-feedback/SETUP.md) for installation steps.

## 📝 Known Limitations

- macOS build has not been tested on actual macOS hardware (changes are code-only)
- WiX bundler skipped (use included `app.exe` directly or manual MSI creation)
