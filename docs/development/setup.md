# Development Setup

This guide will help you set up a development environment for My Last Feedback.

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

## Clone the Repository

```bash
git clone https://github.com/anthropics/my-last-feedback.git
cd my-last-feedback
```

## Install Dependencies

### MCP Server Dependencies

```bash
# In the project root directory
npm install
```

### Frontend Dependencies

```bash
# In the app/ directory
cd app
npm install
```

## Start Development Server

```bash
cd app
npx tauri dev
```

This will start:
- Vite hot-reload development server (frontend)
- Tauri development window (Rust backend)

Frontend changes will hot-reload in real-time. Rust code changes will trigger recompilation.

## Frontend-Only Development

If you're only making frontend changes (components, styles, i18n):

```bash
cd app
npm run build    # tsc + vite build
npm run dev      # Vite development server only
```

## Backend-Only Development

If you're only making Rust backend changes:

```bash
cd app/src-tauri
cargo check      # Quick type checking without building binary
```

## Project Structure

```
my-last-feedback/
├── mcp/                    # MCP Server (Node.js, stdio transport)
├── package.json            # MCP Server dependencies
├── mcp.json.template       # MCP configuration template
├── mcp_prompts/            # Custom Prompt button templates
├── BUILD.md                # Build and release guide
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

## Data Flow

```
AI Agent → server.mjs (stdio/MCP) → TCP IPC → Tauri (lib.rs)
                                                    ↓
                                              React UI (components/)
                                                    ↓
                                            User Feedback → Return to Agent
```

## Common Development Tasks

### Adding a New UI Component

1. Create a new `.tsx` file in `app/src/components/`
2. Import and use it in the appropriate parent component
3. Add any new CSS to `app/src/index.css`
4. Add i18n keys to `app/src/i18n/locales/{zh,en}.json`

### Adding a New Tauri Command

1. Add the command function in `app/src-tauri/src/lib.rs`
2. Use `#[tauri::command]` macro
3. Return `Result<T, String>` or direct type
4. Register the command in the `invoke_handler`

### Modifying the MCP Server

1. Edit `server.mjs` in the project root
2. Restart your AI client (Cursor/VS Code) to reload the MCP server

## Debugging

### Frontend Debugging

- Use browser developer tools in the Tauri window
- Console logs appear in the terminal where you ran `npx tauri dev`

### Backend Debugging

- Rust compilation errors appear in the terminal
- Use `cargo build 2>&1` to see full compilation output

### MCP Server Debugging

- The MCP server runs as a separate Node.js process
- Check your AI tool's MCP logs for connection issues

## Next Steps

- Read the [Contributing Guide](/development/contributing) for code standards and submission guidelines
- Check the [Build Guide](/development/build) for production builds and packaging
- Review the [Architecture](/development/architecture) for a deeper understanding of the codebase