---
title: MLFB 远程反馈 · 方案 B（Tailscale + PWA）完整规划书
description: 手机通过 Tailscale mesh 接入桌面 MLFB、以 PWA 形态收发 feedback 请求的端到端实施规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - mlfb
    - remote-feedback
    - tailscale
    - pwa
    - web-push
    - architecture
solved_lists: []
---

# MLFB 远程反馈 · 方案 B（Tailscale + PWA）完整规划书

> 版本 v0.1 · 2026-04-18
> 目标读者：MLFB 维护者、Web / Rust / DevOps 角色

---

## 0. 摘要（TL;DR）

把 MLFB 现有的 Tauri 桌面应用在 **PC 后端侧** 再长出一条 HTTP + WebSocket 传输面，通过 **Tailscale mesh** 让用户的手机与 PC 处于同一虚拟局域网，手机以 **PWA** 形态访问 PC 上的 MLFB，并通过 **Web Push**（VAPID）在锁屏与后台接收新 feedback 请求。SSH 口子作为零基础设施回退留作文档说明。

交付后的用户体验（Happy path）：

1. PC 开着 MLFB 如常工作
2. AI agent 通过 MCP 调用 `interactive_feedback`
3. 手机锁屏弹出推送："NEW FEEDBACK: xxx 需要你确认"
4. 用户点推送 → 自动打开已安装的 MLFB PWA
5. 看到 summary / questions / 图片，点选项、填文字、提交
6. 反馈 < 1s 同步回 PC，MCP 立即返回给 agent

---

## 1. 目标与非目标

### 1.1 目标（MVP 覆盖）

- [x] 手机可远程列出、查看 MLFB pending / history session
- [x] 手机可提交 feedback（text + 选项 + 简单图片）
- [x] PC 与手机状态近实时同步（双端任一侧提交都立即生效）
- [x] 推送触达 < 5s（网络正常）
- [x] 鉴权安全（pairing + JWT，私钥不出 PC）
- [x] 离线可查看已缓存的历史

### 1.2 非目标（MVP 之外）

- ❌ 手机端直接新建 prompt template、管理 MCP 配置
- ❌ 手机端编辑 git action / 运行终端命令
- ❌ 多用户多账号（MVP 假设 1 PC ↔ 1 手机 owner）
- ❌ 离线写入 + 冲突合并（离线状态下只读）
- ❌ 端到端 E2E 加密（依赖 Tailscale 的 WireGuard 加密即可）

### 1.3 约束

- 保持 Tauri 桌面端现有行为不回归
- 不强依赖任何闭源 SaaS（Tailscale 可替换为 Headscale 自建）
- iOS Safari 16.4+ / Android Chrome 为 PWA 最低基线

---

## 2. 架构总览

### 2.1 部署拓扑

```
┌──────────────────────────┐           ┌──────────────────────────┐
│        PC (MLFB)         │           │       Phone (PWA)        │
│ ┌──────────────────────┐ │           │ ┌──────────────────────┐ │
│ │  Tauri App (桌面壳)  │ │           │ │   Browser / PWA      │ │
│ │  ↕ invoke IPC        │ │           │ │   (installed)        │ │
│ │                      │ │           │ └──────────┬───────────┘ │
│ │  ───────────────────┐│ │           │            │             │
│ │  HTTP + WS Server   ││ │  HTTPS/   │            │             │
│ │  (axum @ 127.0.0.1) ││ │  WSS 经   │            │             │
│ │                     ││◄┼─ Tailscale┼────────────┘             │
│ │  MCP Server (stdio) ││ │  MagicDNS │                          │
│ │  Daemon (IPC bridge)││ │           │                          │
│ └──────────────────────┘ │           │                          │
│  Tailscale tailscaled    │           │  Tailscale Client (App)  │
└──────────────────────────┘           └──────────────────────────┘
          ▲                                        ▲
          └──────── mesh (WireGuard) ──────────────┘
```

