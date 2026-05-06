---
title: OpenCode CLI Server HTTP 通道验证报告
description: 通过独立 demo 验证 OpenCode CLI/server 可作为 MLFB 无 ACP 后端能力层
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
  - OpenCode
  - CLI Server
  - HTTP API
  - SSE
  - ACP Migration
solved_lists:
  - 创建独立 OpenCode HTTP probe demo
  - 验证 opencode serve 可启动本地 server
  - 验证 Basic Auth、HTTP API、SSE event、session create/rename/delete 可行
---

# OpenCode CLI Server HTTP 通道验证报告

验证日期：2026-05-06

## 1. 验证目标

本次验证目标是确认 MLFB 是否可以完全脱离 ACP，改为使用用户本机 OpenCode CLI/server 的 HTTP 能力。

重点验证：

- OpenCode CLI 是否能以 headless server 方式启动。
- server host/port 是否可控。
- 是否支持本地 HTTP API。
- 是否支持 Basic Auth。
- 是否支持全局 SSE 事件通道。
- 是否支持当前 workspace/instance SSE 事件通道。
- 是否可以不创建 session 直接列出历史 sessions。
- 是否支持 session create、rename、messages、delete。
- 是否能获取 provider/model 相关信息。

## 2. 源码证据

### 2.1 CLI 命令

OpenCode CLI 注册了 `ServeCommand`。

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/index.ts`

相关命令实现：`ref-repos/opencode-1.14.33/packages/opencode/src/cli/cmd/serve.ts`

结论：

- `opencode serve` 是官方 headless server 命令。
- 它调用 `Server.listen(opts)`。
- 输出形如：`opencode server listening on http://127.0.0.1:<port>`。
- 它不会主动打开 OpenCode UI。

### 2.2 网络参数

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/cli/network.ts`

支持参数：

- `--port`
- `--hostname`
- `--mdns`
- `--mdns-domain`
- `--cors`

结论：

- MLFB 可以指定 `127.0.0.1`。
- MLFB 可以指定随机空闲端口。
- MLFB 可以通过 `--cors` 为未来 webview/browser 场景预留跨域能力。

### 2.3 认证方式

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/server/middleware.ts`

认证逻辑：

- 如果 `OPENCODE_SERVER_PASSWORD` 未设置，server 无认证。
- 如果设置了 `OPENCODE_SERVER_PASSWORD`，server 使用 Basic Auth。
- 用户名来自 `OPENCODE_SERVER_USERNAME`，默认是 `opencode`。

结论：

- MLFB 可以在启动 server 时生成随机 password。
- MLFB 通过 Basic Auth 访问本地 API。
- 这与官方 desktop-electron 的认证思路一致。

### 2.4 HTTP 路由

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/server/server.ts`

关键路由：

- `/global`
- `/session`
- `/provider`
- `/config`
- `/event`
- `/path`

结论：

- OpenCode 原生 HTTP API 覆盖 session、provider、config、事件订阅等核心能力。
- 这些能力明显超过 ACP 当前暴露面。

### 2.5 Directory/Instance 路由

源码位置：`ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/middleware.ts`

instance directory 来源：

- query：`directory`
- header：`x-opencode-directory`
- fallback：`process.cwd()`

结论：

- MLFB 可以用 query 参数精确指定当前 workspace。
- 不需要为了列 session 而创建 session。

### 2.6 SSE 事件通道

全局事件源码：`ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/global.ts`

instance 事件源码：`ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/event.ts`

通道：

- `/global/event`
- `/event?directory=<workspace>`

事件特征：

- 连接后立即发送 `server.connected`。
- 每 10 秒发送 `server.heartbeat`。
- `global.event` 包装为 `{ payload: ... }`。
- `instance.event` 直接返回 `{ type, properties }`。

结论：

- MLFB 可以使用 SSE 接收 OpenCode 事件。
- 这是替代 ACP streaming/update 的关键通道。

## 3. Demo 程序

新增 demo：`.myLastChat/opencode_http_probe_demo.cjs`

特性：

- 独立 Node 脚本，不依赖主项目模块。
- 默认只读验证。
- `--mutate` 模式验证临时 session create/rename/messages/delete。
- 自动寻找空闲端口。
- 自动设置 `OPENCODE_SERVER_PASSWORD`。
- 自动 Basic Auth 请求。
- 自动停止由 demo 启动的 server。
- 写出 JSON probe result。

运行命令：

```bash
node .myLastChat/opencode_http_probe_demo.cjs --workspace "$PWD" --mutate
```

结果文件：`.myLastChat/opencode_http_probe_result_2026-05-06T15-55-14-098Z.json`

## 4. 实测环境

- OS：Windows 10.0.22621
- Workspace：`E:\Dev\my-last-feedback`
- OpenCode CLI/server version：`1.14.39`
- Server URL：`http://127.0.0.1:5730`
- Auth：Basic Auth enabled
- Username：`opencode`
- Mutating test：enabled

