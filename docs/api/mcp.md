# MCP Protocol

My Last Feedback implements the Model Context Protocol (MCP) to communicate with AI coding agents.

## Overview

The Model Context Protocol is a standard for communication between AI tools and external services. My Last Feedback acts as an MCP server, providing feedback collection capabilities to AI agents.

## MCP Server Implementation

### Server Entry Point

The MCP server is implemented in `server.mjs` and runs as a Node.js process using stdio transport.

```javascript
// server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'my-last-feedback',
  version: '1.0.0'
});

// Register tools and prompts
// ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Available Tools

### request_feedback

Requests feedback from the developer.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `summary` | string | Yes | Summary of work done by the agent |
| `options` | string[] | No | Quick action options for the developer |
| `caller` | string | No | Name of the AI agent calling |

**Example:**

```json
{
  "summary": "I've created a new React component for the todo list. The component includes:\n- Add todo functionality\n- Toggle completion\n- Delete todos\n\nPlease review and let me know if you'd like any changes.",
  "options": ["Continue", "Fix Issues", "Add Tests"],
  "caller": "cursor"
}
```

**Response:**

```json
{
  "feedback": "Looks good! Please add error handling for empty inputs.",
  "action": "Fix Issues"
}
```

### get_session_info

Gets information about the current feedback session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session identifier |

**Response:**

```json
{
  "session_id": "uuid",
  "caller": "cursor",
  "status": "active",
  "created_at": "2026-04-18T12:00:00Z"
}
```

## Available Prompts

### feedback_prompt

A prompt template for requesting feedback.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | Yes | Description of the task being worked on |
| `progress` | string | No | Current progress description |

## Configuration

### MCP Configuration File

The MCP server configuration depends on your AI tool:

**Cursor (`~/.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "env": {}
    }
  }
}
```

**VS Code Copilot:**

Add to VS Code settings:

```json
{
  "mcpServers": {
    "my-last-feedback": {
      "command": "node",
      "args": ["/path/to/my-last-feedback/mcp/mlfb/index.mjs"],
      "env": {}
    }
  }
}
```

### Auto-Detection

My Last Feedback includes a configuration helper that auto-detects the installation path. Use the "MCP Config" button in the sidebar to generate the correct configuration.

## Transport

### stdio Transport

The default transport uses standard input/output (stdio) for communication. This is the most common transport for MCP servers.

### HTTP Transport (Experimental)

An experimental HTTP transport is available for development:

```bash
npm run start:http
```

This starts an HTTP server on port 3000.

## Message Format

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "request_feedback",
    "arguments": {
      "summary": "Work summary",
      "options": ["Continue", "Fix"]
    }
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Looks good! Please add error handling."
      }
    ]
  }
}
```

## Error Handling

### Common Errors

| Error Code | Description | Solution |
|------------|-------------|----------|
| -32700 | Parse error | Check JSON syntax |
| -32600 | Invalid request | Check request format |
| -32601 | Method not found | Check available methods |
| -32602 | Invalid params | Check parameter types |
| -32603 | Internal error | Check server logs |

### Debugging

To debug MCP communication:

1. Check your AI tool's MCP logs
2. Run the MCP server manually:
   ```bash
   node mcp/mlfb/index.mjs
   ```
3. Use the MCP Inspector tool for testing

## Security Considerations

- **Local Only**: MCP server only accepts connections from localhost
- **No Authentication**: No authentication is required for local connections
- **Input Validation**: All inputs are validated before processing
- **Process Isolation**: MCP server runs as a separate process

## Best Practices

### For AI Agent Developers

1. **Clear Summaries**: Provide clear, concise summaries of work done
2. **Relevant Options**: Include relevant quick action options
3. **Error Handling**: Handle feedback responses gracefully
4. **Session Management**: Use sessions for multi-turn conversations

### For Users

1. **Review Thoroughly**: Take time to review agent work before responding
2. **Be Specific**: Provide specific feedback for better results
3. **Use Quick Actions**: Use quick actions for common responses
4. **Check History**: Review session history for context

## Examples

### Basic Feedback Request

```javascript
// AI Agent code
const result = await mcp.callTool('request_feedback', {
  summary: 'I\'ve implemented the login form with validation.',
  options: ['Continue', 'Add Tests', 'Fix Issues']
});

console.log(result.feedback);
```

### Multi-Turn Conversation

```javascript
// First request
const result1 = await mcp.callTool('request_feedback', {
  summary: 'Starting to implement user authentication.',
  caller: 'cursor'
});

// Continue based on feedback
if (result1.action === 'Continue') {
  const result2 = await mcp.callTool('request_feedback', {
    summary: 'Authentication implementation complete. Added:\n- Login\n- Logout\n- Session management',
    options: ['Add Tests', 'Deploy']
  });
}
```

## Troubleshooting

### MCP Server Not Starting

- Check Node.js version (18+ required)
- Verify `@modelcontextprotocol/sdk` is installed
- Check for syntax errors in `server.mjs`

### AI Agent Not Connecting

- Verify MCP configuration path is correct
- Restart your AI tool after configuration changes
- Check MCP server is running

### Feedback Not Appearing

- Ensure My Last Feedback GUI is running
- Check IPC connection between MCP server and GUI
- Verify session is active