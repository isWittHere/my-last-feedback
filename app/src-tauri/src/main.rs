// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Enable GPU-accelerated rendering in WebView2 for CSS backdrop-filter support.
    // Without this, the release build may fall back to software rendering
    // where backdrop-filter (blur) has no effect.
    #[cfg(target_os = "windows")]
    {
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--enable-features=msWebView2EnableDraggableRegions --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist",
            );
        }
    }

    app_lib::run()
}
