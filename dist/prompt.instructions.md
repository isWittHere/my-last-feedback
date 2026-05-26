# For Copilot instructions

---
> From interactive_feedback.instructions.md

## MUST FOLLOW :
Use #tool:my-last-feedback/interactive_feedback only when real user feedback or confirmation is required. Do not call it by default at every completion.
Before any final completion output to the user, you must call #tool:my-last-feedback/interactive_feedback once.

## Interactive Feedback MCP Tool Usage Instructions
The #tool:my-last-feedback/interactive_feedback tool should be used only in the following situations:
- User decision is required and choices have meaningful trade-offs (for example destructive actions, high-risk operations, or strategy branches).
- Required information is missing and cannot be safely inferred from repo/context.
- A phase is completed and explicit acceptance/confirmation is needed before the next phase.
- The user explicitly asks to provide feedback through this tool.
- The user intentionally skips a required step/tool and the task cannot continue safely without a decision.

Do **not** call #tool:my-last-feedback/interactive_feedback for routine execution:
- Normal terminal commands for exploration/build/read-only checks.
- Standard coding, refactor, file edits, and local validation that are already requested.
- Regular progress updates, explanations, or final summaries that do not require user input.
- Asking minor clarification questions that can be reasonably assumed or deferred.

## Agent Identity (`agent_name`)
- `agent_name` is a 4-character random combination consisting of uppercase letters and numbers.
- `agent_name` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call.
- You **MUST** pass back the exact identifier assigned by hook context or a previous feedback response.
- Do not invent or replace `agent_name`.
- This ensures the desktop app correctly associates all your requests under one persistent caller tab.

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

## Request Type (`request_type`)
- `request_type` is **REQUIRED** in every #tool:my-last-feedback/interactive_feedback call. Never omit it.
- Allowed values only: `analysis`, `completion`, `planning`, `document`.

| Request Type | Description |
| --- | --- |
| `analysis` | Use when presenting analysis results, investigation details, reports, explanations, or general notes to the user. |
| `completion` | Use when indicating the completion of a user's order or process. |
| `planning` | Use when outlining plans, next steps, or strategies to the user. |
| `document` | Use for document-related tasks and document completion notices. |

- `request_type` is metadata for categorization and visual display only. It does not change tool behavior, permissions, routing, or available capabilities.
- you can still use `questions` in any request type when you need to ask the user questions or provide selectable options.

## 一次只能调用一个 #tool:my-last-feedback/interactive_feedback 工具，请勿并行调用多个。

---
> From mylastchat-guide.instructions.md

# My Last Chat 工具参考与文档格式规范

## 一、文档格式规范
大部分md报告、总结和知识文档都应优先保存在 `.myLastChat/` 目录下，并遵从YAML Frontmatter规范以便管理：

### 文件命名与存储

| 项目 | 规范 |
|------|------|
| **存储路径** | `${workspaceFolder}/.myLastChat/` |
| **命名格式** | `MLC_[标题].md` 或 `MLC_K_[技术主题].md` |
| **字符支持** | 完全支持中文和空格，保持原样 |

### YAML Frontmatter（必需）
```yaml
---
title: [必填] 文档标题
description: [必填] 简要描述（建议 ≤40 tokens）
workplace: [必填] 当前工作区路径
project: [可选] 项目名称
type: [可选] 文档类型（如 coding / debug / planning / spec / knowledge / note / report）
tags: [可选]
    - 标签1
    - 标签2
solved_lists: [可选]
    - 已完成任务1
    - 已完成任务2
---
```

### 通用规则
- **必填字段**：title、description、workplace
- **可选字段**：project、type、tags、solved_lists
- **更新规则**：保留原内容，标记新增部分（添加时间戳）


---
## 二、语言模型工具

你可以使用以下语言模型工具来查询、管理、补充或改进已存在的文档：

### 1. `#tool:my-last-chat.my-last-chat/lastchats`
获取所有已保存的聊天摘要列表。

**参数**：
| 参数 | 类型 | 默认值 | 可选值 |
|------|------|--------|--------|
| scope | string | "all" | workspace / global / all |
| feedbackLevel | string | "DESCRIPTION" | TITLE_ONLY / DESCRIPTION / META / ALL |

### 2. `#tool:my-last-chat.my-last-chat/searchchat`
通过标题关键词搜索。

**参数**：
| 参数 | 类型 | 默认值 | 可选值 |
|------|------|--------|--------|
| keywords | array | *必填* | - |
| scope | string | "all" | workspace / global / all |
| feedbackLevel | string | "DESCRIPTION" | TITLE_ONLY / DESCRIPTION / META / ALL |

### 3. `#tool:my-last-chat.my-last-chat/searchmeta`
跨所有元数据字段（title、description、workplace、project、type、solved_lists）搜索。

**参数**：
| 参数 | 类型 | 默认值 | 可选值 |
|------|------|--------|--------|
| keywords | array | *必填* | - |
| scope | string | "all" | workspace / global / all |
| feedbackLevel | string | "META" | TITLE_ONLY / DESCRIPTION / META / ALL |

---
## 三、其他文档提示
- `ref-repos`：该文件夹一般出现在项目根目录下，用于存放与项目相关的参考资料和参考源码仓库。该文件夹可能不会在.gitignore中被忽略（以便agent能够正常查阅），但明令禁止在git版本控制中提交，所有用户请求的git操作都应当首先排除`ref-repos`文件夹下的全部内容。

