/* MLFB Remote · 手机骨架 · 单文件迷你 SPA
   - 视图：PairScreen / SessionList / SessionDetail / Settings
   - 路由：window.app.route = 'list' | 'detail' | 'pair' | 'settings'
   - 后续接入真实 transport 时，仅需把 MOCK 读取替换为 fetch/WS 调用
*/

(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (tag, attrs, children) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function')
          el.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] === false || attrs[k] == null) continue;
        else el.setAttribute(k, attrs[k]);
      }
    }
    if (children != null) {
      if (Array.isArray(children))
        children.forEach((c) => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
      else if (typeof children === 'string') el.textContent = children;
      else el.appendChild(children);
    }
    return el;
  };

  const fmtTime = (ts) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + 'm ago';
    const hr = Math.floor(m / 60);
    if (hr < 24) return hr + 'h ago';
    const d = Math.floor(hr / 24);
    return d + 'd ago';
  };

  // 极简 markdown（只处理 ## 标题、```code block```、`inline`、列表、换行）
  const mdToHtml = (md) => {
    if (!md) return '';
    const escape = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 1) code blocks
    const blocks = [];
    md = md.replace(/```([\s\S]*?)```/g, (_, code) => {
      blocks.push(code);
      return '@@BLOCK' + (blocks.length - 1) + '@@';
    });
    md = escape(md);
    md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
    md = md.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    md = md.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    md = md.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    md = md.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    md = md.replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>');
    md = md.replace(/\n\n+/g, '</p><p>');
    md = '<p>' + md + '</p>';
    md = md.replace(/<p>(<h[123]>)/g, '$1').replace(/(<\/h[123]>)<\/p>/g, '$1');
    md = md.replace(/<p>(<ul>)/g, '$1').replace(/(<\/ul>)<\/p>/g, '$1');
    md = md.replace(/@@BLOCK(\d+)@@/g, (_, i) => '<pre>' + escape(blocks[+i]) + '</pre>');
    return md;
  };

  // ------------ 状态 ------------
  const state = {
    route: 'list', // list | detail | settings | pair
    filter: 'pending', // pending | responded | all
    activeCallerId: null, // null = all callers
    currentSessionId: null,
    pendingAnswers: {}, // { sessionId: { q0: selected, q1: text, ... } }
  };

  // ------------ 数据访问（当前走 MOCK） ------------
  const api = {
    listCallers() {
      return window.MOCK.callers;
    },
    listSessions() {
      let list = window.MOCK.sessions.slice();
      if (state.activeCallerId) list = list.filter((s) => s.caller_id === state.activeCallerId);
      if (state.filter !== 'all') list = list.filter((s) => s.status === state.filter);
      list.sort((a, b) => b.created_at - a.created_at);
      return list;
    },
    getSession(id) {
      return window.MOCK.sessions.find((s) => s.id === id);
    },
    submitFeedback(id, answers) {
      const s = this.getSession(id);
      if (s) {
        s.status = 'responded';
        s.unread = false;
        s.answers = answers;
      }
    },
    unreadCount() {
      return window.MOCK.sessions.filter((s) => s.unread && s.status === 'pending').length;
    },
  };

  // ------------ Modal ------------
  const modal = {
    open(msg, onOk) {
      $('#modalMsg').textContent = msg;
      const el = $('#modal');
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('open'));
      const ok = $('#modalOk'),
        cancel = $('#modalCancel');
      const close = () => {
        el.classList.remove('open');
        setTimeout(() => (el.hidden = true), 200);
      };
      ok.onclick = () => {
        close();
        onOk && onOk();
      };
      cancel.onclick = close;
    },
  };

  // ------------ 渲染：顶栏 ------------
  function renderTopbar(opts) {
    const { back, title, subtitle, right } = opts || {};
    return h('div', { class: 'topbar' }, [
      back
        ? h('button', { class: 'tb-btn', onclick: back }, '‹')
        : h('button', { class: 'tb-btn', onclick: () => (state.route = 'settings', render()) }, '☰'),
      h('div', { class: 'tb-title' }, [
        h('div', { class: 't1' }, title || ''),
        subtitle ? h('div', { class: 't2' }, subtitle) : null,
      ]),
      h('div', { class: 'tb-right' }, right || []),
    ]);
  }

  // ------------ 视图：Session List ------------
  function viewList() {
    const wrap = h('div');
    const unread = api.unreadCount();
    wrap.appendChild(
      renderTopbar({
        title: 'MLFB Remote',
        subtitle: unread ? `${unread} 条待处理` : '已全部处理',
        right: [h('button', { class: 'tb-btn', title: '设置', onclick: () => (state.route = 'settings', render()) }, '⚙')],
      })
    );

    const scroll = h('div', { class: 'scroll no-bottom' });

    // Caller 切换（药丸）
    const callers = api.listCallers();
    const callerBar = h('div', { class: 'section' }, [
      h(
        'div',
        { class: 'segment', style: 'flex-wrap:wrap; width:100%; justify-content:flex-start;' },
        [
          h(
            'button',
            {
              class: 'pill' + (state.activeCallerId == null ? ' active' : ''),
              onclick: () => {
                state.activeCallerId = null;
                render();
              },
            },
            'All callers'
          ),
        ].concat(
          callers.map((c) =>
            h(
              'button',
              {
                class: 'pill' + (state.activeCallerId === c.id ? ' active' : ''),
                onclick: () => {
                  state.activeCallerId = c.id;
                  render();
                },
              },
              c.name
            )
          )
        )
      ),
    ]);
    scroll.appendChild(callerBar);

    // 状态筛选（药丸）
    const filters = [
      { id: 'pending', label: 'Pending' },
      { id: 'responded', label: 'Responded' },
      { id: 'all', label: 'All' },
    ];
    const filterBar = h('div', { class: 'section' }, [
      h(
        'div',
        { class: 'segment' },
        filters.map((f) =>
          h(
            'button',
            {
              class: 'pill' + (state.filter === f.id ? ' active' : ''),
              onclick: () => {
                state.filter = f.id;
                render();
              },
            },
            f.label
          )
        )
      ),
    ]);
    scroll.appendChild(filterBar);

    // 列表
    const sessions = api.listSessions();
    const listTitle = h('div', { class: 'section' }, [
      h('div', { class: 'section-title inline' }, [
        h('span', null, 'Sessions'),
        h('span', null, sessions.length + ' 条'),
      ]),
    ]);
    scroll.appendChild(listTitle);

    const listEl = h('div', { class: 'session-list' });
    if (sessions.length === 0) {
      listEl.appendChild(h('div', { class: 'empty' }, '暂无会话'));
    } else {
      sessions.forEach((s) => {
        const item = h(
          'div',
          {
            class: 'session-item ' + s.status + (s.unread ? ' unread' : ''),
            onclick: () => {
              s.unread = false;
              state.currentSessionId = s.id;
              state.route = 'detail';
              render();
            },
          },
          [
            h('div', { class: 'session-dot' }),
            h('div', { class: 'session-body' }, [
              h('div', { class: 'session-title' }, s.request_name),
              h(
                'div',
                { class: 'session-summary' },
                s.summary.replace(/[#`*>]/g, '').slice(0, 100)
              ),
              h('div', { class: 'session-meta' }, [
                h('span', null, s.caller_name),
                h('span', null, '·'),
                h('span', null, fmtTime(s.created_at)),
                h('span', { class: 'status-tag' }, s.status),
              ]),
            ]),
          ]
        );
        listEl.appendChild(item);
      });
    }
    scroll.appendChild(listEl);

    wrap.appendChild(scroll);
    return wrap;
  }

  // ------------ 视图：Session Detail ------------
  function viewDetail() {
    const s = api.getSession(state.currentSessionId);
    if (!s) {
      state.route = 'list';
      return viewList();
    }
    if (!state.pendingAnswers[s.id]) {
      state.pendingAnswers[s.id] = {};
      (s.questions || []).forEach((q, i) => {
        if (q.selected != null) state.pendingAnswers[s.id]['q' + i] = q.selected;
      });
    }
    const answers = state.pendingAnswers[s.id];
    const readonly = s.status !== 'pending';

    const wrap = h('div');
    wrap.appendChild(
      renderTopbar({
        back: () => {
          state.route = 'list';
          render();
        },
        title: s.request_name,
        subtitle: s.caller_name + ' · ' + fmtTime(s.created_at),
        right: [
          !readonly
            ? h(
                'button',
                {
                  class: 'tb-btn',
                  title: '取消会话',
                  onclick: () =>
                    modal.open('确定取消这个 session 吗？Agent 将收到 cancelled。', () => {
                      s.status = 'cancelled';
                      state.route = 'list';
                      render();
                    }),
                },
                '✕'
              )
            : null,
        ],
      })
    );

    const scroll = h('div', { class: 'scroll' });

    // Caller 信息
    scroll.appendChild(
      h('div', { class: 'detail-caller' }, [
        h('span', null, '◆ ' + s.caller_name),
        h('span', { style: 'margin-left:auto; color:var(--muted);' }, s.status),
      ])
    );

    // Summary (markdown)
    scroll.appendChild(
      h('div', {
        class: 'detail-summary',
        html: mdToHtml(s.summary || ''),
      })
    );

    // Questions
    (s.questions || []).forEach((q, i) => {
      const qEl = h('div', { class: 'q-group' });
      qEl.appendChild(h('div', { class: 'q-label' }, q.label));

      if (q.options && q.options.length) {
        const opts = h('div', { class: 'q-options' });
        q.options.forEach((opt) => {
          const active = answers['q' + i] === opt;
          const btn = h(
            'button',
            {
              class: 'pill' + (active ? ' selected' : ''),
              onclick: readonly
                ? null
                : () => {
                    answers['q' + i] = opt;
                    render();
                  },
              disabled: readonly,
            },
            opt
          );
          opts.appendChild(btn);
        });
        qEl.appendChild(opts);
      } else {
        const ta = h('textarea', {
          class: 'q-textarea',
          placeholder: readonly ? '（无回答）' : '输入你的回答…',
          disabled: readonly,
          oninput: (e) => {
            answers['q' + i] = e.target.value;
          },
        });
        ta.value = answers['q' + i] || '';
        qEl.appendChild(ta);
      }
      scroll.appendChild(qEl);
    });

    // 通用文字反馈
    if (!readonly) {
      const reply = h('div', { class: 'reply-box' }, [
        h('div', { class: 'section-title' }, '补充反馈（可选）'),
        (() => {
          const ta = h('textarea', {
            class: 'q-textarea',
            placeholder: '其他想说的…',
            oninput: (e) => {
              answers.__text = e.target.value;
            },
          });
          ta.value = answers.__text || '';
          return ta;
        })(),
      ]);
      scroll.appendChild(reply);
    }

    // 图片附件
    if (s.images && s.images.length) {
      scroll.appendChild(
        h('div', { class: 'section-title', style: 'padding:14px 16px 6px; border-top:1px solid var(--border);' }, '附件')
      );
      const grid = h('div', { class: 'img-grid' });
      s.images.forEach(() => grid.appendChild(h('img', { src: 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23e5e7eb%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%238a8f99%22>image</text></svg>' })));
      scroll.appendChild(grid);
    }

    wrap.appendChild(scroll);

    // Bottom bar
    if (!readonly) {
      const bottom = h('div', { class: 'bottombar' }, [
        h(
          'button',
          {
            class: 'btn-ghost btn-cancel',
            onclick: () => {
              state.route = 'list';
              render();
            },
          },
          '返回'
        ),
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: () => {
              modal.open('提交反馈给 Agent？', () => {
                api.submitFeedback(s.id, answers);
                state.route = 'list';
                render();
              });
            },
          },
          '提交反馈'
        ),
      ]);
      wrap.appendChild(bottom);
    }

    return wrap;
  }

  // ------------ 视图：设置 ------------
  function viewSettings() {
    const wrap = h('div');
    wrap.appendChild(
      renderTopbar({
        back: () => {
          state.route = 'list';
          render();
        },
        title: '设置',
      })
    );
    const scroll = h('div', { class: 'scroll no-bottom' });

    // 已配对设备
    scroll.appendChild(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-title' }, '已配对设备'),
        h('div', { style: 'font-size:14px; font-weight:600;' }, window.MOCK.device.device_name),
        h('div', { style: 'font-size:12px; color:var(--muted); margin-top:2px;' }, window.MOCK.device.host),
        h('div', { style: 'margin-top:12px; display:flex; gap:8px;' }, [
          h('button', { class: 'btn-ghost' }, '测试推送'),
          h(
            'button',
            {
              class: 'btn-danger',
              onclick: () =>
                modal.open('确定解除配对？解绑后手机将无法再接收此 PC 的推送。', () => {
                  window.MOCK.paired = false;
                  state.route = 'pair';
                  render();
                }),
            },
            '解除配对'
          ),
        ]),
      ])
    );

    // 主题
    scroll.appendChild(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-title' }, '主题'),
        h(
          'div',
          { class: 'segment' },
          ['system', 'light', 'dark'].map((t) =>
            h(
              'button',
              {
                class: 'pill' + ((localStorage.getItem('theme') || 'system') === t ? ' active' : ''),
                onclick: () => setTheme(t),
              },
              t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'
            )
          )
        ),
      ])
    );

    // 字号
    scroll.appendChild(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-title' }, '字号'),
        h(
          'div',
          { class: 'segment' },
          ['small', 'medium', 'large'].map((fs) =>
            h(
              'button',
              {
                class: 'pill' + ((localStorage.getItem('fs') || 'medium') === fs ? ' active' : ''),
                onclick: () => setFontSize(fs),
              },
              fs === 'small' ? '小' : fs === 'medium' ? '中' : '大'
            )
          )
        ),
      ])
    );

    // 关于
    scroll.appendChild(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-title' }, '关于'),
        h('div', { style: 'font-size:13px; color:var(--muted); line-height:1.7;' }, [
          'MLFB Remote · Preview v0.1',
          h('br'),
          '基于 My Last Feedback 的手机远程端，用于接收和回复 Agent 反馈请求。',
        ]),
      ])
    );

    wrap.appendChild(scroll);
    return wrap;
  }

  // ------------ 视图：配对屏 ------------
  function viewPair() {
    return h('div', { class: 'pair' }, [
      h('div', { class: 'pair-brand' }, [
        h('div', { class: 'pair-logo' }, 'M'),
        h('h1', { class: 'pair-title' }, 'MLFB Remote'),
        h(
          'div',
          { class: 'pair-sub' },
          '连接到你电脑上的 MLFB，远程查看和回复 Agent 反馈请求。'
        ),
      ]),
      h('div', { class: 'pair-actions' }, [
        h(
          'button',
          {
            class: 'btn-primary btn-block',
            onclick: () =>
              modal.open('此处将调起相机扫描 PC 上显示的配对二维码。', () => {
                window.MOCK.paired = true;
                state.route = 'list';
                render();
              }),
          },
          '扫描二维码配对'
        ),
        h(
          'button',
          {
            class: 'btn-ghost btn-block',
            onclick: () =>
              modal.open('此处将弹出 6 位配对码输入。', () => {
                window.MOCK.paired = true;
                state.route = 'list';
                render();
              }),
          },
          '输入配对码'
        ),
      ]),
      h(
        'div',
        { class: 'pair-footer' },
        '首次使用？请先确保 PC 已启动 MLFB 并在同一 Tailscale 网络内。'
      ),
    ]);
  }

  // ------------ 主题/字号 ------------
  function setTheme(t) {
    localStorage.setItem('theme', t);
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const isDark =
      t === 'dark' ||
      (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    try {
      window.DJIBridge && window.DJIBridge.setTheme && window.DJIBridge.setTheme(isDark ? 'dark' : 'light');
    } catch (e) {}
    try {
      window.DJIBridge && window.DJIBridge.hideToolbar && window.DJIBridge.hideToolbar();
    } catch (e) {}
    render();
  }
  function setFontSize(fs) {
    localStorage.setItem('fs', fs);
    document.documentElement.setAttribute('data-fs', fs);
    render();
  }
  function initThemeFs() {
    const t = localStorage.getItem('theme') || 'system';
    if (t !== 'system') document.documentElement.setAttribute('data-theme', t);
    const fs = localStorage.getItem('fs') || 'medium';
    document.documentElement.setAttribute('data-fs', fs);
  }

  // ------------ 路由 / 渲染 ------------
  function render() {
    const root = $('#app');
    root.innerHTML = '';
    let view;
    if (!window.MOCK.paired) view = viewPair();
    else if (state.route === 'detail') view = viewDetail();
    else if (state.route === 'settings') view = viewSettings();
    else view = viewList();
    root.appendChild(view);
  }

  // 原生返回键回调（MainActivity.kt 会调用 app.onBack()）
  window.app = {
    onBack() {
      if (state.route === 'detail' || state.route === 'settings') {
        state.route = 'list';
        render();
        return;
      }
      try {
        window.DJIBridge && window.DJIBridge.exitApp && window.DJIBridge.exitApp();
      } catch (e) {}
    },
  };

  // 初始化
  initThemeFs();
  try {
    window.DJIBridge && window.DJIBridge.hideToolbar && window.DJIBridge.hideToolbar();
  } catch (e) {}
  render();
})();
