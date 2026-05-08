# Project Guidelines

## Scope
- This repository contains the My Last Feedback desktop app and its MCP integration layers.
- Prefer editing the primary product code in `app/`, `mcp/`, `mlfb/`, and `mlra/` unless the task explicitly targets another area.
- Treat `ref-repos/` as reference material and `app/src-tauri/target/` as build output. Do not modify either unless the task explicitly requires it.

## Architecture
- `app/` is the Tauri desktop application: React 19 + Vite frontend in `app/src/`, Rust backend in `app/src-tauri/`.
- `mcp/` contains MCP bootstrap and shared transport utilities.
- `mlfb/` contains the My Last Feedback MCP-facing runtime and tool wiring.
- `mlra/` contains the multi-agent long-running workflow runtime.
- `scr_tests/` contains targeted integration and workflow scripts rather than a single unified root test suite.

## Code Style
- Follow existing patterns in the touched area instead of introducing new abstractions or broad refactors.
- For UI work, keep user-visible strings in i18n resources and preserve bilingual behavior.
- Frontend styling lives primarily in `app/src/index.css` and existing component styles; reuse the current design language before adding new patterns.
- Scrollable UI regions should use the shared MLFB scrollbar language: a thin 3px, square-corner rectangular thumb that is transparent by default and appears on hover via the global scrollbar rules. Avoid local scrollbar colors, rounded thumbs, or always-visible custom scrollbars unless a specific platform constraint requires it.
- Avoid adding hover tips, tooltip triggers, or similar hover-only affordances unless they solve a clear discoverability or density problem already present in the product flow.
- For Rust Tauri commands, follow the existing `Result<_, String>` and `map_err(|e| e.to_string())` error handling style.

## Build And Validate
- Install root dependencies with `npm install` from the repository root.
- Install app dependencies with `npm install` from `app/`.
- Validate frontend-only changes with `cd app && npm run build`.
- Validate Rust backend changes with `cd app/src-tauri && cargo check`.
- Run `cd app && npx tauri dev` only when the task needs full app behavior or desktop integration verification.
- If you touch workflow or daemon logic under `mlra/`, `mlfb/`, or IPC-related code, prefer the smallest relevant script in `scr_tests/` instead of inventing a new test path.

## Working Rules
- Keep changes focused. Do not reformat or reorganize unrelated files.
- Update nearby docs when behavior, commands, packaging, or setup expectations change. Prefer linking to `README.md`, `BUILD.md`, and `CONTRIBUTING.md` instead of duplicating long instructions.
- Version bumps are cross-cutting: when asked to change release versions, keep `package.json`, `app/package.json`, and `app/src-tauri/Cargo.toml` in sync.
- Packaging scripts live in `scripts/`; prefer updating those scripts over duplicating packaging logic in ad hoc files.
- 简单的操作或更改不需要你重新构建验证，也不需要检查diff，除非用户明确要求你进行验证或构建。