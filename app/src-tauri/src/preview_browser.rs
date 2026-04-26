use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Webview, WebviewBuilder, WebviewUrl};
use tauri::{LogicalPosition, LogicalSize, Rect};
use uuid::Uuid;

pub struct PreviewBrowserState {
    tabs: Mutex<HashMap<String, PreviewTabRuntime>>,
}

impl Default for PreviewBrowserState {
    fn default() -> Self {
        Self { tabs: Mutex::new(HashMap::new()) }
    }
}

struct PreviewTabRuntime {
    webview: Webview,
    token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTabPayload {
    pub id: String,
    pub webview_label: String,
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PreviewBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn normalize_preview_url(input: Option<String>) -> Result<tauri::Url, String> {
    let raw = input.unwrap_or_default();
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "about:blank" {
        return "about:blank".parse::<tauri::Url>().map_err(|e| e.to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.starts_with("localhost")
        || trimmed.starts_with("127.")
        || trimmed.starts_with("0.0.0.0")
        || trimmed.starts_with("[::1]")
    {
        format!("http://{}", trimmed)
    } else {
        format!("https://{}", trimmed)
    };

    let url: tauri::Url = candidate.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("Only http and https URLs are allowed".to_string()),
    }
}

fn bridge_emit(app: &AppHandle, tab_id: &str, token: &str, expected_token: &str, kind: &str, payload: &str) {
    if token != expected_token || payload.len() > 128 * 1024 {
        return;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else { return; };
    let event = match kind {
        "console-entry" => "preview-console-entry",
        "element-picked" => "preview-element-picked",
      "picker-ready" => "preview-picker-ready",
        "picker-cancelled" => "preview-picker-cancelled",
        _ => return,
    };
    let wrapped = if kind == "console-entry" {
        serde_json::json!({ "tabId": tab_id, "entry": value })
    } else if kind == "element-picked" {
        serde_json::json!({ "tabId": tab_id, "element": value })
    } else {
        serde_json::json!({ "tabId": tab_id })
    };
    let _ = app.emit(event, wrapped);
}

fn console_capture_script(tab_id: &str, token: &str) -> String {
    let tab_json = serde_json::to_string(tab_id).unwrap_or_else(|_| "\"\"".to_string());
    let token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string());
    CONSOLE_CAPTURE_SCRIPT
        .replace("__MLFB_TAB_ID__", &tab_json)
        .replace("__MLFB_TOKEN__", &token_json)
}

const CONSOLE_CAPTURE_SCRIPT: &str = r#"
(function () {
  if (window.__MLFB_CONSOLE_CAPTURED__) return;
  window.__MLFB_CONSOLE_CAPTURED__ = true;
  var tabId = __MLFB_TAB_ID__;
  var token = __MLFB_TOKEN__;
  var queue = [];
  var flushing = false;
  function flush() {
    if (queue.length === 0) { flushing = false; return; }
    flushing = true;
    var url = queue.shift();
    try {
      window.location.href = url;
    } catch (_) {
      try {
        var root = document.documentElement || document.body;
        if (!root) return;
        var frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.src = url;
        root.appendChild(frame);
        setTimeout(function () { try { frame.remove(); } catch (_) {} }, 1000);
      } catch (_) {}
    }
    setTimeout(flush, 30);
  }
  function send(kind, payload) {
    try {
      var json = encodeURIComponent(JSON.stringify(payload));
      var url = 'mlfb-preview://event?tabId=' + encodeURIComponent(tabId) + '&token=' + encodeURIComponent(token) + '&kind=' + encodeURIComponent(kind) + '&payload=' + json;
      queue.push(url);
      if (!flushing) setTimeout(flush, 0);
    } catch (_) {}
  }
  function short(value, max) {
    var text = String(value == null ? '' : value);
    return text.length > max ? text.slice(0, max) + '...' : text;
  }
  function safe(value, seen) {
    try {
      if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return short(value, 4096);
      if (value instanceof Error) return short(value.name + ': ' + value.message + (value.stack ? '\n' + value.stack : ''), 4096);
      if (typeof Element !== 'undefined' && value instanceof Element) return short('<' + value.tagName.toLowerCase() + (value.id ? '#' + value.id : '') + (value.className ? '.' + String(value.className).trim().replace(/\s+/g, '.') : '') + '>', 1000);
      seen = seen || [];
      if (seen.indexOf(value) >= 0) return '[Circular]';
      seen.push(value);
      return short(JSON.stringify(value, function (key, inner) {
        if (typeof inner === 'object' && inner !== null) {
          if (seen.indexOf(inner) >= 0) return '[Circular]';
          seen.push(inner);
        }
        if (typeof inner === 'function') return '[Function]';
        return inner;
      }), 4096);
    } catch (err) {
      return short(value, 4096);
    }
  }
  function emit(level, args, extra) {
    var items = Array.prototype.slice.call(args || []).map(function (item) { return safe(item); });
    send('console-entry', Object.assign({
      id: 'console-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      level: level,
      message: short(items.join(' '), 4096),
      args: items,
      sourceUrl: location.href,
      timestamp: new Date().toISOString()
    }, extra || {}));
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try { emit(level, arguments); } catch (_) {}
      return original && original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (event) {
    emit('error', [event.message || 'Uncaught error'], { sourceUrl: event.filename || location.href, line: event.lineno, column: event.colno, stack: event.error && event.error.stack });
  });
  window.addEventListener('unhandledrejection', function (event) {
    emit('error', ['Unhandled promise rejection', event.reason]);
  });
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var request = arguments[0];
      var requestUrl = request && request.url ? request.url : String(request || '');
      return originalFetch.apply(this, arguments).then(function (response) {
        if (!response.ok) emit(response.status >= 500 ? 'error' : 'warn', ['fetch', response.status, response.statusText, requestUrl], { sourceUrl: requestUrl });
        return response;
      }).catch(function (error) {
        emit('error', ['fetch failed', requestUrl, error], { sourceUrl: requestUrl, stack: error && error.stack });
        throw error;
      });
    };
  }
  if (window.XMLHttpRequest) {
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__MLFB_XHR_URL__ = url;
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('loadend', function () {
        if (this.status >= 400) emit(this.status >= 500 ? 'error' : 'warn', ['xhr', this.status, this.statusText, this.__MLFB_XHR_URL__], { sourceUrl: String(this.__MLFB_XHR_URL__ || location.href) });
      });
      this.addEventListener('error', function () {
        emit('error', ['xhr failed', this.__MLFB_XHR_URL__], { sourceUrl: String(this.__MLFB_XHR_URL__ || location.href) });
      });
      return originalSend.apply(this, arguments);
    };
  }
  window.__MLFB_PREVIEW_BRIDGE__ = { send: send };
})();
"#;

