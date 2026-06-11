---
layout: home

hero:
  name: "My Last Feedback"
  text: "Developer Companion for AI Workflows"
  tagline: Interactive feedback, integrated dev tools, and knowledge management — all in a single desktop app that works with your AI coding agent.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/isWittHere/my-last-feedback

features:
  - title: Interactive Feedback
    details: Native desktop popup when your AI agent requests feedback. Supports Markdown rendering, image attachments, and structured questions.
  - title: Built-in Dev Tools
    details: Full PTY terminal, Git panel, preview browser, and project resource explorer — all integrated in one place.
  - title: Knowledge Management
    details: My Last Chat side panel for browsing, searching, and previewing Markdown documents. Keep your knowledge base at your fingertips.
  - title: Multi-Agent Support
    details: Works with Cursor, VS Code Copilot, Cline, Windsurf, Codex, and any AI tool supporting the Model Context Protocol.
  - title: Dual Theme & Bilingual
    details: Full dark and light theme support with complete English and Chinese interfaces.
  - title: Lightweight & Fast
    details: Built with Tauri 2.0 + React 19 — binary is only ~11 MB. Starts instantly, runs smoothly.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #bd34fe 30%, #41d1ff);
}

.VPHero .text {
  font-size: 20px !important;
  font-weight: 400 !important;
}

.VPHero .main {
  max-width: 100% !important;
  text-align: center !important;
}

.VPHero .actions {
  justify-content: center !important;
}

.VPFeature {
  transition: transform 0.2s;
}

.VPFeature:hover {
  transform: translateY(-2px);
}
</style>