### 2.2 关键架构决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 新增 **HTTP + WS server 进程**，寄存在现有 `mlra-server/daemon.mjs` 或 Tauri Rust 端 | daemon 已是 single source of truth，Tauri 前端本就通过 IPC 读它 |
| D2 | **dual transport adapter**：前端定义 `Transport` 接口，桌面走 Tauri invoke，浏览器走 fetch+WS | 让同一套 React 代码同时服务两个壳 |
| D3 | 鉴权用 **pairing token → JWT** 模型，不搞 OAuth | 单用户场景简化，pairing 只在首次绑定时发生 |
| D4 | **WebSocket 广播状态变更**（session 新增 / 状态改变） | 比长轮询节能；手机 PWA 可保持 30s 心跳 |
| D5 | 推送用 **Web Push + VAPID** | 浏览器原生，iOS 16.4+ 支持，无需 FCM token 中继 |
| D6 | **Tailscale 不内嵌**，依赖用户已安装客户端 | 不重造轮子；Headscale 自建也能用 |
| D7 | PWA 离线策略 = **stale-while-revalidate**（UI shell + session list） | 允许断网查历史，不允许断网回复 |

### 2.3 数据流

- **新 feedback 到达**：agent → MCP stdio → daemon → store 入库 → 同时 (a) Tauri IPC 事件推桌面前端 (b) WS 广播给所有已连浏览器 (c) Web Push 发给订阅的 PWA
- **手机提交 feedback**：PWA → WSS `submit_feedback` → daemon → MCP 返回给 agent → daemon 广播 status=responded → 桌面前端同步更新
- **历史拉取**：PWA 打开时 HTTP `GET /api/history` → 后续增量由 WS 推送

---

## 3. 组件分解

### 3.1 后端新增：Remote Server 模块

**位置（两个候选）**：

- A. Rust 侧（`app/src-tauri/src/remote.rs`），用 axum；桌面与远程共用 state
- B. Node 侧（`mlra-server/remote-server.mjs`），用 `ws` + 原生 http

**推荐 A**：状态一致性更强，Tauri Rust 端已经 own 所有持久化 + IPC；桌面窗口通过 Rust 内部 channel 订阅同一事件流，无双写。

**对外暴露的端口与路径**：

- 绑定 `0.0.0.0:58733`（可配）— Tailscale 暴露给 mesh
- 同时绑 `127.0.0.1:58733` 允许本地浏览器开发
- TLS：通过 Tailscale 的 MagicDNS + `tailscale serve` 或 `tailscale funnel` 获取自签证书，无需手工生成

**路由清单**：

| 方法 | 路径 | 目的 |
|---|---|---|
| GET | `/api/health` | 健康检查 + server 版本 |
| POST | `/api/pair/start` | 桌面开始配对（返回 6 位 code + QR payload） |
| POST | `/api/pair/complete` | 手机提交 code → 换 JWT |
| GET | `/api/callers` | 列 callers（JWT required） |
| GET | `/api/sessions?caller=&status=` | 分页 sessions |
| GET | `/api/sessions/:id` | 单 session 全文 |
| POST | `/api/sessions/:id/feedback` | 提交反馈 |
| POST | `/api/sessions/:id/cancel` | 取消 session |
| POST | `/api/push/subscribe` | 注册 Web Push subscription |
| WS | `/ws` | 广播 session 增删改事件 |

### 3.2 前端改造：Transport Adapter

```ts
// app/src/transport/index.ts
interface Transport {
  invoke<T>(cmd: string, args: unknown): Promise<T>;
  listen<T>(event: string, cb: (payload: T) => void): () => void;
}

// tauriTransport.ts — 现有行为
// webTransport.ts  — fetch + WebSocket，基于 JWT
// 入口根据 window.__TAURI_INTERNALS__ 或 env 判定
```

**迁移策略**：

