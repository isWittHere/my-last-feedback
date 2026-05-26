---
title: OpenCode 完整 Payload 发送与图片能力控制规划
description: 规划修复 Agent Console 未发送完整组装信息及图片能力控制问题
workplace: ${workspaceFolder}
project: my-last-feedback
type: planning
tags:
  - opencode
  - agent-console
  - payload
  - image-attachments
  - model-capabilities
solved_lists:
  - 已定位普通 prompt 发送路径优先发送 historyText 导致完整 payload 未进入模型上下文
  - 已定位 OpenCode HTTP /provider 可提供模型视觉能力字段
---

## 背景

Agent Console 当前已经能在本地消息 UI 中组装并展示完整提交信息，例如：

```md
## User Prompt
用户输入

## Attachment: Test Logs
...

## Attachment: Images
...

## Attachment: Resource Links
...
```

但实际发送给 OpenCode 的内容并不等同于本地显示的完整信息。用户通过让 OpenCode 回忆“刚才收到的原文”验证后发现，OpenCode 只能看到纯用户文本，而看不到测试日志、图片摘要、资源链接等组装区块。

同时，图片附件还涉及另一个约束：并不是所有 OpenCode 模型都支持视觉输入。前端应根据当前模型能力控制图片入口，并在发送层做保底过滤。

## 目标

1. 普通 OpenCode prompt 发送完整组装 payload，而不是只发送用户原始输入。
2. 普通 OpenCode prompt 支持图片 file parts，行为接近 OpenCode 官方前端。
3. 根据当前模型能力控制图片附件入口：非视觉模型隐藏图片按钮，拒绝粘贴、拖拽和选择图片。
4. 在发送层做保底保护：如果非视觉模型意外携带图片，移除图片编码信息，并把错误说明放入 prompt 文本。
5. 保持 UI 展示拆分：用户气泡仍只显示纯 prompt，完整 payload 通过按钮查看，附件以 tag 形式呈现。

## 非目标

1. 暂不处理 Windows 终端乱码问题，该问题已单独记录在 [.myLastChat/MLC_命令输出乱码与PowerShellProfile问题记录.md](MLC_命令输出乱码与PowerShellProfile问题记录.md)。
2. 暂不修改 OpenCode server 或参考仓库。
3. 暂不提交 `ref-repos/`，该目录只作为参考资料。
4. 暂不引入新的外部依赖，除非 TypeScript 类型处理确实需要。

## 现状分析

### 完整 payload 已经被构造

文件：[app/src/composer/submittedFeedback.ts](../app/src/composer/submittedFeedback.ts)

`buildSubmittedComposerPayload` 会返回：

```ts
return {
  markdown: sections.join("\n\n"),
  historyText: trimmedFeedback,
  imageList: images.map((image) => ({ path: image.path, name: image.name, data_url: image.dataUrl })),
};
```

含义：

- `markdown`：完整组装信息。
- `historyText`：纯用户输入，用于输入历史或简洁展示。
- `imageList`：图片附件列表。

### 普通 OpenCode prompt 当前发送了 historyText

文件：[app/src/store/agentStore.ts](../app/src/store/agentStore.ts)

当前普通 prompt 发送逻辑为：

```ts
await httpRuntime.runtime.client.promptAsync(providerSessionId, {
  parts: [{ type: "text", text: submittedPrompt.historyText || submittedPrompt.markdown }],
  model: openCodeModelFromSession(configuredSession),
  ...(configuredSession.modeId ? { agent: configuredSession.modeId } : {}),
});
```

因为只要用户输入不为空，`submittedPrompt.historyText` 就是真值，所以实际发送的是纯用户输入，完整 markdown 被跳过。

这是“OpenCode 看不到组装信息”的直接根因。

### 当前普通 prompt parts 只支持 text

文件：[app/src/agent/opencode/httpTypes.ts](../app/src/agent/opencode/httpTypes.ts)

