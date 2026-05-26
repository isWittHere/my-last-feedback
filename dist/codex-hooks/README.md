# Codex Hooks Package (User-Compatible)

This folder provides a practical hooks package for Codex users.

## Files

- `hooks.json`
- `scripts/inject-agent-name.mjs`

## Install

1. Copy `scripts/inject-agent-name.mjs` to:
   `C:\Users\<YOUR_USER>\.codex\hooks\scripts\inject-agent-name.mjs`
2. Open `hooks.json` and replace `<YOUR_USER>` with your Windows username.
3. Save as:
   `C:\Users\<YOUR_USER>\.codex\hooks.json`

## Notes

- Requires Node.js in PATH.
- Hook command timeout is set to 10 seconds.
- `Stop` hook uses block mode to enforce `interactive_feedback` call before ending.
