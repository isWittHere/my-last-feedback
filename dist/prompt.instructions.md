---
name: my-last-feedback-guide
description: For ALL Requests, use the my-last-feedback tool to get user confirmation for important operations and finalizing requests.
applyTo: '**'
---
## MUST FOLLOW :
Whenever you're about to complete a user request, call the #tool:my-last-feedback/interactive_feedback instead of simply ending the process.

## Interactive Feedback MCP Tool Usage Instructions
The #tool:my-last-feedback/interactive_feedback tool must be used in any of the following situations:
- When user confirmation is needed for certain important operations, call the #tool:my-last-feedback/interactive_feedback：
  - Testing: Before wanting to perform project testing or coding a test script;
  - Terminal: Before wanting to use any terminal commands;
  - Reporting: Before wanting to generate any reports, especially in markdown format;
  - Asking: Before wanting to ask the user any questions;
- When the user skips the execution of a tool or task, immediately pause the current task and call the #tool:my-last-feedback/interactive_feedback to ask the user for feedback and confirmation on how to proceed.

## Agent Identity (`agent_name`)
- `agent_name` is a 4-character random combination consisting of uppercase letters and numbers, such as "A1B2" or "X9Y8".
- `agent_name` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call.
- You **MUST** pass back the exact identifier assigned by hook context or a previous feedback response.
- Do not invent or replace `agent_name`.
- This ensures the desktop app correctly associates all your requests under one persistent caller tab.

## Request Type (`request_type`)
- `request_type` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call. Never omit it.
- Allowed values only: `explanation`, `question`, `planning`, `completion`, `analysis_report`, `document_completed`, `verification_completed`, `default`.
- `request_type` is metadata for categorization and visual display only. It does not change tool behavior, permissions, routing, or available capabilities.
- Pick the narrowest matching value. When a fix, implementation, or requested task is finished, use `completion`; use `verification_completed` only when the user's request is specifically to verify, check, or test something. For asking what to do next, use `question`.

## Summary and Suggestions (`summary`)
- Send your feedback and notification information to the user in `summary`
- Always use correct markdown format
- Do not use escape characters such as `\n` or `\n\n`
- Complete context, suggestions, and detailed option information are always described in `summary` (Markdown).

## Question Functionality (`questions`)
When needing users to supplement information or select from suggested options, use the `questions` parameter:
- providing detailed information in the `summary` text, and list options in `questions`.
- `options` are only **option identifiers** — they serve as quick options for users, not for detailed descriptions.
- `questions` is an array of objects: `{ label: string, options?: string[] }`
- **With options** → Rendered as radio buttons for quick selection: `{ label: "Database choice", options: ["XXXXXXXXX", "XXXXXXXXXX", "XXXXXXXXXX"] }`
- **Without options** → Rendered as free text input field: `{ label: "Additional requirements" }`
- 选项使用中文文本

## Don't use XML in `summary` or `questions`
## 严禁同时并行调用多个 #tool:my-last-feedback/interactive_feedback 工具

## User Interaction and Feedback Loop
- 你会收到“用户指示”内容，你必须遵守，如果用户没有详细指示，则必须在得到用户的明确确认后才能进行代码或文件的任何修改。
- 如果用户让你分析、解释，则你不得在这些指示后直接进行代码或文件的修改，除非用户明确要求你进行修改。