## 5. 实测结果总览

整体结果：PASS

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| server.spawn | PASS | 成功执行 `opencode serve --hostname 127.0.0.1 --port 5730` |
| global.health | PASS | 返回 `healthy: true`，version `1.14.39` |
| auth.rejects.missing.credentials | PASS | 未带认证访问 health 返回 401 |
| instance.path | PASS | 正确解析 workspace directory |
| global.event.sse | PASS | 收到 `server.connected` |
| instance.event.sse | PASS | 收到 `server.connected` |
| session.list | PASS | 返回 8 个 root sessions |
| session.status | PASS | 返回 session status map |
| provider.list | PASS | 返回 117 个 providers，2 个 connected |
| config.get | PASS | 返回 OpenCode config |
| session.create | PASS | 创建临时 session 成功 |
| session.update.rename | PASS | 重命名临时 session 成功 |
| session.messages | PASS | 临时空 session messages 为 0 |
| session.delete | PASS | 删除临时 session 成功 |
| session.delete.confirm | PASS | 再次 list 确认临时 session 不存在 |

## 6. 关键观察

### 6.1 启动 OpenCode server 不会创建 session

本次 demo 启动 server 后，先执行了 health、path、SSE、session.list、provider.list、config.get。

这些步骤均未创建 session。

只有进入 `--mutate` 阶段主动调用 `POST /session` 时，才创建临时 session。

这验证了我们之前的产品判断：

> 启动 OpenCode 与新建 session 可以彻底分离。

### 6.2 session list 是原生可用能力

`GET /session?directory=<workspace>&roots=true&limit=20` 返回真实历史 sessions。

返回字段包含：

- id
- slug
- projectID
- directory
- path
- title
- agent
- model
- version
- summary
- time.created
- time.updated

这比 ACP 的 session list 更适合 MLFB 历史列表。

### 6.3 `New session - ...` 不是空 session 判断依据

实测 session list 中仍存在 title 为 `New session - ...` 的历史 sessions，其中部分包含 agent/model/version 信息。

结论保持不变：

- 默认标题只代表 OpenCode 未生成或未替换标题。
- 不能把 `New session - ...` 当成空 session。

### 6.4 rename/delete 能力已验证

临时 session：

- 创建成功：`ses_201ffcbe4ffe9l4ITUcovbi663`
- 初始标题：`New session - 2026-05-06T15:55:19.451Z`
- 重命名：`MLFB HTTP probe 2026-05-06T15:55:19.447Z`
- 删除返回：`true`
- 再次 list 确认：`stillThere=false`

结论：

- MLFB 可以通过 HTTP API 实现删除 session。
- MLFB 可以通过 HTTP API 实现重命名 session。
- 这两个能力不需要 ACP。

### 6.5 provider/model 信息可通过 HTTP 获取

`GET /provider?directory=<workspace>` 返回：

