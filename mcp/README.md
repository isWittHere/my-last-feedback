# MCP Servers

This directory hosts all MCP (Model Context Protocol) servers for this project.

## Structure

```
mcp/
├── common/          Shared utilities (port-discovery, child-launcher, mcp-bootstrap, caller-info)
├── mlfb/            my-last-feedback MCP server (interactive feedback tool + whoami)
└── mlra/            my-long-running-agent: 3 dedicated MCP servers
    ├── ceo/         CEO server (arbitration, verdict)
    ├── planning/    Planning server (plan drafting + inspection)
    └── execution/   Execution server (phase execution + inspection)
```

See `.myLastChat/MLC_MLRA_v2_三Server重构架构.md` for the locked architecture plan.

Status: Phase 0 skeleton created — implementation pending.
