---
layout: home

hero:
  name: "My Last Feedback"
  text: "AI 辅助开发流程的开发者伴侣"
  tagline: 集成交互式反馈、开发工具面板和知识管理于一体，通过一个桌面应用连接你的 AI 编程 Agent。
  image:
    src: /images/MLFB_theme_light.png
    alt: My Last Feedback 截图
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/quick-start
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/isWittHere/my-last-feedback

features:
  - icon:
      src: /icons/chat-circle.svg
    title: 交互式反馈
    details: AI Agent 请求反馈时弹出原生桌面窗口。支持 Markdown 渲染、图片附件和结构化问题。
  - icon:
      src: /icons/wrench.svg
    title: 内置开发工具
    details: 完整 PTY 终端、Git 面板、预览浏览器和项目资源浏览器 — 全部集成在一个地方。
  - icon:
      src: /icons/book-open.svg
    title: 知识管理
    details: My Last Chat 侧栏面板，用于浏览、搜索和预览 Markdown 文档。让知识库触手可及。
  - icon:
      src: /icons/robot.svg
    title: 多 Agent 支持
    details: 支持 Cursor、VS Code Copilot、Cline、Windsurf、Codex 等所有支持 MCP 协议的 AI 开发工具。
  - icon:
      src: /icons/palette.svg
    title: 双主题 & 双语
    details: 完整的暗色/亮色主题支持，以及完整的中文和英文界面。
  - icon:
      src: /icons/lightning.svg
    title: 轻量快速
    details: 基于 Tauri 2.0 + React 19 构建 — 二进制仅 ~11 MB。瞬间启动，流畅运行。
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #bd34fe 30%, #41d1ff);
}

.VPFeature {
  transition: transform 0.2s;
}

.VPFeature:hover {
  transform: translateY(-2px);
}

/* Phosphor Icons styling */
.VPFeature .icon img {
  width: 24px;
  height: 24px;
  filter: brightness(0) invert(1);
}

.dark .VPFeature .icon img {
  filter: brightness(0) invert(1);
}

.VPFeature .icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
}
</style>