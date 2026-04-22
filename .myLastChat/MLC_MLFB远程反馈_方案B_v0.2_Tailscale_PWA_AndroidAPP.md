---
title: MLFB 远程反馈 · 方案 B v0.2（Tailscale + PWA + 原生 Android APP）
description: 在 v0.1 基础上新增原生 Android APP 通道、FCM 推送、双端共用 API 的完整规划
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
    - mlfb
    - remote-feedback
    - tailscale
    - pwa
    - android
    - fcm
    - architecture
solved_lists:
    - 确认原方案 B 不需要租服务器（Tailscale 免费档够用）
    - 确认 Tailscale 与原生 APP 完全兼容（系统 VPN 层透明）
    - 确认现有 android/ 目录并非 MLFB UI 雏形（是 DJI quiz WebView 壳，需重构）
    - 确认推送走 FCM
---

# MLFB 远程反馈 · 方案 B v0.2（Tailscale + PWA + 原生 Android APP）

> 版本 v0.2 · 2026-04-22 · 继承自 v0.1
> 本版关键变化：
> 1. 明确 Tailscale 免费档即可满足"只要 PC 开着就行"
> 2. 新增原生 Android APP 客户端（与 PWA 共用后端 API）
> 3. 推送改为 **FCM**（Android APP）+ **Web Push**（PWA）双通道
> 4. 澄清现有 `android/` 目录是 DJI Quiz WebView 壳，需重构

---

## 0. 约束重申（关键）

| 约束 | 是否满足 | 说明 |
|---|---|---|
| 不用内网穿透 | ✅ | Tailscale 是 VPN mesh，不是穿透 |
| 不租服务器 | ✅ | Tailscale 免费档（个人 100 设备以内） |
| 只要 PC 开机就行 | ✅ | 控制面在 Tailscale 免费服务，数据 P2P |
| 出门在外也要能用 | ✅ | 手机 4G + Tailscale 即可 |
| 兼容自研 Android APP | ✅ | Tailscale 在系统层做虚拟网卡，APP 零侵入 |

---

## 1. 现状澄清：`android/` 目录是什么

**重要提醒**：当前仓库下 `android/` 目录的内容：

| 项 | 发现 |
|---|---|
| 包名 | `com.dji.quiz` |
| 架构 | `WebView + WebViewAssetLoader` 加载本地 `assets/web/index.html` |
| 定位 | 一个独立的 DJI 考试刷题应用壳 |
| MLFB 相关代码 | ❌ 无 |

**结论**：这不是 MLFB 的 Android UI 雏形，而是一个**可复用的 WebView 壳模板**。它证明你已有 Android 构建链路，但 MLFB APP **必须**走"重构或重写"路线。

### 三种重构走向

| 路线 | 做法 | 工作量 | 体验 |
|---|---|---|---|
| **R1. WebView 壳复用** | 改包名 → 把 `assets/web/` 换成 MLFB PWA build → 加 Tailscale 引导 + FCM | 2-3d | 和 PWA 一样，仅多推送/保活 |
| **R2. 原生 + WebView 混合** | 关键屏（列表/推送）原生，编辑器/Markdown 用 WebView | 5-7d | 较好 |
| **R3. 纯原生 Compose** | 全 Compose 重写 | 8-12d | 最好 |

**推荐 R1 作为 Phase 3，R2/R3 作为 Phase 5+ 渐进升级**。R1 能让你 1 周内就拿到可用 APP，且后续替换单屏为原生零迁移成本。

---

## 2. 架构总览（v0.2 版）

### 2.1 部署拓扑

```
┌──────────────────────────────────┐
│              PC                   │
│  ┌─────────────────────────────┐ │
│  │ MLFB Tauri + axum :58733    │ │
│  │ ├── HTTPS + WSS (对外)       │ │
│  │ ├── FCM Sender (外连 Google) │ │
│  │ ├── Web Push Sender (VAPID)  │ │
│  │ └── MCP stdio + daemon       │ │
│  └─────────────────────────────┘ │
│  tailscaled                       │
└──────────────┬───────────────────┘
               │ WireGuard P2P（数据面）
       ┌───────┴───────┐
       │               │
┌──────▼──────┐ ┌──────▼───────┐
│ Phone PWA   │ │ Android APP  │
│ (iOS/Android│ │ (Kotlin)     │
│  browser)   │ │              │
│             │ │ FG Service   │
│ Web Push    │ │ FCM          │
│ ServiceWrk  │ │ OkHttp/WS    │
└─────────────┘ └──────────────┘
 ↑ Push 通道           ↑
 FCM / APNs         FCM
 (Google/Apple)    (Google)
```

