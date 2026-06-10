# Architecture

This document provides a high-level overview of the My Last Feedback architecture.

## System Overview

My Last Feedback is a desktop application built with Tauri 2.0 that bridges AI coding agents and developers. The system consists of three main components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Agent      │    │   MCP Server    │    │   Tauri GUI     │
│   (Cursor,      │◄──►│   (Node.js)     │◄──►│   (React +      │
│    VS Code,     │    │                 │    │    Rust)        │
│    etc.)        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   MCP Protocol           TCP IPC              Native Desktop
   (stdio)                (JSON)               Window
```

## Component Details

### 1. MCP Server (`server.mjs`)

The MCP Server is a Node.js application that implements the Model Context Protocol. It runs as a stdio transport server and communicates with AI agents.

**Key Responsibilities:**
- Handle MCP protocol messages from AI agents
- Manage session state and caller information
- Forward feedback requests to the Tauri GUI
- Return developer feedback to the AI agent

**Key Files:**
- `server.mjs` - Main MCP server entry point
- `package.json` - Node.js dependencies

### 2. Tauri Application (`app/`)

The Tauri application is a desktop GUI built with React 19 (frontend) and Rust (backend). It provides the user interface for interacting with AI agents.

**Frontend (React):**
- `app/src/components/` - UI components
- `app/src/store/` - Zustand state management
- `app/src/i18n/` - Internationalization (Chinese/English)

**Backend (Rust):**
- `app/src-tauri/src/lib.rs` - Tauri commands and plugin registration
- `app/src-tauri/src/session.rs` - IPC session management
- `app/src-tauri/src/ipc.rs` - TCP IPC communication protocol

### 3. IPC Communication

The MCP Server and Tauri application communicate via TCP IPC using JSON messages.

**Message Flow:**
```
AI Agent → MCP Server → TCP IPC → Tauri GUI → Developer Feedback → Return to Agent
```

**Message Format:**
```json
{
  "type": "feedback_request",
  "session_id": "uuid",
  "caller": "cursor",
  "content": {
    "summary": "Agent work summary",
    "options": ["Continue", "Fix", "Analyze"]
  }
}
```

## State Management

### Frontend State (Zustand)

The application uses Zustand for state management with localStorage persistence.

**Key Stores:**
- `feedbackStore` - Manages feedback sessions and responses
- `sessionStore` - Manages active sessions and callers
- `uiStore` - Manages UI state (theme, language, panels)

### Backend State (Rust)

The Rust backend manages:
- IPC connections and sessions
- Window state and configuration
- System tray and autostart functionality

## Data Flow

### Feedback Request Flow

1. **AI Agent** sends MCP message requesting feedback
2. **MCP Server** receives message and creates session
3. **MCP Server** sends TCP IPC message to Tauri
4. **Tauri GUI** displays feedback popup to developer
5. **Developer** provides feedback and submits
6. **Tauri GUI** sends feedback back via TCP IPC
7. **MCP Server** returns feedback to AI Agent via MCP

### Session Management

Sessions are managed across multiple layers:

- **MCP Session**: Unique identifier for each AI agent connection
- **IPC Session**: TCP connection between MCP server and Tauri
- **UI Session**: React state for feedback form and history

## Security Considerations

- **Local Only**: All communication happens on localhost
- **No External Network**: No data is sent to external servers
- **Process Isolation**: MCP server runs as separate process
- **Input Validation**: All IPC messages are validated

## Performance

- **Binary Size**: ~11 MB (Tauri + React + Rust)
- **Memory Usage**: ~50-100 MB typical
- **Startup Time**: < 1 second
- **IPC Latency**: < 10 ms typical

## Extensibility

### Adding New AI Agent Support

To support a new AI agent:

1. The agent must support MCP protocol
2. Add agent-specific configuration to MCP config helper
3. Add agent icon and name to UI

### Adding New Features

The architecture supports easy extension:

- **New UI Components**: Add to `app/src/components/`
- **New Tauri Commands**: Add to `app/src-tauri/src/lib.rs`
- **New MCP Tools**: Add to `server.mjs`
- **New IPC Messages**: Add to `app/src-tauri/src/ipc.rs`

## Dependencies

### Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| React | ^19 | UI framework |
| Zustand | ^5 | State management |
| i18next | ^25 | Internationalization |
| react-markdown | ^10 | Markdown rendering |

### Backend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Tauri | ^2 | Desktop application framework |
| serde | ^1 | Serialization/Deserialization |
| tokio | ^1 | Async runtime |

### MCP Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @modelcontextprotocol/sdk | ^1.12 | MCP protocol implementation |

## Build and Deployment

### Development Build

```bash
cd app
npx tauri dev
```

### Production Build

```bash
cd app
npx tauri build --no-bundle
```

### Packaging

```bash
bash scripts/package-win.sh  # Windows
bash scripts/package-mac.sh  # macOS
```

## Future Considerations

- **Plugin System**: Support for custom plugins and extensions
- **Cloud Sync**: Optional cloud synchronization for settings
- **Multi-User**: Support for team collaboration
- **API Gateway**: REST API for external integrations