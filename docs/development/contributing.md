# Contributing Guide

Thank you for your interest in contributing to My Last Feedback! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/my-last-feedback.git
   cd my-last-feedback
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/isWittHere/my-last-feedback.git
   ```

## Development Workflow

### 1. Create a Branch

```bash
git checkout dev
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Follow the code style guidelines below
- Write clear commit messages
- Test your changes thoroughly

### 3. Commit Changes

```bash
git add -A
git commit -m "feat(ui): description of your change"
```

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Code Style

### TypeScript / React

- **Components**: Function components + hooks, one component per file
- **State Management**: Zustand store with localStorage persistence
- **Styles**: Pure CSS (`index.css`) with CSS variables for theming
- **i18n**: All user-visible text through `useTranslation()` + `t()` calls
- **Naming**: Components PascalCase, functions/variables camelCase, CSS classes kebab-case

### Rust

- **Tauri Commands**: `#[tauri::command]` macro, return `Result<T, String>` or direct type
- **Error Handling**: `.map_err(|e| e.to_string())`
- **Serialization**: Always use `serde::Serialize` / `Deserialize`
- **Strings**: Prefer `String`, use `to_string_lossy()` for cross-FFI boundaries

### File Organization

| Type | Location | Description |
|------|----------|-------------|
| UI Components | `app/src/components/` | One `.tsx` per feature |
| Global State | `app/src/store/feedbackStore.ts` | Zustand store |
| Styles | `app/src/index.css` | Global styles + CSS variables |
| Translations | `app/src/i18n/locales/{zh,en}.json` | i18n key-value pairs |
| Backend Commands | `app/src-tauri/src/lib.rs` | Tauri commands |
| IPC Communication | `app/src-tauri/src/session.rs` + `ipc.rs` | TCP + JSON |

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]
```

### Type

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `style` | UI/style changes (no logic changes) |
| `refactor` | Code refactoring |
| `docs` | Documentation |
| `chore` | Build/tools/dependency adjustments |
| `i18n` | Internationalization |

### Scope (Optional)

`ui` / `backend` / `mcp` / `ipc` / `build` / `i18n`

### Examples

```
feat(ui): add MCP config helper with path auto-detection
fix(backend): fix get_server_path fallback in dev mode
style(ui): welcome home two-column card layout
docs: add BUILD.md with comprehensive build guide
chore(build): update package-win.sh with zip creation
i18n: add mcpConfig translation keys
```

## Pull Request Process

1. **Update Documentation**: If you change behavior, update relevant docs
2. **Add Tests**: If applicable, add tests for new functionality
3. **Check Builds**: Ensure both frontend and backend build successfully
4. **Review**: Request review from maintainers
5. **Merge**: After approval, your PR will be merged

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

1. **Steps to Reproduce**: Clear steps to reproduce the issue
2. **Expected Behavior**: What you expected to happen
3. **Actual Behavior**: What actually happened
4. **Environment**: OS, Node.js version, Rust version
5. **Screenshots**: If applicable

### Feature Requests

When requesting features:

1. **Description**: Clear description of the feature
2. **Use Case**: Why this feature would be useful
3. **Implementation Ideas**: Any thoughts on implementation

## Code of Conduct

Please be respectful and inclusive in all interactions. We are committed to providing a welcoming and inclusive experience for everyone.

## Questions?

If you have questions about contributing, feel free to:

- Open an issue on GitHub
- Ask in discussions
- Contact maintainers

Thank you for contributing to My Last Feedback!