当前类型为：

```ts
export interface OpenCodePromptPart {
  id?: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
}
```

这意味着普通 `promptAsync` 路径没有表达 image/file part 的类型能力。

### slash command 路径已有图片 file part

文件：[app/src/store/agentStore.ts](../app/src/store/agentStore.ts)

`openCodeCommandFilePartsFromSession` 当前会把 session images 转成 OpenCode file part：

```ts
return session.images
  .filter((image) => Boolean(image.dataUrl))
  .map((image) => ({
    type: "file",
    mime: /^data:([^;,]+)/.exec(image.dataUrl || "")?.[1] || "image/png",
    url: image.dataUrl || "",
    filename: image.name,
  }));
```

但它只用于 slash command 路径，不用于普通 prompt。

### OpenCode 官方前端普通 prompt 支持 file/image parts

参考文件：[ref-repos/opencode-1.14.33/packages/app/src/components/prompt-input/build-request-parts.ts](../ref-repos/opencode-1.14.33/packages/app/src/components/prompt-input/build-request-parts.ts)

官方前端会把图片构造成：

```ts
{
  id: Identifier.ascending("part"),
  type: "file",
  mime: attachment.mime,
  url: attachment.dataUrl,
  filename: attachment.filename,
}
```

然后随普通 `promptAsync` 一起发送。

### OpenCode HTTP 可返回模型视觉能力

当前项目已经调用：

```ts
runtime.client.providers()
```

实际请求：

```http
GET /provider
```

参考文件：[ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/provider.ts](../ref-repos/opencode-1.14.33/packages/opencode/src/server/routes/instance/provider.ts)

模型能力中包含：

```ts
capabilities: {
  attachment: boolean,
  input: {
    image: boolean,
    text: boolean,
    audio: boolean,
    video: boolean,
    pdf: boolean,
  }
}
```

判断图片输入能力应优先使用：

```ts
model.capabilities.input.image === true
```

### 当前模型能力被丢弃

文件：[app/src/store/agentStore.ts](../app/src/store/agentStore.ts)

`choicesFromOpenCodeProviders` 会传入原始 model：

```ts
toChoiceOption(`${provider.id}/${model.id}`, model.name || model.id, provider.name, model)
```

但 `toChoiceOption` 目前只提取 `contextLimit`：

```ts
return {
  id,
  label,
  description,
  contextLimit: extractModelContextLimit(source),
};
```

所以 `/provider` 返回的 `capabilities.input.image` 当前没有进入 `session.availableModels`。

### OpenCode 后端已有不支持模态的保底转换

参考文件：[ref-repos/opencode-1.14.33/packages/opencode/src/provider/transform.ts](../ref-repos/opencode-1.14.33/packages/opencode/src/provider/transform.ts)

OpenCode 后端会检查 file/image part 的 mime modality：

```ts
const modality = mimeToModality(mime)
if (model.capabilities.input[modality]) return part

return {
  type: "text",
  text: `ERROR: Cannot read ${name} (this model does not support ${modality} input). Inform the user.`,
}
```

这说明 OpenCode 语义上也认为模型能力应控制附件模态。MLFB 前端应提前控制，发送层再兜底。

## 设计方案

### 一、扩展模型能力数据结构

文件：[app/src/agent/types.ts](../app/src/agent/types.ts)

新增模型能力类型：

```ts
export interface AgentModelCapabilities {
  attachment?: boolean;
  input?: {
    text?: boolean;
    image?: boolean;
    audio?: boolean;
    video?: boolean;
    pdf?: boolean;
  };
}
```

扩展 `AgentChoiceOption`：

```ts
export interface AgentChoiceOption {
  id: string;
  label: string;
  description?: string;
  contextLimit?: number;
  capabilities?: AgentModelCapabilities;
}
```

### 二、从 OpenCode provider model 提取能力

