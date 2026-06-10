# Changelog

All notable changes to My Last Feedback will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Documentation website with VitePress
- GitHub Pages deployment

## [0.3.0] - 2026-04-18

### Added
- **MLRA (Multi-Level Review Agent)** system
  - Backend orchestrator for multi-worker collaboration
  - 6-role frontend migration (CEO, Planning Expert, Planning Inspector, Execution Expert, Execution Inspector, Worker)
  - Tauri event integration with AGENTS.md tail injection
- **UI Framework**
  - MLRA UI scaffold with IdenticonAvatar, dual-line title bar, phase switching
  - Unified Launcher page with sidebar deduplication
  - Timer stats popover improvements
  - Task input UI with context display
- **Reliability fixes**
  - Message queue mechanism
  - Stall arbitration
  - Progress tracking
  - Worker timeout handling
- **Prompt Engineering**
  - Prompt engineering refactor
  - Rejection lock mechanism
  - Worker dormancy mode

### Changed
- SummaryPanel link click handling (supports web URLs and local file paths)
- P0-P3 UI component standardization refactor
- Version unified to 0.3.0

### Fixed
- Various stability improvements

## [0.2.1] - 2026-04-01

### Added
- MCP configuration helper with auto-detection
- Quick backup functionality in Git panel
- Custom prompt button support

### Changed
- Improved terminal panel performance
- Enhanced i18n support

### Fixed
- Session persistence issues
- Theme switching bugs

## [0.2.0] - 2026-03-15

### Added
- Multi-caller support with tab switching
- Image attachment support (up to 5 images)
- Structured questions in feedback form
- Quick action preset responses

### Changed
- Redesigned feedback window UI
- Improved Markdown rendering

### Fixed
- IPC connection stability
- Memory leak in session management

## [0.1.0] - 2026-03-01

### Added
- Initial release
- Basic feedback window with Markdown support
- MCP server implementation
- Tauri desktop application
- System tray support
- Dark and light themes
- English and Chinese interfaces

---

## Version History

For older versions, see the [GitHub Releases](https://github.com/anthropics/my-last-feedback/releases) page.

---

## Contributing

To add entries to this changelog:

1. Add your changes under the `[Unreleased]` section
2. When releasing, move items from `[Unreleased]` to the new version section
3. Follow the [Keep a Changelog](https://keepachangelog.com/) format
4. Use the following categories:
   - **Added** for new features
   - **Changed** for changes in existing functionality
   - **Deprecated** for soon-to-be removed features
   - **Removed** for now removed features
   - **Fixed** for any bug fixes
   - **Security** in case of vulnerabilities