const PICKER_SCRIPT: &str = r#"
(function () {
  if (!window.__MLFB_PREVIEW_BRIDGE__) return;
  if (window.__MLFB_PICKER_CLEANUP__) window.__MLFB_PICKER_CLEANUP__();
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #22d3ee;background:rgba(34,211,238,.14);box-shadow:0 0 0 1px rgba(0,0,0,.25);display:none;';
  document.documentElement.appendChild(overlay);
  function textOf(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500); }
  function cssEscape(value) { try { return CSS.escape(value); } catch (_) { return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); } }
  function cssValue(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
  function isUnique(selector) { try { return document.querySelectorAll(selector).length === 1; } catch (_) { return false; } }
  function uniqueAttr(el, attr) {
    var value = el.getAttribute(attr);
    if (!value) return null;
    var selector = el.tagName.toLowerCase() + '[' + attr + '="' + cssValue(value) + '"]';
    return isUnique(selector) ? { selector: selector, type: attr } : null;
  }
  function impliedRole(el) {
    var tag = el.tagName;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (el.getAttribute('role')) return el.getAttribute('role');
    if (tag === 'A' && el.getAttribute('href')) return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    return '';
  }
  function accessibleName(el, text) {
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('value') || text;
  }
  function selectorFor(el) {
    if (el.id && isUnique('#' + cssEscape(el.id))) return { selector: '#' + cssEscape(el.id), type: 'id' };
    var attrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'placeholder'];
    for (var attrIndex = 0; attrIndex < attrs.length; attrIndex++) {
      var byAttr = uniqueAttr(el, attrs[attrIndex]);
      if (byAttr) return byAttr;
    }
    if (typeof el.className === 'string') {
      var classNames = el.className.split(/\s+/).filter(Boolean).filter(function (name) { return !/[0-9]{3,}/.test(name); }).slice(0, 3);
      if (classNames.length) {
        var classSelector = el.tagName.toLowerCase() + '.' + classNames.map(cssEscape).join('.');
        if (isUnique(classSelector)) return { selector: classSelector, type: 'class' };
      }
    }
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      if (node.id) { part += '#' + cssEscape(node.id); parts.unshift(part); break; }
      var index = 1;
      var sibling = node;
      while ((sibling = sibling.previousElementSibling)) if (sibling.tagName === node.tagName) index++;
      part += ':nth-of-type(' + index + ')';
      parts.unshift(part);
      node = node.parentElement;
    }
    return { selector: parts.join(' > '), type: 'nth' };
  }
  function quote(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function xpathFor(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1) {
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }
  function candidates(el, selector, text) {
    var list = [{ kind: 'css', value: selector, confidence: selector.indexOf(':nth-of-type') >= 0 ? 'medium' : 'high', reason: 'CSS selector' }];
    var testAttrs = ['data-testid', 'data-test', 'data-cy'];
    for (var index = 0; index < testAttrs.length; index++) {
      var testId = el.getAttribute(testAttrs[index]);
      if (testId) { list.unshift({ kind: 'testid', value: "page.getByTestId('" + quote(testId) + "')", confidence: 'high', reason: testAttrs[index] }); break; }
    }
    var role = impliedRole(el);
    var name = accessibleName(el, text);
    if (role && name) list.unshift({ kind: 'playwright-role', value: "page.getByRole('" + quote(role) + "', { name: '" + quote(name.slice(0, 80)) + "' })", confidence: 'high', reason: 'role and accessible name' });
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && name) list.unshift({ kind: 'playwright-label', value: "page.getByLabel('" + quote(name.slice(0, 80)) + "')", confidence: 'medium', reason: 'form label/name' });
    if (text) list.push({ kind: 'playwright-text', value: "page.getByText('" + quote(text.slice(0, 80)) + "')", confidence: 'medium', reason: 'visible text' });
    list.push({ kind: 'xpath', value: xpathFor(el), confidence: 'low', reason: 'DOM path fallback' });
    return list;
  }
  function buildPayload(el) {
    var selected = selectorFor(el);
    var text = textOf(el);
    var rect = el.getBoundingClientRect();
    return {
      sourceUrl: location.href,
      frameUrl: location.href,
      tagName: el.tagName,
      text: text,
      role: impliedRole(el) || undefined,
      ariaLabel: accessibleName(el, text) || undefined,
      title: el.getAttribute('title') || undefined,
      href: el.href || undefined,
      src: el.src || undefined,
      id: el.id || undefined,
      className: typeof el.className === 'string' ? el.className.slice(0, 300) : undefined,
      name: el.getAttribute('name') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      inputType: el.getAttribute('type') || undefined,
      selector: selected.selector,
      selectorType: selected.type,
      locatorCandidates: candidates(el, selected.selector, text),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      htmlSnippet: el.outerHTML ? el.outerHTML.slice(0, 1000) : undefined,
      capturedAt: new Date().toISOString()
    };
  }
  function move(event) {
    var el = event.target;
    if (!el || el === overlay || el === document.documentElement || el === document.body) return;
    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }
  function cleanup(sendCancel) {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', keydown, true);
    try { overlay.remove(); } catch (_) {}
    window.__MLFB_PICKER_CLEANUP__ = null;
    if (sendCancel) window.__MLFB_PREVIEW_BRIDGE__.send('picker-cancelled', {});
  }
  function click(event) {
    event.preventDefault();
    event.stopPropagation();
    var el = event.target;
    cleanup(false);
    window.__MLFB_PREVIEW_BRIDGE__.send('element-picked', buildPayload(el));
  }
  function keydown(event) {
    if (event.key === 'Escape') cleanup(true);
  }
  window.__MLFB_PICKER_CLEANUP__ = cleanup;
  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown, true);
  window.__MLFB_PREVIEW_BRIDGE__.send('picker-ready', {});
})();
"#;

