# MCP Compatibility Strategy

## Scope

This document records the server-by-server migration strategy from the current Copilot user-level mcp.json to the OpenCode draft config.

It is intentionally narrower than the main migration spec. Its job is to answer one question for each server:

- Can it be migrated now?
- If yes, in what form?
- If not, what blocks it?

## Mapping Rules

### Transport Mapping

- Copilot stdio -> OpenCode local
- Copilot http -> OpenCode remote

### Field Mapping

- command + args -> command array
- env -> environment
- timeout -> timeout
- url -> url

### Non-Isomorphic Fields

The following source features do not have a direct OpenCode equivalent in the current target draft:

- inputs.promptString
- gallery
- version

These fields are therefore either removed, replaced by comments, or rewritten into a different credential strategy.

## Server Status

| Server | Source Type | Draft Status | Decision |
| --- | --- | --- | --- |
| my-last-feedback | stdio | Migrated | Keep as local Node server |
| my-long-running-agent-expert | stdio | Migrated | Keep as local Node server |
| my-long-running-agent-inspector | stdio | Migrated | Keep as local Node server |
| my-long-running-agent-ceo | stdio | Migrated | Keep as local Node server |
| microsoftdocs/mcp | http | Migrated | Keep as remote server |
| tavily | http | Migrated with placeholder | Replace embedded credential before use |
| firecrawl/firecrawl-mcp-server | stdio | Migrated with placeholder | Replace VS Code prompt injection with environment-based secret |
| pencil | stdio | Deferred | Requires runtime argument review |

## Migrated Servers

### my-last-feedback

Status: migrated

Reason:

- Plain local Node stdio server
- No special credential injection
- No VS Code-only argument binding

### my-long-running-agent-expert

Status: migrated

Reason:

- Plain local Node stdio server
- No special credential injection

### my-long-running-agent-inspector

Status: migrated

Reason:

- Plain local Node stdio server
- No special credential injection

### my-long-running-agent-ceo

Status: migrated

Reason:

- Plain local Node stdio server
- No special credential injection

### microsoftdocs/mcp

Status: migrated

Reason:

- Simple remote MCP URL
- No visible source-side input indirection
- No OpenCode schema mismatch

### tavily

Status: migrated with placeholder

Reason:

- Remote MCP URL is structurally compatible
- Existing source stores the API key directly in the URL

Action required before production use:

- Replace the placeholder credential
- Decide whether to keep query-string auth or move to a safer credential handling path

### firecrawl/firecrawl-mcp-server

Status: migrated with placeholder

Reason:

- Source transport is plain stdio and maps cleanly to OpenCode local MCP
- The only non-isomorphic piece is the VS Code promptString input mechanism

Migration decision:

- Replace VS Code inputs.promptString with an explicit environment placeholder
- Keep the same npx launcher and timeout behavior at the draft level

Action required before production use:

- Replace the placeholder Firecrawl API key
- Decide whether the final credential source should remain inline, move to a runtime env convention, or be injected from a user-local secret store

## Deferred Servers

### pencil

Status: deferred

Blocker:

- Source command line explicitly passes visual_studio_code as an app argument
- That may be semantically wrong or misleading in an OpenCode runtime

Required validation:

- Confirm whether the server only needs a generic desktop host
- Confirm whether visual_studio_code is mandatory for protocol behavior
- If not mandatory, replace with the correct OpenCode-facing runtime value

## Credential Strategy

The draft uses the following credential policy:

- Never carry VS Code inputs forward into the OpenCode draft
- Never copy source secrets directly into repository draft files
- Use explicit placeholders when the source contains embedded credentials

This policy is why Tavily was migrated with a placeholder and Firecrawl was deferred.

## Next Work Items

1. Finalize a credential source for Firecrawl.
2. Validate whether Pencil can run correctly without Visual Studio Code branding in args.
3. Replace the Tavily placeholder with the chosen runtime credential strategy.
4. After those three are resolved, merge deferred servers into the draft opencode.jsonc.