---
title: MLC 侧栏折叠机制移除与预存 bug 修复
description: 移除 MLC 面板折叠成窄栏机制，顶栏按钮改为纯开关，同时顺手修复 mergeCallers 预存 bug
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: coding
tags:
  - MLFB
  - MLC
  - UI
  - bugfix
solved_lists:
  - 移除 MLC 面板折叠成窄栏机制（顶栏按钮改为纯开关）
  - 移除 MlcSidePanel.tsx 中 collapsed 相关代码
  - 移除 CallerPanelParts.tsx 中 setMlcPanelCollapsed 调用
  - 移除 index.css 中 .mlc-panel-collapsed 样式块
  - 修复 feedbackStore.ts mergeCallers 预存 bug（缺少 mlcAttachments）
  - npm run build 通过
---

# MLC 侧栏折叠机制移除与预存 bug 修复

## 1. 背景与目标

用户要求移除 MLC 面板"折叠成窄栏"的机制，原因是顶栏左右按钮已经负责面板的打开/关闭，不需要面板内部再有一个折叠按钮将面板缩小成 34px 窄栏。

## 2. 需求分析

原折叠机制设计：
- 顶栏按钮点击 → 面板从正常宽度折叠成 34px 窄栏（`mlcPanelCollapsed: true`）
- 再次点击 → 从 34px 窄栏展开回正常宽度
- 窄栏仅显示一个竖排的折叠按钮

新机制（移除后）：
- 顶栏按钮点击 → 直接打开/关闭面板，无折叠状态
- 同一侧再次点击 → 关闭面板（`setMlcPanelVisible(false)`）

## 3. 修改的文件

### 3.1 FeedbackApp.tsx

- `toggleMlcPanelAt` 逻辑从切换折叠改为纯开关：
  - 面板不可见或位置不匹配 → 打开到指定侧
  - 面板已在该侧可见 → 关闭面板
- 移除 `mlcPanelCollapsed` 订阅
- 顶栏按钮 title 从"折叠/展开"改为"打开/关闭"

关键代码：
```tsx
const toggleMlcPanelAt = useCallback((panelPosition: "left" | "right") => {
  if (!mlcPanelVisible || mlcPanelPosition !== panelPosition) {
    setMlcPanelPosition(panelPosition);
    setMlcPanelVisible(true);
    return;
  }
  setMlcPanelVisible(false);
}, [mlcPanelPosition, mlcPanelVisible, setMlcPanelPosition, setMlcPanelVisible]);
```

### 3.2 MlcSidePanel.tsx

- 移除 `MLC_PANEL_COLLAPSED_WIDTH` 常量
- 移除 `collapsed` 状态订阅和 `setCollapsed` setter
- 移除 `if (collapsed) { return <aside className="mlc-panel-collapsed"... }` 窄栏分支
- 面板顶行 tab row 保留 MLC tab + 关闭按钮，移除折叠按钮

### 3.3 CallerPanelParts.tsx

- `handleMlcClick` 中移除两处 `setMlcPanelCollapsed(false)` 调用

### 3.4 index.css

- 移除 `.mlc-panel-collapsed { align-items: center; padding-top: 8px; }` 样式块

### 3.5 feedbackStore.ts — 预存 bug 修复

- `mergeCallers` action 中，合并两个 caller 的 draft 时遗漏了 `mlcAttachments` 字段
- 导致 TypeScript 编译错误：`Property 'mlcAttachments' is missing in type`
- 修复：在合并 draft 时添加 `mlcAttachments: [...(targetDraft.mlcAttachments || []), ...(sourceDraft.mlcAttachments || [])]`

## 4. 验证结果

| 检查项 | 结果 |
|--------|------|
| 无 `.mlc-panel-collapsed` CSS 残留 | ✅ |
| FeedbackApp.tsx 无编译错误 | ✅ |
| MlcSidePanel.tsx 无编译错误 | ✅ |
| CallerPanelParts.tsx 无编译错误 | ✅ |
| feedbackStore.ts mergeCallers bug 已修复 | ✅ |
| npm run build 通过 | ✅ |

## 5. 遗留状态

- Store 中的 `mlcPanelCollapsed` 字段和 `setMlcPanelCollapsed` action 仍存在于 `feedbackStore.ts`，但已无调用方
- 保留不影响功能，可后续作为技术债务清理

## 6. 相关规划文档

- `.myLastChat/MLC_MLFB_侧栏折叠与面板标签页规划.md` — 描述原折叠机制规划，已需更新（移除折叠相关内容）