# MyLastChat 工具参考与文档格式规范

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
workplace: [必填] ${workspaceFolder}
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
- **变量使用**：workplace 使用 `${workspaceFolder}` 变量保持可移植性

## 二、语言模型工具

你可以使用以下语言模型工具来查询、管理、补充或改进已存在的文档：

### 1. `#tool:my-last-chat.my-last-chat/lastchats`
获取所有已保存的聊天摘要列表。

### 2. `#tool:my-last-chat.my-last-chat/searchchat`
通过标题关键词搜索。

### 3. `#tool:my-last-chat.my-last-chat/searchmeta`
跨所有元数据字段（title、description、workplace、project、type、solved_lists）搜索。

## 三、其他文档提示
- `ref-repos`：该文件夹一般出现在项目根目录下，用于存放与项目相关的参考资料和参考源码仓库。该文件夹可能不会在.gitignore中被忽略（以便agent能够正常查阅），但明令禁止在git版本控制中提交，所有用户请求的git操作都应当首先排除`ref-repos`文件夹下的全部内容。