### 2.2 关键决策增量（相对 v0.1）

| # | 决策 | 理由 |
|---|---|---|
| D8 | 原生 APP 与 PWA 共用同一套 `/api/*` + `/ws` | 后端改一次，两端受益 |
| D9 | APP 推送走 FCM；PWA 推送走 Web Push | 分别用各端最成熟方案 |
| D10 | 配对 QR 新增 `ca_fingerprint` + `client_kind` 字段 | APP 做证书 pinning，PWA 忽略 |
| D11 | APP 首版走 WebView 壳（R1 路线），加原生外围（保活、FCM、Tailscale 引导） | 最快落地 + 最大 UI 复用 |
| D12 | 配对后 APP 和 PWA 都持有 JWT，**无区别对待** | 简化授权模型 |

---

## 3. 组件分解（增量部分）

### 3.1 PC 端 FCM Sender 模块

**位置**：`app/src-tauri/src/push/fcm.rs`（或 Node daemon 侧 `mlra-server/push-fcm.mjs`）

**关键接口**：

```rust
pub struct FcmConfig {
    project_id: String,
    service_account_json: PathBuf,  // 用户自己的 Firebase 项目
}

pub async fn send_fcm(
    cfg: &FcmConfig,
    token: &str,
    payload: FcmPayload,
) -> Result<()> { /* HTTP v1 API */ }

pub struct FcmPayload {
    title: String,       // "New feedback from Claude"
    body: String,        // "Please confirm deployment plan" (不含敏感信息)
    data: HashMap<String, String>, // { session_id, caller_id, urgency }
}
```

**用户首次配置**：
1. 用户去 Firebase Console 建项目（免费，私有）
2. 下载 service-account.json
3. MLFB 设置页 → "Android 推送" → 选文件 → 存 Tauri app data dir
4. APP 首次启动 → 拿 FCM token → `POST /api/push/register` → PC 存入 device_registry

### 3.2 PWA 的 Web Push（v0.1 已覆盖，此处不重复）

### 3.3 原生 APP 骨架清单

#### 3.3.1 项目基础

**建议复用现有 `android/` 目录，但做如下改造**：

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml      # 改 package = com.mlfb.app
│   │   ├── java/com/mlfb/app/
│   │   │   ├── MainActivity.kt       # WebView 壳（改自现有）
│   │   │   ├── pair/
│   │   │   │   ├── PairActivity.kt   # 扫 QR
│   │   │   │   └── TailscaleCheck.kt # 检测 VPN 在线
│   │   │   ├── net/
│   │   │   │   ├── ApiClient.kt      # OkHttp + Retrofit
│   │   │   │   ├── WsClient.kt       # WebSocket
│   │   │   │   └── CertPinning.kt    # 证书锁定
│   │   │   ├── push/
│   │   │   │   ├── MyFirebaseMsgService.kt
│   │   │   │   └── FcmTokenRegistrar.kt
│   │   │   ├── service/
│   │   │   │   └── ForegroundSyncService.kt  # 可选：WS 保活
│   │   │   └── store/
│   │   │       └── SessionCache.kt   # Room DB
│   │   └── assets/web/               # 放 MLFB PWA build 产物（R1 路线）
├── build.gradle.kts                  # 加 FCM / OkHttp / Room
```

#### 3.3.2 依赖变动

```kotlin
// android/app/build.gradle.kts 新增
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")  // JWT 存储
}
```

#### 3.3.3 配对流程（APP 版）

```
[MLFB 桌面设置页]                          [Android APP]
  点"Pair Android"                          点 Setup → Scan QR
       ↓                                          ↓
  POST /api/pair/start                        打开 CameraX
       ↓                                          ↓
  返回 { code, qr_payload }                 扫到 QR payload:
       ↓                                     {
  渲染 QR（含 ca_fingerprint）                 host: "mypc.ts.net",
       ↓                                       port: 58733,
       ←─── 同 Tailnet WireGuard 加密 ───→     code: "483-721",
                                               ca_fp: "sha256/..."
                                             }
                                                  ↓
                                          校验 TLS pinning
                                                  ↓
                                          POST /api/pair/complete
                                          { code, device_name, fcm_token }
                                                  ↓
                                     ← { jwt, refresh }
                                                  ↓
                                     EncryptedSharedPreferences 存 JWT