- 一次性把所有 `invoke(...)` 的直接调用抽成 `useTransport().invoke(...)` 或模块级 `transport.invoke`
- 浏览器 transport 把 command 名映射到 HTTP 路由 + POST body
- WS 事件 `"new-feedback-request"` 等保持同名，adapter 内部把 Tauri listen 和 WS onMessage 归一

### 3.3 鉴权与配对流程

```
[PC Desktop]                          [Phone]
     │                                   │
     │ 用户点击"Pair phone"               │
     ├── POST /api/pair/start ──────►    │
     │ ◄─── { code: "483-721", qr: ... }│
     │ 在桌面 UI 显示 QR 与 6 位 code     │
     │                                   │
     │              扫 QR 或手输 code   ├── POST /api/pair/complete
     │                                   │    body: { code, device_name }
     │                                   │
     │                  ◄──── { jwt, refresh, push_vapid_pubkey }
     │                                   │
     │    PC 端记录 device → JWT 绑定    │
     │                                   │
     │            后续请求都带 Bearer   ├── Authorization: Bearer <jwt>
```

**安全要点**：

- pairing code 一次性、5 分钟过期、有 5 次错误上限
- JWT 有效期 30 天，refresh token 180 天
- PC 端维护 `device_list`，用户可在桌面 revoke 某设备
- WS 握手必须带 JWT，否则 401

### 3.4 Web Push

- PC 生成 VAPID keypair（持久化到 Tauri app data dir）
- 手机 PWA `subscribeToPush(pubkey)` → 拿到 endpoint，POST 给 `/api/push/subscribe`
- 新 session 到达时，PC 侧用 `web-push` lib 把 notification payload 推到 endpoint
- payload 最小化：`{ title, body, session_id }` —— 不塞敏感内容
- 点击推送 → `notificationclick` 打开 `/?sid=<id>` 深链

### 3.5 PWA 资产

需要新增/改造的文件：

- `app/public/manifest.webmanifest` — name, icons, display=standalone, start_url, theme_color
- `app/public/icons/` — 192/512/maskable
- `app/public/sw.js`（或 workbox 自动生成）— cache shell + API stale-while-revalidate
- `app/index.html` — 注册 service worker, `<meta name=apple-mobile-web-app-capable>` 等

Vite 端建议引入 `vite-plugin-pwa` 减少模板工作量。

### 3.6 响应式 UI

当前 [index.css](app/src/index.css) 桌面优先。需加断点：

- `@media (max-width: 768px)` — sidebar 改 drawer，caller columns 改单列 + swipe
- 触摸尺寸：按钮最小 44×44pt
- `FeedbackInput` 的 textarea 在手机上用 `autoresize + sticky submit bar`
- 图片 attachment 改用 `<img loading="lazy">` + 点图放大 modal

---

## 4. 数据 / API 契约（草案）

### 4.1 SessionDTO（共享）

```ts
type SessionDTO = {
  id: string;
  caller_id: string;
  request_name: string;
  summary: string;           // markdown
  status: "pending" | "responded" | "cancelled";
  created_at: string;
  feedback_text: string | null;
  questions: Array<{
    label: string;
    options?: string[];
    selected_options?: string[];
    answer?: string;
  }>;
  images: Array<{ id: string; thumb_url: string; full_url: string; }>;  // URL 替代 base64
  test_log_text: string;
  project_directory: string;
};
```

### 4.2 WS 事件帧

```json
{ "type": "session.new",       "session": <SessionDTO> }
{ "type": "session.updated",   "session_id": "...", "patch": { "status": "responded" } }
{ "type": "session.cancelled", "session_id": "..." }
{ "type": "caller.added",      "caller": <CallerDTO> }
{ "type": "ping" }
```

### 4.3 图片传输优化

现状：base64 嵌在 session 里，mobile 流量炸。

改造：

- 图片独立存 Tauri app data dir，URL `/api/img/:hash`（走 JWT）
- 返回 `thumb_url`（缩略 256px webp） + `full_url`（原图按需加载）
- 上传走 multipart，不走 base64

