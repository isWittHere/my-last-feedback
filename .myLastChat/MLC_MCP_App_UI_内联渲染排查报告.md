---
title: MCP App UI 内联渲染排查报告
description: 记录 show_agent_identity 在 VS Code 中不显示内联 UI 的完整排查过程与结论
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
  - MCP
  - VS Code
  - MCP Apps
  - UI
  - 排查
solved_lists:
  - 完成 show_agent_identity 工具与 ui 资源接入
  - 完成多轮实测与日志证据采集
  - 形成失败复盘结论
  - 完成版本升级到0.2.0
  - 完成Windows发行包构建与压缩
  - 完成Git提交、推送、标签与Release发布
---

## 背景
目标是让 MCP 工具 `show_agent_identity` 在 VS Code Chat 中以内联 MCP App 卡片显示 `agent_name + 头像`，并保持颜色与现有 caller 颜色分配一致。

## 实施内容
- 新增工具 `show_agent_identity`
- 注册资源 `ui://my-last-feedback/identity-card`
- 资源 MIME 使用 `text/html;profile=mcp-app`
- 工具定义中加入 `_meta.ui.resourceUri`
- 工具返回结构化数据：agent_name、caller_color、avatar_svg 等
- 通过 IPC 向后端解析 caller 身份与颜色，避免前端自行分配颜色

## 关键日志证据
- 资源注册成功：
  - `[MCP] Identity UI resource registered: ui://my-last-feedback/identity-card`
- 工具注册成功：
  - `[MCP] Registering show_agent_identity via registerTool with UI metadata`
- 资源读取已发生：
  - `[MCP] resources/read for identity UI: ui://my-last-feedback/identity-card`
  - `[MCP] identity UI html bytes: 3865`
- 工具调用成功并返回数据：
  - 包含 `agent_name`、`caller_alias`、`caller_color`、`avatar_svg`

## 用户侧现象
- 多次调用 `show_agent_identity` 后，未出现内联身份卡
- 可见资源条目或文本/结构化输出，但非目标内联卡片体验

## 排查结论
- 服务端工具链路、资源链路、数据链路均已打通
- 失败点位于 VS Code Chat 的最终渲染阶段（未按预期将资源渲染为内联 MCP App 卡片）
- 该问题不属于业务逻辑失败，而是宿主渲染结果与预期不一致

## 影响范围
- 功能可调用且数据可得
- 但核心体验目标（内联卡片）未达成

## 当前决策
- 按用户要求，记录本次尝试并回退代码到指定提交

## 时间
- 记录时间：2026-03-14

---

## 新增更新（2026-03-14 16:50）

# MCP App 排查到 0.2.0 发版完整续写摘要

## 1. Previous Conversation
- 对话前半段围绕 `show_agent_identity` 的 MCP App 内联显示失败展开：已完成 server 侧工具、资源、IPC caller 颜色链路接入，并进行了多轮调用实测。
- 用户持续反馈“看不到内联 UI”，期间提供了 VS Code 设置截图、MCP 输出日志、调用截图等证据。
- 关键排查结果逐步收敛为：服务端链路正常，`resources/read` 可触发，但 VS Code 聊天区仍未按预期展示内联卡片。
- 用户随后要求“记录本次尝试并回退到指定提交”，已执行回退并写入报告。
- 回退完成后用户提出新任务：升级版本到 `0.2.0`、构建发行包、完成 Git 推送、完成新版本 Release。

## 2. Current Work
- 在本次总结请求前，已完成发版全流程执行：
  - 统一版本号到 `0.2.0`
  - 执行 `scripts/package-win.sh` 成功构建发行目录
  - 生成压缩包 `my-last-feedback-win-x64.zip`（约 29 MB）
  - 提交并推送 `main`，创建并推送标签 `v0.2.0`
  - 使用 GitHub CLI 创建 `v0.2.0` Release 并上传 zip 资产
- 核验结果：Release 已存在且为非草稿、非预发布，资产状态 `uploaded`。

## 3. Key Technical Concepts
- MCP Server: `@modelcontextprotocol/sdk`（stdio 传输）
- MCP Apps: `ui://` 资源、`text/html;profile=mcp-app`、`_meta.ui.resourceUri`
- VS Code MCP 渲染链路排查：工具注册、资源读取、宿主渲染
- Tauri 2.0: Rust 后端 + React 前端构建
- 版本管理：Node `package.json`、前端 `app/package.json`、Rust `Cargo.toml`、`tauri.conf.json`
- 发布流程：构建脚本、zip 产物、git tag、GitHub Release

## 4. Relevant Files and Code
### server.mjs
- 用于 MCP 工具与资源注册、`show_agent_identity` 调用链路、日志诊断。
- 在排查阶段多次调整 UI 元数据与资源读取行为（该部分后续曾按用户要求回退）。

### app/src-tauri/src/ipc.rs
- 扩展 IPC 协议以支持 caller 身份解析（排查阶段改动，后续按用户要求回退）。

### package.json
- 版本升级到 `0.2.0`。

### app/package.json
- 版本升级到 `0.2.0`。

### app/src-tauri/Cargo.toml
- Rust 包版本升级到 `0.2.0`。

### app/src-tauri/tauri.conf.json
- Tauri 应用版本升级到 `0.2.0`。

### RELEASE.md
- 更新为 `v0.2.0` 发布说明，用于 GitHub Release 说明正文。

### dist/win-x64/my-last-feedback-win-x64.zip
- 本次发布资产，已上传到 GitHub Release `v0.2.0`。

## 5. Problem Solving
- 已解决的问题：
  - 版本升级、构建、打包、推送、Release 发布均执行成功。
- 排查类问题结论：
  - MCP App 内联渲染问题已定位到宿主渲染阶段，不是工具调用或资源读取链路断裂。
  - 日志证据显示 `resources/read` 可触发且 HTML 可返回，但聊天区仍不呈现目标内联卡片体验。

## 6. Pending Tasks and Next Steps
- 当前未有新的未执行开发任务，发版任务已完成。
- 可选后续动作（若用户继续）：
  - 验证 Release 下载与安装链路
  - 补充 `v0.2.0` 变更日志到 README
  - 针对 MCP App 内联渲染问题准备最小复现仓库与 issue 模板

- 最近明确任务原文（用于续接上下文）：
  - “请你升级版本到0.2.0并构建发行包，并完成git仓库推送，并完成新版本release”
  - “继续”
  - “仅调用一次 show_agent_identity”
  - “看来我们彻底失败了”
  - “请记录本次尝试，编写报告，之后撤回到给git: a9a273c60bca69535e2c333a0226c174ac07d4e3。”
