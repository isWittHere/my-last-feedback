# inject-agent-name — VS Code Copilot Hook

A VS Code agent hook for [my-last-feedback](https://github.com/Aftersix/my-last-feedback).

Automatically generates a deterministic 4-character `agent_name` from the current Copilot session ID and injects it into every conversation. No need to call `register_agent` manually.

## How It Works

- Fires on `SessionStart` and `UserPromptSubmit`
- Reads `session_id` from hook stdin, hashes it with MD5, takes the first 4 hex digits (uppercased)
- Injects the result as a system message so the agent always knows its `agent_name`

The same session always produces the same `agent_name` — it is deterministic and stable across prompts.

## Requirements

- VS Code with GitHub Copilot (agent hooks in Preview)
- Node.js available in PATH

## Installation

### Step 1 — Copy files

**Windows**
```
%USERPROFILE%\.copilot\hooks\inject-agent-name.json
%USERPROFILE%\.copilot\hooks\scripts\inject-agent-name.mjs
```

**Mac / Linux**
```
~/.copilot/hooks/inject-agent-name.json
~/.copilot/hooks/scripts/inject-agent-name.mjs
```

Create the `hooks/scripts/` directory if it does not exist.

### Step 2 — Verify the hook loads

1. Open a new Copilot agent chat in VS Code
2. Open **Output** panel → select `GitHub Copilot Chat Hooks`
3. You should see the hook execute and a system message appear like:

```
[my-last-feedback] Your agent_name is "A1B2". Use agent_name="A1B2" in ALL interactive_feedback calls.
```

## File Structure

```
inject-agent-name.json        ← Hook configuration (place in ~/.copilot/hooks/)
scripts/
  inject-agent-name.mjs       ← Hook script     (place in ~/.copilot/hooks/scripts/)
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '...\%USERPROFILE%\...'` | Hook ran without a shell, env var not expanded | Ensure `windows` field uses `cmd /c node "%USERPROFILE%\..."` |
| Hook not listed in output channel | File not in `~/.copilot/hooks/` or wrong extension | Confirm `.json` extension and correct path |
| No output in chat | `session_id` missing from stdin | Check VS Code version; hooks API is in Preview |
