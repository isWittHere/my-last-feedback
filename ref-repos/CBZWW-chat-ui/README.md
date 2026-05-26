# CBZWW Chat UI Reference

This directory contains selected Agent UI reference files copied from:

```text
E:\Dev\CBZWW_all\CBZWW_web\frontend-v2
```

The files are preserved for MLFB Agent Console design reference. They are not wired into the MLFB build.

## Key Files

```text
src/pages/Chat.tsx
src/store/chatStore.ts
src/lib/sseClient.ts
src/components/zeven/composition/ChatMessage.tsx
src/components/zeven/composition/chat/ProcessGroup.tsx
src/components/zeven/composition/chat/MarkdownBlock.tsx
src/components/zeven/composition/chat/StreamingIndicator.tsx
src/components/zeven/composition/chat/ChatInput.tsx
src/components/zeven/composition/chat/ChatTaskPanel.tsx
src/components/zeven/composition/chat/ChatOutlineList.tsx
src/components/zeven/dotmatrix/presets.ts
```

## What To Study

- ContentBlock event model.
- Process/result split in assistant messages.
- ProcessGroup timeline/tab display modes.
- Streaming Markdown settled/active dual-zone renderer.
- rAF character release in chatStore.
- Phase-aware streaming indicator.
- Sticky user prompt and generated outline behavior.

See also:

```text
.myLastChat/MLC_CBZWW Chat UI参考迁移规划.md
```