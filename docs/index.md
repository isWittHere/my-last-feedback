---
layout: home

hero:
  name: "My Last Feedback"
  text: "Developer Companion for AI Workflows"
  tagline: Interactive feedback, integrated dev tools, and knowledge management — all in a single desktop app that works with your AI coding agent.
  image:
    src: /images/MLFB_theme_light.png
    alt: My Last Feedback Screenshot
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/anthropics/my-last-feedback

features:
  - icon: 🎯
    title: Interactive Feedback
    details: Native desktop popup when your AI agent requests feedback. Supports Markdown rendering, image attachments, and structured questions.
  - icon: 🛠️
    title: Built-in Dev Tools
    details: Full PTY terminal, Git panel, preview browser, and project resource explorer — all integrated in one place.
  - icon: 📚
    title: Knowledge Management
    details: My Last Chat side panel for browsing, searching, and previewing Markdown documents. Keep your knowledge base at your fingertips.
  - icon: 🤖
    title: Multi-Agent Support
    details: Works with Cursor, VS Code Copilot, Cline, Windsurf, Codex, and any AI tool supporting the Model Context Protocol.
  - icon: 🎨
    title: Dual Theme & Bilingual
    details: Full dark and light theme support with complete English and Chinese interfaces.
  - icon: ⚡
    title: Lightweight & Fast
    details: Built with Tauri 2.0 + React 19 — binary is only ~11 MB. Starts instantly, runs smoothly.
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
</style>