#[tauri::command]
pub async fn preview_create_tab(
    app: AppHandle,
    state: tauri::State<'_, PreviewBrowserState>,
    url: Option<String>,
) -> Result<PreviewTabPayload, String> {
    let parsed_url = normalize_preview_url(url)?;
    let tab_id = Uuid::new_v4().to_string();
    let webview_label = format!("preview-browser-{}", tab_id);
    let token = Uuid::new_v4().to_string();
    let main_window = app.get_window("main").ok_or_else(|| "Main window not found".to_string())?;
    let app_for_nav = app.clone();
    let tab_for_nav = tab_id.clone();
    let token_for_nav = token.clone();
    let app_for_load = app.clone();
    let tab_for_load = tab_id.clone();
    let app_for_title = app.clone();
    let tab_for_title = tab_id.clone();

    let builder = WebviewBuilder::new(&webview_label, WebviewUrl::External(parsed_url.clone()))
        .initialization_script(console_capture_script(&tab_id, &token))
        .on_navigation(move |url| {
            if url.scheme() == "mlfb-preview" {
                let params: HashMap<String, String> = url.query_pairs().into_owned().collect();
                let event_tab = params.get("tabId").map(String::as_str).unwrap_or("");
                let event_token = params.get("token").map(String::as_str).unwrap_or("");
                let kind = params.get("kind").map(String::as_str).unwrap_or("");
                let payload = params.get("payload").map(String::as_str).unwrap_or("{}");
                if event_tab == tab_for_nav {
                    bridge_emit(&app_for_nav, &tab_for_nav, event_token, &token_for_nav, kind, payload);
                }
                return false;
            }
            matches!(url.scheme(), "http" | "https" | "about")
        })
        .on_page_load(move |_webview, payload| {
            let event_name = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "preview-load-started",
                tauri::webview::PageLoadEvent::Finished => "preview-load-finished",
            };
            let _ = app_for_load.emit(event_name, serde_json::json!({
                "tabId": tab_for_load.clone(),
                "url": payload.url().as_str(),
            }));
        })
        .on_document_title_changed(move |_webview, title| {
            let _ = app_for_title.emit("preview-tab-updated", serde_json::json!({
                "id": tab_for_title.clone(),
                "title": title,
            }));
        });

    let webview = main_window
        .add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1.0, 1.0))
        .map_err(|e| e.to_string())?;
    webview.hide().map_err(|e| e.to_string())?;

    state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?.insert(
        tab_id.clone(),
        PreviewTabRuntime { webview, token },
    );

    Ok(PreviewTabPayload {
        id: tab_id,
        webview_label,
        url: parsed_url.to_string(),
        title: if parsed_url.as_str() == "about:blank" { "New tab".to_string() } else { parsed_url.to_string() },
    })
}

