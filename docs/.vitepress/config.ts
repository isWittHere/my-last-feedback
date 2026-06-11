import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'My Last Feedback',
  description: 'A developer companion GUI for AI-assisted workflows',
  base: '/my-last-feedback/',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/my-last-feedback/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#1e1e2e' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'My Last Feedback | Developer Companion for AI Workflows' }],
    ['meta', { property: 'og:site_name', content: 'My Last Feedback' }],
    ['meta', { property: 'og:image', content: '/my-last-feedback/images/MLFB_theme_light.png' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/introduction' },
          { text: 'Development', link: '/development/setup' },
          { text: 'API', link: '/api/mcp' },
          { text: 'Releases', link: '/releases/changelog' }
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Introduction', link: '/guide/introduction' },
                { text: 'Features', link: '/guide/features' },
                { text: 'Installation', link: '/guide/installation' },
                { text: 'Quick Start', link: '/guide/quick-start' }
              ]
            }
          ],
          '/development/': [
            {
              text: 'Development',
              items: [
                { text: 'Setup', link: '/development/setup' },
                { text: 'Architecture', link: '/development/architecture' },
                { text: 'Contributing', link: '/development/contributing' },
                { text: 'Build Guide', link: '/development/build' }
              ]
            }
          ],
          '/api/': [
            {
              text: 'API Reference',
              items: [
                { text: 'MCP Protocol', link: '/api/mcp' },
                { text: 'Tauri Commands', link: '/api/tauri-commands' },
                { text: 'IPC Communication', link: '/api/ipc' }
              ]
            }
          ],
          '/releases/': [
            {
              text: 'Releases',
              items: [
                { text: 'Changelog', link: '/releases/changelog' },
                { text: 'v0.3.0', link: '/releases/v0.3.0' }
              ]
            }
          ]
        }
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/introduction' },
          { text: '开发', link: '/zh/development/setup' },
          { text: 'API', link: '/zh/api/mcp' },
          { text: '发布', link: '/zh/releases/changelog' }
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '指南',
              items: [
                { text: '介绍', link: '/zh/guide/introduction' },
                { text: '功能特性', link: '/zh/guide/features' },
                { text: '安装', link: '/zh/guide/installation' },
                { text: '快速开始', link: '/zh/guide/quick-start' }
              ]
            }
          ],
          '/zh/development/': [
            {
              text: '开发',
              items: [
                { text: '环境设置', link: '/zh/development/setup' },
                { text: '项目架构', link: '/zh/development/architecture' },
                { text: '贡献指南', link: '/zh/development/contributing' },
                { text: '构建指南', link: '/zh/development/build' }
              ]
            }
          ],
          '/zh/api/': [
            {
              text: 'API 参考',
              items: [
                { text: 'MCP 协议', link: '/zh/api/mcp' },
                { text: 'Tauri 命令', link: '/zh/api/tauri-commands' },
                { text: 'IPC 通信', link: '/zh/api/ipc' }
              ]
            }
          ],
          '/zh/releases/': [
            {
              text: '发布',
              items: [
                { text: '更新日志', link: '/zh/releases/changelog' },
                { text: 'v0.3.0', link: '/zh/releases/v0.3.0' }
              ]
            }
          ]
        }
      }
    }
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'My Last Feedback',
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/isWittHere/my-last-feedback' }
    ],
    
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present My Last Feedback'
    },
    
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换'
                }
              }
            }
          }
        }
      }
    }
  }
})