文件：[app/src/store/agentStore.ts](../app/src/store/agentStore.ts)

新增提取函数，优先级：

1. `model.capabilities.input.image`
2. `model.modalities.input.includes("image")`
3. `model.attachment` 作为弱 fallback

建议实现：

```ts
function extractModelCapabilities(source: unknown): AgentModelCapabilities | undefined {
  const record = asRecord(source);
  const capabilities = asRecord(record?.capabilities);
  const input = asRecord(capabilities?.input);
  const modalities = asRecord(record?.modalities);
  const modalityInput = Array.isArray(modalities?.input) ? modalities.input : [];

  return {
    attachment: booleanValue(capabilities?.attachment) ?? booleanValue(record?.attachment),
    input: {
      image: booleanValue(input?.image) ?? modalityInput.includes("image") ? true : undefined,
      text: booleanValue(input?.text) ?? modalityInput.includes("text") ? true : undefined,
      audio: booleanValue(input?.audio) ?? modalityInput.includes("audio") ? true : undefined,
      video: booleanValue(input?.video) ?? modalityInput.includes("video") ? true : undefined,
      pdf: booleanValue(input?.pdf) ?? modalityInput.includes("pdf") ? true : undefined,
    },
  };
}
```

实现时注意布尔优先级，避免 `??` 和 `?:` 混用产生歧义。

### 三、判断当前模型是否支持图片

新增工具函数：

```ts
function agentSessionSelectedModel(session: AgentSession): AgentChoiceOption | undefined {
  return session.availableModels?.find((model) => model.id === session.modelId);
}

function agentModelSupportsImages(model: AgentChoiceOption | undefined): boolean {
  return model?.capabilities?.input?.image === true;
}

function agentSessionSupportsImages(session: AgentSession): boolean {
  return agentModelSupportsImages(agentSessionSelectedModel(session));
}
```

unknown 能力按不支持处理。

### 四、Composer UI 控制图片入口

文件：

- [app/src/components/agent/AgentComposer.tsx](../app/src/components/agent/AgentComposer.tsx)
- [app/src/components/composer/SharedComposerInput.tsx](../app/src/components/composer/SharedComposerInput.tsx)

在 AgentComposer 中计算：

```ts
const supportsImages = agentSessionSupportsImages(session);
```

传给 SharedComposerInput：

```tsx
<SharedComposerInput
  imageAttachmentsDisabled={!supportsImages}
  imageAttachmentsDisabledReason={t("agentConsole.modelDoesNotSupportImages", "The selected model does not support image input")}
  ...
/>
```

SharedComposerInput 行为：

- `imageAttachmentsDisabled === true` 时隐藏图片 attach 按钮。
- file input disabled。
- paste 图片时阻止加入，并触发 `onImageAttachmentRejected`。
- drop 图片时阻止加入，并触发 `onImageAttachmentRejected`。
- 如果已有图片 tag，仍允许显示和删除，避免用户无法清理旧状态。

建议新增 props：

```ts
imageAttachmentsDisabled?: boolean;
imageAttachmentsDisabledReason?: string;
onImageAttachmentRejected?: (reason: string) => void;
```

### 五、切换模型时处理已存在图片

有两种策略：

1. 自动清理：用户切到非视觉模型时，清空 `session.images` 并显示提示。
2. 保留但发送前清理：UI 显示旧图片 tag，发送时过滤并报错。

建议采用组合策略：

- 切换模型时不立即删除，避免意外丢用户内容。
- Composer 明确提示当前模型不支持图片，并允许用户手动删除。
- 发送时强制清理，并在 prompt 中加入错误说明。

如果后续用户觉得保留旧图片容易误解，再改成切换模型立即清理。

### 六、普通 prompt 发送完整 markdown

文件：[app/src/store/agentStore.ts](../app/src/store/agentStore.ts)

把普通 prompt 发送从：