---

## 5. 分阶段路线图

### Phase 0 — 预备（0.5d）

- [ ] 在 Rust 端选定 HTTP 框架（axum 推荐，已有 tower 生态）
- [ ] 在 `app/src/transport/` 建目录，空骨架
- [ ] 新建环境变量 `MLFB_REMOTE_PORT`, `MLFB_REMOTE_ENABLED`

### Phase 1 — 只读 HTTP+WS 骨架（2-3d）

- [ ] axum server 在 Tauri `setup()` 启动，读同一个 state
- [ ] 实现 `/api/health`, `/api/callers`, `/api/sessions`, `/ws`（只广播 session.new/updated）
- [ ] 无鉴权（localhost only）
- [ ] 浏览器打开 `http://localhost:58733/` → 展示只读 session 列表（前端 `webTransport` 最简版）
- [ ] Tailscale 侧只需 `tailscale up` → 从手机浏览器 `http://pc-name:58733` 能看到列表

**里程碑**：手机能看到桌面的 MLFB 历史了（只读，无推送）。

### Phase 2 — 写路径 + 鉴权（3-4d）

- [ ] pairing flow + JWT 中间件
- [ ] `POST /api/sessions/:id/feedback` 完整写入并广播更新
- [ ] 桌面端 UI 加 "Pair phone" 按钮 + QR 显示
- [ ] Transport adapter 完成全部命令覆盖
- [ ] WS 握手鉴权

**里程碑**：手机能回复 feedback，桌面与手机双向同步。

### Phase 3 — PWA + Web Push（2-3d）

- [ ] `vite-plugin-pwa` 接入，manifest + icons
- [ ] Service worker：shell 缓存 + API swr
- [ ] VAPID keypair 生成与持久化
- [ ] `/api/push/subscribe` + 推送发送逻辑
- [ ] `notificationclick` 深链

**里程碑**：手机锁屏能收推送，点推送打开对应 session。

### Phase 4 — 响应式 CSS + 移动体验打磨（2d）

- [ ] 断点 + drawer sidebar
- [ ] 触摸尺寸审计
- [ ] 图片 URL 化 + lazy + 点图放大
- [ ] `viewport-fit=cover` + safe-area inset
- [ ] iOS add-to-home 引导页

**里程碑**：手机上单手操作舒适。

### Phase 5 — 健壮性 / 文档 / 回退（1-2d）

- [ ] 断线自动重连 WS（指数退避）
- [ ] 离线提示横幅
- [ ] 文档：Tailscale 配置指南（主）、SSH 回退（备）、Cloudflare Tunnel 可选
- [ ] 设置页：revoke device、推送测试按钮
- [ ] CI：remote server 启动失败时 Tauri 不阻塞桌面功能

**合计预估**：10-14 人日（纯工时，不含 buffer）

---

## 6. 配置与运维

### 6.1 用户首次配置步骤

1. PC 与手机都装 Tailscale，登录同一账号
2. PC 启动 MLFB → 自动启动 remote server
3. PC 设置页 → "Pair phone" → 弹 QR
4. 手机 Tailscale 开启，浏览器打开 `https://pc-name.tailnet-xxx.ts.net:58733`（或 `tailscale serve` 代理的 443）
5. 扫 QR → 输入 code → 完成配对
6. 手机 Chrome / Safari "添加到主屏" → PWA 完成安装
7. 允许通知权限

### 6.2 Tailscale HTTPS 的三种方式

- **推荐 `tailscale serve`**：一行命令让 PC 在 tailnet 内以 `https://pc-name.ts.net` 暴露 58733
- **Funnel**：如果需要非 tailnet 设备也能访问，用 `tailscale funnel`（公网入口）
- **自签 + 手动信任**：不推荐

### 6.3 用户卸载 / 撤销

