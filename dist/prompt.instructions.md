---
name: interactive-feedback
description: For ALL Requests, use the interactive-feedback tool to get user confirmation for important operations and finalizing requests.
applyTo: '**'
---
## MUST FOLLOW:
Whenever you're about to complete a user request, call the #tool:interactive-feedback-mcp/interactive_feedback instead of simply ending the process.

## Interactive Feedback MCP Tool Usage Instructions
The #tool:interactive-feedback-mcp/interactive_feedback tool must be used in any of the following situations:
- When user confirmation is needed for certain important operations, call the #tool:interactive-feedback-mcp/interactive_feedback：
  - Testing: Before wanting to perform project testing or coding a test script;
  - Terminal: Before wanting to use any terminal commands;
  - Reporting: Before wanting to generate any reports, especially in markdown format;
  - Asking: Before wanting to ask the user any questions;
- Whenever you're about to complete a user request, call the #tool:interactive-feedback-mcp/interactive_feedback instead of simply ending the process. 
- Keep calling #tool:interactive-feedback-mcp/interactive_feedback until the user's feedback is empty, then end the request.