```ts
parts: [{ type: "text", text: submittedPrompt.historyText || submittedPrompt.markdown }]
```

改为：

```ts
parts: [{ type: "text", text: submittedPrompt.markdown }]
```

`historyText` 仍只用于本地输入历史和简洁展示，不用于 provider 发送。

### 七、普通 prompt 支持 image file parts

扩展 OpenCode prompt part 类型。

文件：[app/src/agent/opencode/httpTypes.ts](../app/src/agent/opencode/httpTypes.ts)

建议改为 union：

```ts
export type OpenCodePromptPart = OpenCodePromptTextPart | OpenCodePromptFilePart;

export interface OpenCodePromptTextPart {
  id?: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
}

export interface OpenCodePromptFilePart {
  id?: string;
  type: "file";
  mime: string;
  url: string;
  filename?: string;
  source?: unknown;
}
```

可复用或抽象现有 `OpenCodeCommandFilePart`，避免重复定义。

在普通 prompt 发送时：

```ts
const promptParts: OpenCodePromptPart[] = [
  { type: "text", text: submittedPrompt.markdown },
  ...openCodeImageFilePartsFromSession(configuredSession),
];
```

### 八、发送层保底过滤图片

发送前判断当前模型是否支持图片：

```ts
const supportsImages = agentSessionSupportsImages(configuredSession);
```

如果支持：

```ts
parts = [textPart, ...imageParts]
```

如果不支持且存在图片：

```ts
parts = [
  {
    type: "text",
    text: appendUnsupportedImageNotice(submittedPrompt.markdown, configuredSession.images),
  },
]
```

错误说明示例：

```md
## Attachment: Images
ERROR: Images were removed because the selected model does not support image input. Inform the user.

- clipboard_123.png was not sent.
```

注意：

- 不发送 `dataUrl`。
- 不发送 base64。
- 如果 markdown 中已有 `Attachment: Images` 摘要，可以追加错误说明或改造构建 payload 时跳过图片摘要。
- 保底说明应进入模型上下文，让模型知道为什么图片不可见。

### 九、slash command 路径也应遵守模型能力

当前 slash command 路径会通过 `openCodeCommandFilePartsFromSession` 带图片。

建议也加同样保底：

- 如果当前模型不支持图片，`commandParts` 返回空。
- 对 slash command arguments 或 diagnostics 追加本地提示。
- 如果 command API 支持 text/error part，再加错误文本；如果不支持，至少添加 Agent diagnostic。

普通 prompt 是优先修复对象；slash command 可以同批处理，避免行为不一致。

### 十、用户消息本地展示保持拆分

当前设计保留：

- 用户气泡显示纯 prompt。
- 完整信息按钮显示 `submittedMarkdown`。
- 附件 tag 显示本地快照。

发送层修复后，不应把完整 markdown 重新塞回用户气泡正文。

### 十一、i18n 文案

需要新增中英文文案：

```json
{
  "agentConsole.modelDoesNotSupportImages": "当前模型不支持图片输入",
  "agentConsole.imageAttachmentRejected": "当前模型不支持图片输入，图片未添加",
  "agentConsole.imagesRemovedForModel": "已移除图片：当前模型不支持图片输入"
}
```

英文：

```json
{
  "agentConsole.modelDoesNotSupportImages": "The selected model does not support image input",
  "agentConsole.imageAttachmentRejected": "The selected model does not support image input. The image was not added.",
  "agentConsole.imagesRemovedForModel": "Images were removed because the selected model does not support image input"
}
```

## 文件修改清单

预计涉及：

- [app/src/agent/types.ts](../app/src/agent/types.ts)
  - 扩展 `AgentChoiceOption`，保存模型能力。
- [app/src/agent/opencode/httpTypes.ts](../app/src/agent/opencode/httpTypes.ts)
  - 扩展 `OpenCodePromptPart`，支持 file part。
