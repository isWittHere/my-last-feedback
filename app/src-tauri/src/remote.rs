//! Remote HTTP + WS server for mobile clients (Tailscale + PWA + Android APP).
//!
//! Phase 0 scope: minimal `/api/health` hello-world endpoint. Authentication,
//! session routes, WebSocket broadcast, and pairing arrive in later phases.
//!
//! Design notes (see MLC_MLFB远程反馈_方案B_v0.2_*.md §3.1):
//!   - Bind `0.0.0.0:<MLFB_REMOTE_PORT>` so Tailnet peers can reach it
//!   - Default port 58733 (configurable via env)
//!   - Only started when `MLFB_REMOTE_ENABLED` is set (opt-in for Phase 0)
//!   - Shares state with the desktop app through a future `RemoteState` handle

use std::net::SocketAddr;

use axum::{routing::get, Json, Router};
use serde::Serialize;

/// Environment variable toggles & configuration.
const ENV_ENABLED: &str = "MLFB_REMOTE_ENABLED";
const ENV_PORT: &str = "MLFB_REMOTE_PORT";
const DEFAULT_PORT: u16 = 58733;

/// Resolve the effective bind port from the environment.
fn resolve_port() -> u16 {
    std::env::var(ENV_PORT)
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT)
}

/// Whether the remote server is opted in via env flag.
pub fn is_enabled() -> bool {
    matches!(
        std::env::var(ENV_ENABLED).ok().as_deref(),
        Some("1") | Some("true") | Some("TRUE") | Some("yes")
    )
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
    phase: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "mlfb-remote",
        version: env!("CARGO_PKG_VERSION"),
        phase: "0-skeleton",
    })
}

/// Build the axum router. Kept tiny for Phase 0.
fn build_router() -> Router {
    Router::new().route("/api/health", get(health))
}

/// Spawn the remote server on a background task. Returns the resolved port on
/// successful bind, or an error string that the caller can log.
pub async fn start_remote_server() -> Result<u16, String> {
    let port = resolve_port();
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {addr} failed: {e}"))?;

    let app = build_router();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[Remote] axum server stopped: {e}");
        }
    });

    Ok(port)
}
