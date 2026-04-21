/* MLFB 手机骨架 · 假数据（后续替换为 HTTP/WS 真实来源） */
(function () {
  const now = Date.now();
  const m = (n) => now - n * 60 * 1000;

  window.MOCK = {
    paired: true, // 切为 false 可直接预览配对屏

    device: {
      host: 'my-pc.tailnet-abc.ts.net',
      device_name: 'MLFB on My-PC',
    },

    callers: [
      { id: 'c1', name: 'VSCode · Copilot', color: '#1f2329', sessions: 3 },
      { id: 'c2', name: 'Cursor · Claude', color: '#1f2329', sessions: 1 },
    ],

    sessions: [
      {
        id: 's001',
        caller_id: 'c1',
        caller_name: 'VSCode · Copilot',
        request_name: '修复登录接口 401 问题',
        summary:
          '## 需要你确认 API 契约\n' +
          '登录接口返回 401 时，后端目前返回：\n\n' +
          '```json\n' +
          '{ "error": "unauthorized" }\n' +
          '```\n\n' +
          '前端期望结构为：\n\n' +
          '```json\n' +
          '{ "code": 401, "message": "..." }\n' +
          '```\n\n' +
          '请选择统一契约方向。',
        status: 'pending',
        unread: true,
        created_at: m(2),
        questions: [
          {
            label: '契约方向',
            options: ['保持后端 error 风格', '改为 code+message', '两者都支持'],
            selected: null,
          },
          { label: '额外备注' },
        ],
        images: [],
      },
      {
        id: 's002',
        caller_id: 'c1',
        caller_name: 'VSCode · Copilot',
        request_name: '重构 feedbackStore 的幂等逻辑',
        summary:
          '当前 `addSession` 已经幂等化，但 `updateSession` 仍可能触发重复渲染。\n\n' +
          '建议引入浅比较，确认该优化方向。',
        status: 'responded',
        unread: false,
        created_at: m(32),
        questions: [
          { label: '是否采用浅比较', options: ['采用', '不采用'], selected: '采用' },
        ],
        images: [],
      },
      {
        id: 's003',
        caller_id: 'c1',
        caller_name: 'VSCode · Copilot',
        request_name: '确认 UI 改造颜色方向',
        summary:
          '手机端 App 的强调色是否使用品牌蓝 `#3b82f6`？\n\n' +
          '参考截图见附件。',
        status: 'pending',
        unread: true,
        created_at: m(8),
        questions: [
          {
            label: '强调色',
            options: ['纯黑白', '蓝色', '紫色', '跟随系统'],
            selected: null,
          },
        ],
        images: [
          { id: 'i1', thumb_url: '', full_url: '' },
          { id: 'i2', thumb_url: '', full_url: '' },
        ],
      },
      {
        id: 's004',
        caller_id: 'c2',
        caller_name: 'Cursor · Claude',
        request_name: '数据库 schema 迁移策略',
        summary:
          '当前 schema 需要增加 `devices` 表，用于多设备配对管理。\n\n' +
          '- 是否需要软删除字段？\n' +
          '- 设备上限设多少？',
        status: 'pending',
        unread: false,
        created_at: m(120),
        questions: [
          { label: '软删除', options: ['需要', '不需要'], selected: null },
          { label: '设备上限', options: ['3', '5', '无限'], selected: null },
        ],
        images: [],
      },
    ],
  };
})();