```

#### 3.3.4 推送到前台的链路

```
新 session →
  PC daemon 入库 →
  遍历 device_registry →
    Android devices: HTTP POST FCM → Google → 手机系统推送
    PWA devices:     web-push → 浏览器厂商 → 手机系统推送
  所有 WS 连接：广播 session.new

手机 APP 收 FCM:
  MyFirebaseMsgService.onMessageReceived
    ↓
  展示系统通知 { title, body, deep link: mlfb://session/<id> }
    ↓
  用户点通知 → MainActivity 启动 → 直通 session 详情页
    ↓
  WebView / 原生 fetch session 完整内容
```

### 3.4 共用后端 API 契约（v0.1 的基础上加）

```
POST /api/push/register
Body: { platform: "android"|"ios"|"web",
        token: string,                     // FCM token or Web Push subscription
        device_id: string }
→ 200 { ok: true }

POST /api/push/unregister
Body: { device_id }

POST /api/devices/:id/revoke   // 桌面/APP 自己都能调
```

---

## 4. 分阶段路线图（v0.2 版）

### Phase 0 — 预备（0.5d）
- [ ] axum 框架接入 Tauri，`/api/health` hello world
- [ ] 建 `app/src/transport/` 骨架
- [ ] 复制现有 `android/` 为 `android-mlfb/`（保留 DJI 那个作参考），改 package

### Phase 1 — 只读 HTTP+WS + Tailscale 打通（2-3d）
- [ ] `/api/callers` `/api/sessions` `/ws` 只读
- [ ] 桌面 Tauri 侧继续走 invoke（不动）
- [ ] 浏览器本地验证
- [ ] Tailscale 装机验证从手机浏览器能访问

**里程碑**：`http://mypc.ts.net:58733` 手机能看只读列表

### Phase 2 — 鉴权 + 写路径 + PWA（3-4d）
- [ ] 配对 flow + JWT
- [ ] 写路径 `/api/sessions/:id/feedback`
- [ ] `vite-plugin-pwa` 接入 + manifest
- [ ] Service worker + Web Push（VAPID 生成）

**里程碑**：手机浏览器 PWA 完成闭环（带 Web Push）

### Phase 3 — Android APP（R1 路线，4-5d）
- [ ] `android-mlfb/` 改包名 + 新 icon
- [ ] WebView 壳加载 PWA build 产物（也可直接加载 `https://mypc.ts.net:58733`）
- [ ] Tailscale 状态检测（`VpnService.prepare()` 返回 null 判定）+ 引导装 Tailscale
- [ ] 配对 Activity（CameraX + MLKit 扫 QR）
- [ ] FCM 接入 + `MyFirebaseMsgService`
- [ ] 点通知深链打开对应 session
- [ ] EncryptedSharedPreferences 存 JWT

**里程碑**：APK 装机，扫 QR 配对，锁屏收 FCM 推送，点击进入回复

### Phase 4 — 移动体验打磨（2-3d）
- [ ] 响应式 CSS（sidebar drawer、44px 触摸尺寸）
- [ ] 图片 URL 化 + lazy
- [ ] Android 国产手机保活白名单引导页
- [ ] iOS add-to-home 引导页

### Phase 5 — 健壮性 + 文档（2d）
- [ ] WS 断线重连（指数退避）
- [ ] Tailscale 离线检测 + 提示
- [ ] Firebase 项目创建文档（用户视角）
- [ ] APK 构建与签名文档

### Phase 6（可选）— 原生化升级
- [ ] 列表屏原生 Compose
- [ ] 详情屏保留 WebView
- [ ] 前台 Service WebSocket 保活（可选）

**v0.2 总工时估算**：14-18 人日（比 v0.1 多 5-7d 给 Android APP）

---

## 5. Firebase 配置文档（用户实操）

### 5.1 一次性设置（约 15 分钟）

1. 打开 https://console.firebase.google.com/，用 Google 账号登录
2. Add project → 名称 `mlfb-<yourname>` → 关闭 Analytics → 创建
3. Project settings → Service accounts → Generate new private key → 保存 JSON
4. Project settings → General → Add app → Android
   - Package name：`com.mlfb.app`
   - SHA-1：`gradlew signingReport` 拿 debug SHA-1
   - 下载 `google-services.json` 放到 `android-mlfb/app/`
5. MLFB 桌面 → 设置 → Android 推送 → 选 service-account.json

### 5.2 隐私说明

- 推送 payload **不含** feedback 正文，只有 `session_id`
- feedback 完整内容通过 Tailscale 加密隧道拉取（Google 看不见）
- 你的 Firebase 项目只有你自己能访问

---

## 6. 风险矩阵（v0.2 更新）

| 风险 | 等级 | 缓解 |
|---|---|---|
| Tailscale 免费策略变更 | 低 | 100 设备个人档已十余年稳定；必要时迁 Headscale |
| 国产 Android 杀后台 | 中 | 靠 FCM（高优先级）而非自保活，FCM 不受厂商杀 |
| Firebase 项目配置门槛 | 中 | 详细文档 + 可选项（不配 FCM 退化为前台 WS） |
| WebView 与 Tauri Webview 行为差异 | 低 | 用相对标准 Web API，避 Tauri 私有 |
| APP 和 PWA 双端维护成本 | 中 | R1 路线复用 PWA build，维护只有一份 |
| FCM 推送延迟（国内网络） | 中 | 已知问题；补充"前台 WS 模式"作备选 |
| 现有 `android/` 误认为 MLFB 基础 | 已暴露 | 本文档第 1 节明确说明 |

---

## 7. 立即可执行的 Next Steps

推荐动工顺序：

1. **本周**：完成 Phase 0 + Phase 1。先让手机浏览器看到只读列表，验证 Tailscale + axum 链路可行
2. **下周**：Phase 2，PWA 闭环（Web Push 可最后接）
3. **第三周**：Phase 3，Android APP R1 路线（WebView 壳 + FCM）
4. **第四周**：Phase 4 打磨 + 文档

**可并行**的早期准备：
- 现在就可以去 Firebase Console 建项目、生成 service-account.json
- 现在就可以把 `android/` 的 DJI 包名改掉 + 更新 icon
- 现在就可以确认家里 PC 装 Tailscale 无障碍、手机能互见

---

## 8. 开放问题（仍需决定）

1. axum 是放 Tauri Rust 端，还是放 Node daemon？**v0.2 建议 Rust 端**，因为 Android APP 直连更适合稳定 TLS server
2. APP 是否要做"完全不装 Tailscale 也能用"的 LAN 模式回退？—— **建议 Phase 6 再考虑**
3. 多设备上限（几台 APP / 几个 PWA）？—— 建议桌面设置页里显式列表无硬上限
4. APP 端是否也做离线草稿队列？—— **MVP 先不做**

---

## 附录 A — 与 v0.1 的差异清单

| 章节 | v0.1 | v0.2 |
|---|---|---|
| 拓扑图 | 仅 PWA | PWA + Android APP 双端 |
| 推送 | Web Push only | Web Push + FCM |
| 配对 | 浏览器打开链接 | 统一扫 QR（APP 和 PWA 都扫同一个） |
| 证书 | Tailscale serve 签 | 可选：APP 做证书 pinning |
| 风险 | 泛 | 补充国产手机保活、FCM 延迟 |
| 工时 | 10-14d | 14-18d |
| 新增章节 | — | 第 1 节澄清 `android/` 目录真相 |

## 附录 B — 参考

- Tailscale Android VpnService: https://tailscale.com/kb/1023/troubleshooting-android
- Firebase Cloud Messaging HTTP v1 API
- OkHttp Certificate Pinning: https://square.github.io/okhttp/features/https/
- v0.1 规划书：[MLC_MLFB远程反馈_方案B_Tailscale_PWA规划书.md](.myLastChat/MLC_MLFB远程反馈_方案B_Tailscale_PWA规划书.md)

---

**本文档状态**：draft v0.2，等待评审后开工
