---
title: SummaryPanel链接点击处理
description: 为SummaryPanel中的Markdown链接添加点击处理：网页链接在浏览器打开，本地文件用openPath打开
workplace: e:\Dev\my-last-feedback
project: my-last-feedback
type: coding
solved_lists:
  - 分析SummaryPanel现有Markdown链接渲染实现
  - 添加LinkRenderer自定义组件处理不同类型链接
  - 网页链接(http/https)通过tauri-plugin-opener的openUrl在默认浏览器打开
  - 本地文件链接(file://、绝对路径、相对路径)通过openPath在文件管理器/默认程序打开
---

# SummaryPanel 链接点击处理

## 1. Previous Conversation

用户观察到 MLFB（My Last Feedback）界面的反馈信息区域中，Markdown 渲染出的各种链接缺乏正确的点击行为。问题是：

1. **网页链接**（http/https）：点击后应在默认浏览器中打开
2. **本地文件链接**：点击后应在已打开的 VS Code 中打开，或在本地文件资源管理器中打开

## 2. Current Work

在 `app/src/components/SummaryPanel.tsx` 中：

- 新增 `LinkRenderer` 函数组件，接收 `projectDirectory` prop
- 在 `SummaryPanel` 中从 store 读取 `projectDirectory`（persistent 模式从 session，legacy 模式从全局 store）
- 创建 `LinkRendererWithDir`（useMemo 绑定 projectDirectory）
- 将 `a: LinkRendererWithDir` 注册到 `ReactMarkdown` 的 `components` 属性

## 3. Key Technical Concepts

- **Tauri v2** + **tauri-plugin-opener**：`openUrl` 用于浏览器，`openPath` 用于本地文件
- **ReactMarkdown** `components` prop：自定义每种 HTML 元素的渲染方式
- **AppMode**：persistent（IPC 多 caller）vs legacy（CLI args 单次）
- **projectDirectory**：来自 Session 或 legacy store，用于解析相对路径

## 4. Relevant Files and Code

### app/src/components/SummaryPanel.tsx

新增 `LinkRenderer` 组件（插入在 `CodeBlock` 之后，`QuestionsForm` 之前）：

```tsx
function LinkRenderer({
  href,
  children,
  projectDirectory,
  ...rest
}: ComponentProps<"a"> & { node?: unknown; projectDirectory?: string }) {
  const { node: _node, ...filteredRest } = rest as Record<string, unknown>;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) return;
      e.preventDefault();

      const isWeb = href.startsWith("http://") || href.startsWith("https://");
      const isFileUrl = href.startsWith("file://");
      const isAbsolutePath = /^[a-zA-Z]:[/\\]/.test(href) || href.startsWith("/");

      if (isWeb) {
        import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      } else if (isFileUrl || isAbsolutePath) {
        const path = isFileUrl
          ? decodeURIComponent(href.replace(/^file:\/\/\/?/, ""))
          : href;
        import("@tauri-apps/plugin-opener")
          .then(({ openPath }) => openPath(path))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      } else {
        const base = projectDirectory || "";
        const resolved = base ? `${base}/${href}`.replace(/\\/g, "/") : href;
        import("@tauri-apps/plugin-opener")
          .then(({ openPath }) => openPath(resolved))
          .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
      }
    },
    [href, projectDirectory],
  );

  return (
    <a href={href} onClick={handleClick} style={{ cursor: "pointer" }} {...filteredRest}>
      {children}
    </a>
  );
}
```

`SummaryPanel` 中新增的 store 读取和 memoized renderer：

```tsx
const legacyProjectDirectory = useFeedbackStore((s) => s.projectDirectory);
const projectDirectory = appMode === "persistent"
  ? (activeSession?.projectDirectory || "")
  : legacyProjectDirectory;

const LinkRendererWithDir = useMemo(
  () =>
    (props: ComponentProps<"a"> & { node?: unknown }) => (
      <LinkRenderer {...props} projectDirectory={projectDirectory} />
    ),
  [projectDirectory],
);

// ReactMarkdown 注册:
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkBreaks]}
  components={{ code: CodeBlock, a: LinkRendererWithDir }}
>
```

## 5. Problem Solving

- **问题**：ReactMarkdown 默认不拦截 `<a>` 点击，Tauri WebView 中链接点击行为不可预测（可能在 WebView 内导航或无响应）
- **解法**：自定义 `a` 组件，拦截 `onClick`，使用 `@tauri-apps/plugin-opener` 分dispatching到浏览器或本地文件程序，带 fallback 到 `window.open`
- **已有参考**：`CallerPanelParts.tsx` 中已有相同的 dynamic import + openUrl 模式，保持一致

## 6. Pending Tasks and Next Steps

- 待验证：构建并运行测试各类链接点击行为
- 可选增强：对 VS Code workspace 相对路径（如 `[file.ts](file.ts#L10)`），可考虑通过 `vscode://file/...` URI scheme 直接在 VS Code 中打开（需要额外实现）