- `all`: 117
- `connected`: 2
- `default`: provider 默认模型映射

结论：

- 模型选取器不需要依赖 ACP `session/new` 返回模型。
- 可以从 OpenCode HTTP API 获取 provider/model 数据。

### 6.6 SSE 通道可用

两个事件通道都能连接并收到初始事件：

- `/global/event`：返回带 `payload` 包装的事件。
- `/event?directory=<workspace>`：返回 instance 事件。

结论：

- 后续 prompt streaming、session updated、message part updated、tool/todo updates 可以继续沿 SSE 路线验证。
- SSE 是无 ACP prompt/event 迁移的核心通道。

## 7. 可行性判断

结论：OpenCode CLI/server HTTP 路线可行，而且比 ACP 更适合作为 MLFB 的 OpenCode 主集成路径。

已验证能力：

- server lifecycle 基础可行。
- Basic Auth 可行。
- health/version 可行。
- directory-scoped instance API 可行。
- global event SSE 可行。
- instance event SSE 可行。
- session list 可行。
- session create 可行。
- session rename 可行。
- session delete 可行。
- provider/model discovery 可行。
- config read 可行。

尚未验证能力：

- prompt submit。
- prompt_async。
- assistant text delta 事件。
- tool call event。
- todo event。
- permission request event。
- abort/cancel running session。
- title async generation event。
- SDK v2 client 与用户安装 CLI 的版本兼容性。

## 8. 对 MLFB 迁移方案的影响

### 8.1 阶段 0 已基本通过

规划文档中的阶段 0 目标已经完成主要验证：

- CLI server 可启动。
- HTTP health 可访问。
- session.list 不创建 session。
- session rename/delete 可行。
- provider/model discovery 可行。
- SSE 通道可连通。

### 8.2 下一阶段可以进入 server runtime 实现

可以开始设计并实现：

- `openCodeServerRuntime`
- `openCodeHttpClient`
- `openCodeAgentAdapter`

### 8.3 session 管理迁移优先级应提前

由于 session list/rename/delete 已经实测通过，推荐优先把 MLFB 的 OpenCode session manager 切到 HTTP。

优先迁移：

- list sessions
- load session metadata
- rename session
- delete session
- archive session
- provider/model list

prompt streaming 可以作为下一轮 probe 单独验证。

## 9. 建议的下一轮 demo

下一轮独立 demo 建议专门验证 prompt/event 映射。

目标：

- 创建临时 session。
- 调用 `POST /session/:id/prompt_async`。
- 同时订阅 `/event?directory=<workspace>`。
- 捕获 message/part/tool/todo/error/title events。
- 不直接依赖 ACP。

注意：

- 这可能会消耗真实模型 token。
- 需要选择一个已连接 provider/model。
- 建议先提供 `--prompt`、`--provider`、`--model` 参数，不默认执行。

## 10. 实施建议

短期建议：

1. 保留当前 demo 作为回归验证工具。
2. 新增第二个 prompt streaming probe。
3. 在主代码中先实现 HTTP server runtime。
4. 将 session manager 的远端列表、重命名、删除迁移到 HTTP。
5. 再推进 prompt streaming 迁移。

架构建议：

- 主代码不要直接散落 fetch endpoint。
- 所有 OpenCode HTTP API 先进入 `openCodeHttpClient`。
- 所有 MLFB 数据映射进入 `openCodeAgentAdapter`。
- UI 只消费 MLFB 的通用 agent/session 类型。

## 11. 最终结论

OpenCode CLI/server HTTP 通道已经通过独立 demo 验证。

这确认了无 ACP 路线的基本前提：

> MLFB 可以保留自己的 UI，通过本地 HTTP API 使用 OpenCode CLI/server 的原生能力，并逐步完全移除 ACP。

下一步应聚焦 prompt streaming 与 event mapping 的独立验证，然后进入主代码 adapter 实现。