#[tauri::command]
pub async fn preview_navigate(
    state: tauri::State<'_, PreviewBrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let parsed_url = normalize_preview_url(Some(url))?;
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.navigate(parsed_url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_reload(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_go_back(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_go_forward(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.eval("history.forward()").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_set_bounds(
    state: tauri::State<'_, PreviewBrowserState>,
    tab_id: String,
    bounds: PreviewBounds,
    visible: bool,
) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    if !visible || bounds.width < 8.0 || bounds.height < 8.0 {
        return runtime.webview.hide().map_err(|e| e.to_string());
    }
    runtime.webview.set_bounds(Rect {
        position: LogicalPosition::new(bounds.x, bounds.y).into(),
        size: LogicalSize::new(bounds.width, bounds.height).into(),
    }).map_err(|e| e.to_string())?;
    runtime.webview.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_hide_tab(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_close_tab(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let runtime = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?.remove(&tab_id);
    if let Some(runtime) = runtime {
        runtime.webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_start_picker(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.eval(PICKER_SCRIPT).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_stop_picker(state: tauri::State<'_, PreviewBrowserState>, tab_id: String) -> Result<(), String> {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
    runtime.webview.eval("if (window.__MLFB_PICKER_CLEANUP__) window.__MLFB_PICKER_CLEANUP__(true);").map_err(|e| e.to_string())
}
