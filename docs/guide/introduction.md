# Introduction

My Last Feedback is a developer companion GUI for AI-assisted workflows. It provides interactive feedback, integrated development tools, and knowledge management — all in a single desktop app that works with your AI coding agent.

## What is My Last Feedback?

My Last Feedback is a desktop application that bridges the gap between AI coding agents and developers. When your AI agent needs feedback or clarification, My Last Feedback provides a native desktop popup with rich formatting, image support, and structured input options.

## Key Features

- **Interactive Feedback**: Native desktop popup when your AI agent requests feedback
- **Built-in Dev Tools**: Terminal, Git panel, preview browser, and project explorer
- **Knowledge Management**: My Last Chat side panel for document browsing and search
- **Multi-Agent Support**: Works with Cursor, VS Code Copilot, Cline, Windsurf, and more
- **Dual Theme & Bilingual**: Dark/light themes with English and Chinese interfaces
- **Lightweight**: Built with Tauri 2.0 + React 19 — binary is only ~11 MB

## How It Works

My Last Feedback uses the Model Context Protocol (MCP) to communicate with AI coding agents. When an agent needs feedback, it sends a request through MCP, and My Last Feedback displays a native desktop window for the developer to respond.

```
AI Agent → MCP Server → TCP IPC → Tauri GUI → Developer Feedback → Return to Agent
```

## Supported AI Tools

My Last Feedback works with any AI tool that supports the Model Context Protocol:

- [Cursor](https://www.cursor.com)
- [VS Code Copilot](https://code.visualstudio.com/)
- [Cline](https://cline.bot)
- [Windsurf](https://windsurf.com)
- [Codex](https://github.com/openai/codex)
- Any other MCP-compatible tool

## Getting Started

Ready to get started? Check out the [Installation Guide](/guide/installation) to set up My Last Feedback on your system.