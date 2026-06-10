# Quick Start

Get up and running with My Last Feedback in minutes.

## Step 1: Install My Last Feedback

Follow the [Installation Guide](/guide/installation) to download and set up My Last Feedback on your system.

## Step 2: Configure Your AI Tool

### For Cursor

1. Open Cursor settings
2. Navigate to MCP configuration
3. Add the following configuration:

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

### For VS Code Copilot

1. Open VS Code settings
2. Search for "MCP" in settings
3. Add the My Last Feedback MCP server configuration

### For Other Tools

Refer to your AI tool's documentation for MCP configuration. Use the configuration format shown above.

## Step 3: Start a Conversation

1. Launch your AI coding tool (Cursor, VS Code, etc.)
2. Start a new conversation with your AI agent
3. Ask the agent to help you with a coding task

## Step 4: Provide Feedback

When the AI agent needs your feedback:

1. My Last Feedback will display a native desktop popup
2. Review the agent's work summary (rendered as Markdown)
3. Add any images or attachments if needed
4. Type your feedback or select a quick action
5. Click "Submit" to send your response back to the agent

## Example Workflow

Here's a typical workflow using My Last Feedback:

1. **Ask**: "Help me create a React component for a todo list"
2. **Agent works**: The AI agent writes code and creates files
3. **Feedback popup**: My Last Feedback shows what the agent did
4. **Review**: You review the code and provide feedback
5. **Iterate**: The agent makes adjustments based on your feedback

## Tips

- **Use Quick Actions**: Save time with preset responses like "Continue", "Analyze", or "Fix"
- **Attach Screenshots**: Use Ctrl+V to paste screenshots directly into the feedback form
- **Custom Prompts**: Create `.prompt.md` files in `mcp_prompts/` for frequently used feedback templates
- **Multiple Agents**: Connect multiple AI tools simultaneously — My Last Feedback supports tab switching

## Next Steps

- Learn about [Features](/guide/features) to discover all capabilities
- Read the [Development Guide](/development/setup) to contribute to the project
- Check the [API Reference](/api/mcp) for technical details