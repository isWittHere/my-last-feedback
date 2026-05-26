---
title: 构建失败原因：Terminal Shell 类型不一致
description: restartTerminalTab 类型遗漏 shell 导致前端构建失败
workplace: ${workspaceFolder}
project: my-last-feedback
type: report
tags:
  - build
  - typescript
  - terminal
solved_lists:
  - 定位 npm run build 失败原因
  - 确认失败与输入框修复无关
---

# 构建失败原因：Terminal Shell 类型不一致

更新时间：2026-05-06

## 背景

在复核输入框换行与退格修复时，执行了前端构建验证：

```bash
cd app && npm run build
```

构建流程执行 `tsc && vite build`，其中 TypeScript 阶段失败。

## 报错摘要

```text
src/components/TerminalPanel.tsx:369:71 - error TS2353: Object literal may only specify known properties, and 'shell' does not exist in type 'Pick<CreateTerminalTabOptions, "rows" | "cols">'.

src/store/terminalStore.ts:298:24 - error TS2339: Property 'shell' does not exist on type 'Pick<CreateTerminalTabOptions, "rows" | "cols">'.
```

## 直接原因

`app/src/store/terminalStore.ts` 中的 `CreateTerminalTabOptions` 已经包含 `shell?: string | null`，创建终端路径也会把 `options.shell` 传给后端 `terminal_create`。

但同一文件里的 `restartTerminalTab` 类型声明只允许：

```ts
Pick<CreateTerminalTabOptions, "cols" | "rows">
```

这导致两个位置出现类型矛盾：

- `app/src/components/TerminalPanel.tsx:369` 在重启终端时传入 `shell`
- `app/src/store/terminalStore.ts:298` 在 `restartTerminalTab` 实现里读取 `options.shell`

换句话说，功能实现已经支持重启时指定 shell，但函数类型声明没有同步更新。

## 影响范围

该错误会阻止 `npm run build` 通过，因为 TypeScript 编译阶段直接失败。

它不影响本次输入框修复的源文件诊断结果。输入框修复集中在：

- `app/src/components/composer/ComposerEditor.tsx`

本次构建失败点集中在终端功能：

- `app/src/components/TerminalPanel.tsx`
- `app/src/store/terminalStore.ts`

## 建议修复

最小修复方式是把 `restartTerminalTab` 的 options 类型扩展为包含 `shell`：

```ts
restartTerminalTab: (tabId: string, options?: Pick<CreateTerminalTabOptions, "cols" | "rows" | "shell">) => Promise<void>;
```

如果希望减少未来类似遗漏，也可以考虑提取单独类型：

```ts
type RestartTerminalTabOptions = Pick<CreateTerminalTabOptions, "cols" | "rows" | "shell">;
```

然后在接口和实现中统一使用该类型。

## 结论

构建失败的根因是终端重启 API 的 TypeScript 类型声明落后于实际实现，不是输入框换行与退格修复引入的问题。