- [app/src/store/agentStore.ts](../app/src/store/agentStore.ts)
  - 提取 `/provider` 模型能力。
  - 普通 prompt 发送完整 markdown。
  - 普通 prompt 发送 image file parts。
  - 非视觉模型发送层过滤图片并放置错误说明。
  - slash command 图片 part 遵守模型能力。
- [app/src/components/agent/AgentComposer.tsx](../app/src/components/agent/AgentComposer.tsx)
  - 计算当前模型图片能力。
  - 传入图片禁用参数和拒绝回调。
- [app/src/components/composer/SharedComposerInput.tsx](../app/src/components/composer/SharedComposerInput.tsx)
  - 隐藏或禁用图片按钮。
  - 拦截 paste/drop/file input 图片。
- [app/src/i18n/locales/zh.json](../app/src/i18n/locales/zh.json)
  - 新增中文提示。
- [app/src/i18n/locales/en.json](../app/src/i18n/locales/en.json)
  - 新增英文提示。

## 实施步骤

1. 扩展类型：`AgentChoiceOption`、OpenCode prompt parts、模型能力结构。
2. 在 `choicesFromOpenCodeProviders` 中提取并保存模型能力。
3. 添加 helper：判断当前 session/model 是否支持图片输入。
4. 修改 `SharedComposerInput`：支持图片禁用、拒绝粘贴、拒绝拖拽、隐藏按钮。
5. 修改 `AgentComposer`：根据当前模型能力传入禁用状态，处理拒绝提示。
6. 修改普通 prompt 发送：发送 `submittedPrompt.markdown`。
7. 修改普通 prompt 发送：支持 image file parts。
8. 添加发送层保底：非视觉模型移除图片编码并加入错误说明。
9. 同步 slash command 图片 part 的能力判断。
10. 补充 i18n 文案。
11. 运行编辑器诊断。
12. 运行 `cd app && npm run build`。

## 验收标准

### 完整 payload

- 发送包含 test log、资源链接、MLC 引用、web 附件的普通 prompt 后，OpenCode 能在上下文中看到这些 markdown 区块。
- 用户气泡仍只显示纯 prompt。
- 完整信息按钮显示的内容与实际发送文本一致，除非发送层因模型能力过滤图片。

### 图片能力控制

- 当前模型 `capabilities.input.image === true` 时：
  - 显示图片按钮。
  - 允许粘贴图片。
  - 允许拖拽图片。
  - 发送时带 image file parts。
- 当前模型 `capabilities.input.image !== true` 时：
  - 隐藏图片按钮。
  - 粘贴图片不会加入 composer。
  - 拖拽图片不会加入 composer。
  - 发送时不包含 image file parts，不包含 base64 编码。
  - prompt 中出现错误说明，告知模型图片已移除。

### 回归

- 无 TypeScript 编译错误。
- `npm run build` 通过。
- `ref-repos/` 无修改、无暂存、无提交。

## 风险与注意事项

1. OpenCode 模型能力可能来自 models.dev 缓存，个别模型字段不完整。策略上 unknown 按不支持图片处理。
2. `capabilities.attachment` 与 `capabilities.input.image` 语义不同，图片能力应以 `input.image` 为准。
3. 图片 data URL 可能较大，非视觉模型保底必须确保不把 base64 放入 prompt markdown。
4. 如果用户在视觉模型下添加图片后切换到非视觉模型，不能让图片悄悄发送出去。
5. 用户气泡显示逻辑不能回退到显示完整 markdown，否则会重新出现 `User Prompt` 大标题污染。
6. slash command 和普通 prompt 不能出现图片能力行为不一致。

## 当前决策建议

建议采用“分步但一次提交内完成”的实现方式：

1. 先修数据与发送层，确保模型实际收到完整 payload。
2. 再修 UI 图片入口控制。
3. 最后加发送层图片过滤保底。

这样可以保持每一步都可验证，同时最终交付是完整行为。