- 设置页 "Devices" 列表 → "Revoke" 某个手机 → JWT 失效 + push subscription 删除
- 禁用远程：设置开关 `remote_enabled=false` → 停 axum + 清 subscription

---

## 7. 测试策略

| 类型 | 目标 | 工具 |
|---|---|---|
| 单元 | JWT 签发验证、pairing code 过期、transport adapter | vitest |
| 集成 | HTTP 路由 + WS 广播顺序 | Rust axum test + node ws client |
| E2E | 配对 → 推送 → 提交反馈 全链路 | Playwright + mock Tailscale（localhost） |
| 手动 | 真机 iOS / Android PWA 可用性、推送触达时延 | 真机矩阵 |
| 安全 | JWT 篡改、重放、pair code 爆破 | 手测 + burp |

---

## 8. 风险 / 缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| iOS Web Push 不稳定（息屏合并/延迟） | 中 | 文档预警；Phase 6+ 评估 Capacitor 包壳 |
| Tauri 前端与 Web 前端代码分叉 | 高 | 强制 transport adapter + lint 禁止直接 `invoke` |
| Tailscale 账号依赖 / 公司政策禁用 | 中 | 文档提供 Headscale / SSH / Cloudflare 替代 |
| axum 端口冲突 | 低 | 启动时探测 + 配置化 |
| session summary 含敏感信息经 Web Push 泄露 | 中 | 推送 payload 不含 summary，只有 title + id |
| 双端同时提交 feedback（race） | 中 | 服务端用 session.status 原子 CAS，后者收 409 |
| base64 图片迁移到 URL 的历史数据兼容 | 低 | 迁移脚本 + 双读兼容一个版本 |

---

## 9. 开放问题（待决定）

1. **remote server 宿主语言**：Rust (axum) 还是 Node (ws)？—— 决策推荐 Rust，但需评估 Rust 端现有 state 封装成本
2. **多设备配对上限**：3 台还是无限？
3. **PWA 在桌面浏览器打开**是否也作为一等支持（而非仅手机）？—— 倾向是
4. **summary 的 markdown 渲染**是否支持代码块语法高亮在手机端？—— 若 yes，bundle 会大几十 KB
5. **历史 session 保留策略**：手机本地缓存条数上限？
6. **离线提交队列**（后悔药）：允许离线起草，重新联网自动提交？—— MVP 先不做
7. **Tauri 桌面是否也走 HTTP loopback** 替代 invoke？—— 保守做法是双通道并存

---

## 10. 立即可执行的 Next Steps

用户确认此规划书后建议按以下顺序开工：

1. 在 `app/src/transport/` 写 3 个文件骨架：`index.ts` / `tauriTransport.ts` / `webTransport.ts`，并把最频繁的 5 个 invoke 调用搬过去，验证抽象不破坏桌面行为
2. 在 `app/src-tauri/` 加 `remote` feature flag + axum 依赖 + 最小 `/api/health`
3. 拉起浏览器本地访问 → Phase 1 的 hello world
4. 并行准备 icons + manifest（设计资产可以先行）

---

## 附录 A — 参考

- Tailscale serve docs: https://tailscale.com/kb/1242/tailscale-serve
- Web Push protocol RFC 8030
- VAPID spec RFC 8292
- axum 0.7: https://docs.rs/axum/latest/axum/
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/

## 附录 B — 相关 MLFB 现有模块

- [server.mjs](server.mjs) — MCP stdio server（`register_agent` 已临时注释）
- [daemon.mjs](mlra-server/daemon.mjs) — IPC bridge + orchestration 状态
- [feedbackStore.ts](app/src/store/feedbackStore.ts) — 前端主 store，`addSession` 已幂等化
- [App.tsx](app/src/App.tsx) — 启动逻辑与 Tauri invoke 调用点
- [Sidebar.tsx](app/src/components/Sidebar.tsx) — 移动端首要改造目标

---

**本文档状态**：draft v0.1，等待讨论
