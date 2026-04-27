use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};
use std::collections::HashMap;
use std::fs;
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTabPayload {
    pub id: String,
    pub webview_label: String,
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PreviewBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementRect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCaptureRequest {
  pub tab_id: String,
  pub rect: ElementRect,
  pub bounds: PreviewBounds,
  pub device_pixel_ratio: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementScreenshotRef {
  pub id: String,
  pub kind: String,
  pub file_name: Option<String>,
  pub file_path: Option<String>,
  pub data_url: Option<String>,
  pub mime_type: String,
  pub width: u32,
  pub height: u32,
  #[serde(rename = "sizeKB")]
  pub size_kb: Option<u64>,
  pub device_pixel_ratio: f64,
  pub rect: ElementRect,
  pub captured_at: String,
  pub status: String,
  pub error: Option<String>,
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
  var recentMessages = {};
  function emit(level, args, extra) {
    var items = Array.prototype.slice.call(args || []).map(function (item) { return safe(item); });
    var message = short(items.join(' '), 4096);
    var fingerprint = level + ':' + message.slice(0, 300) + ':' + ((extra && extra.sourceUrl) || location.href);
    var now = Date.now();
    if (recentMessages[fingerprint] && now - recentMessages[fingerprint] < 2500) return;
    recentMessages[fingerprint] = now;
    send('console-entry', Object.assign({
      id: 'console-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      level: level,
      message: message,
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
  var originalWindowOpen = window.open;
  window.open = function (url) {
    if (url) {
      try { location.href = String(url); } catch (_) {}
      return null;
    }
    return originalWindowOpen ? originalWindowOpen.apply(window, arguments) : null;
  };
  document.addEventListener('click', function (event) {
    var target = event.target;
    while (target && target !== document && target.tagName !== 'A') target = target.parentElement;
    if (!target || target.tagName !== 'A') return;
    var href = target.getAttribute('href');
    var targetName = target.getAttribute('target');
    if (!href || !targetName || targetName.toLowerCase() !== '_blank') return;
    event.preventDefault();
    event.stopPropagation();
    location.href = target.href;
  }, true);
  window.__MLFB_PREVIEW_BRIDGE__ = { send: send };
})();
"#;

const PICKER_SCRIPT: &str = r#"
(function () {
  if (!window.__MLFB_PREVIEW_BRIDGE__) return;
  if (window.__MLFB_PICKER_CLEANUP__) window.__MLFB_PICKER_CLEANUP__();
  var highlighted = null;
  var savedHighlight = null;
  function saveStyle(el, name) {
    return { value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) };
  }
  function restoreStyle(el, name, saved) {
    if (!saved) return;
    if (saved.value) el.style.setProperty(name, saved.value, saved.priority || '');
    else el.style.removeProperty(name);
  }
  function clearHighlight() {
    if (!highlighted || !savedHighlight) return;
    restoreStyle(highlighted, 'outline', savedHighlight.outline);
    restoreStyle(highlighted, 'outline-offset', savedHighlight.outlineOffset);
    restoreStyle(highlighted, 'box-shadow', savedHighlight.boxShadow);
    restoreStyle(highlighted, 'background-color', savedHighlight.backgroundColor);
    highlighted = null;
    savedHighlight = null;
  }
  function applyHighlight(el) {
    if (!el || el === highlighted || el === document.documentElement || el === document.body) return;
    clearHighlight();
    highlighted = el;
    savedHighlight = {
      outline: saveStyle(el, 'outline'),
      outlineOffset: saveStyle(el, 'outline-offset'),
      boxShadow: saveStyle(el, 'box-shadow'),
      backgroundColor: saveStyle(el, 'background-color')
    };
    el.style.setProperty('outline', '1px solid #22d3ee', 'important');
    el.style.setProperty('outline-offset', '0px', 'important');
    el.style.setProperty('box-shadow', '0 0 0 1px rgba(37,99,235,.72), inset 0 0 0 9999px rgba(34,211,238,.12)', 'important');
    if (!el.style.getPropertyValue('background-color')) el.style.setProperty('background-color', 'rgba(34,211,238,.08)', 'important');
  }
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
  function domPathFor(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      if (node.id) { part += '#' + cssEscape(node.id); parts.unshift(part); break; }
      if (typeof node.className === 'string') {
        var classes = node.className.split(/\s+/).filter(Boolean).slice(0, 3);
        if (classes.length) part += '.' + classes.map(cssEscape).join('.');
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function selectedAttributes(el) {
    var keep = {};
    var names = ['id', 'class', 'href', 'src', 'name', 'type', 'role', 'aria-label', 'aria-labelledby', 'data-testid', 'data-test', 'data-cy', 'target', 'disabled', 'checked', 'selected', 'placeholder', 'title', 'alt'];
    names.forEach(function (name) {
      var value = el.getAttribute(name);
      if (value != null && value !== '') keep[name] = String(value).slice(0, 500);
    });
    return keep;
  }
  function styleSummary(el) {
    var computed = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (!computed) return {};
    var names = ['display', 'position', 'z-index', 'overflow', 'visibility', 'opacity', 'pointer-events', 'box-sizing', 'width', 'height', 'margin', 'padding', 'border', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'text-align', 'background-color', 'background-image', 'cursor', 'user-select', 'transform'];
    var lowValue = { '': true, normal: true, none: true, auto: true, '0px': true, static: true };
    var result = {};
    names.forEach(function (name) {
      var value = computed.getPropertyValue(name);
      if (!value || lowValue[value]) return;
      if (name === 'background-color' && value === 'rgba(0, 0, 0, 0)') return;
      result[name] = value;
    });
    return result;
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
    var xpath = xpathFor(el);
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
      attributes: selectedAttributes(el),
      domPath: domPathFor(el),
      xpath: xpath,
      styleSummary: styleSummary(el),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      htmlSnippet: el.outerHTML ? el.outerHTML.slice(0, 1000) : undefined,
      capturedAt: new Date().toISOString()
    };
  }
  function move(event) {
    var el = event.target;
    if (!el || el === document.documentElement || el === document.body) return;
    applyHighlight(el);
  }
  function cleanup(sendCancel) {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', keydown, true);
    clearHighlight();
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
        PreviewTabRuntime { webview },
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
pub async fn preview_set_zoom(
  state: tauri::State<'_, PreviewBrowserState>,
  tab_id: String,
  zoom: f64,
) -> Result<(), String> {
  let zoom = zoom.clamp(0.5, 2.0);
  let script = format!(r#"
    (function () {{
      var zoom = {};
      var style = document.getElementById('__mlfb_preview_zoom_style__');
      if (!style) {{
        style = document.createElement('style');
        style.id = '__mlfb_preview_zoom_style__';
        document.head.appendChild(style);
      }}
      document.documentElement.style.zoom = '';
      if (zoom === 1) {{
        document.body.style.transform = '';
        document.body.style.transformOrigin = '';
        document.body.style.width = '';
        style.textContent = '';
        return;
      }}
      document.body.style.transformOrigin = '0 0';
      document.body.style.transform = 'scale(' + zoom + ')';
      document.body.style.width = (100 / zoom) + '%';
      style.textContent = '';
    }})();
  "#, zoom);
  let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
  let runtime = tabs.get(&tab_id).ok_or_else(|| "Preview tab not found".to_string())?;
  runtime.webview.eval(script).map_err(|e| e.to_string())
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
pub async fn preview_capture_element(
  app: AppHandle,
  state: tauri::State<'_, PreviewBrowserState>,
  request: PreviewCaptureRequest,
) -> Result<ElementScreenshotRef, String> {
  {
    let tabs = state.tabs.lock().map_err(|_| "Preview state is poisoned".to_string())?;
    if !tabs.contains_key(&request.tab_id) {
      return Err("Preview tab not found".to_string());
    }
  }

  let captured_at = chrono::Utc::now().to_rfc3339();
  let id = format!("element-shot-{}", Uuid::new_v4());
  let main_window = app.get_window("main").ok_or_else(|| "Main window not found".to_string())?;
  let inner_position = main_window.inner_position().map_err(|e| e.to_string())?;
  let scale_factor = main_window.scale_factor().unwrap_or(request.device_pixel_ratio.max(1.0));
  let padding = 6.0;
  let left = (request.bounds.x + request.rect.x - padding).max(request.bounds.x);
  let top = (request.bounds.y + request.rect.y - padding).max(request.bounds.y);
  let right = (request.bounds.x + request.rect.x + request.rect.width + padding).min(request.bounds.x + request.bounds.width);
  let bottom = (request.bounds.y + request.rect.y + request.rect.height + padding).min(request.bounds.y + request.bounds.height);
  if right <= left || bottom <= top {
    return Err("Element area is outside the preview viewport".to_string());
  }

  let raw_x = inner_position.x + (left * scale_factor).round() as i32;
  let raw_y = inner_position.y + (top * scale_factor).round() as i32;
  let raw_right = inner_position.x + (right * scale_factor).round() as i32;
  let raw_bottom = inner_position.y + (bottom * scale_factor).round() as i32;
  let screen = screenshots::Screen::from_point(raw_x, raw_y).map_err(|e| e.to_string())?;
  let display = screen.display_info;
  let screen_left = display.x;
  let screen_top = display.y;
  let screen_right = display.x + display.width as i32;
  let screen_bottom = display.y + display.height as i32;
  let x = raw_x.max(screen_left).min(screen_right.saturating_sub(1));
  let y = raw_y.max(screen_top).min(screen_bottom.saturating_sub(1));
  let clipped_right = raw_right.max(x + 1).min(screen_right);
  let clipped_bottom = raw_bottom.max(y + 1).min(screen_bottom);
  let width = (clipped_right - x).max(1) as u32;
  let height = (clipped_bottom - y).max(1) as u32;
  let capture_x = x - screen_left;
  let capture_y = y - screen_top;

  let image = screen.capture_area(capture_x, capture_y, width, height).map_err(|e| {
    format!(
      "{} (capture x={}, y={}, width={}, height={}, global x={}, y={}, screen={}x{}@{},{}; preview x={}, y={}, width={}, height={}; element x={}, y={}, width={}, height={})",
      e,
      capture_x,
      capture_y,
      width,
      height,
      x,
      y,
      display.width,
      display.height,
      display.x,
      display.y,
      request.bounds.x,
      request.bounds.y,
      request.bounds.width,
      request.bounds.height,
      request.rect.x,
      request.rect.y,
      request.rect.width,
      request.rect.height,
    )
  })?;
  let dir = std::env::temp_dir().join("my-last-feedback").join("preview-screenshots");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let file_name = format!("{}.png", id);
  let path = dir.join(&file_name);
  image.save(&path).map_err(|e| e.to_string())?;
  let bytes = fs::read(&path).map_err(|e| e.to_string())?;
  let size_kb = Some((bytes.len() as u64 + 1023) / 1024);
  let data_url = Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(bytes)));

  Ok(ElementScreenshotRef {
    id,
    kind: "element".to_string(),
    file_name: Some(file_name),
    file_path: Some(path.to_string_lossy().to_string()),
    data_url,
    mime_type: "image/png".to_string(),
    width,
    height,
    size_kb,
    device_pixel_ratio: scale_factor,
    rect: request.rect,
    captured_at,
    status: "ready".to_string(),
    error: None,
  })
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
