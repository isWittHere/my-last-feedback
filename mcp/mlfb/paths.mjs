// mcp/mlfb/paths.mjs
// Centralized path resolution for the MLFB server.
// Keeps Tauri-app-binary discovery independent of where this server is launched from.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repository root: three levels up from this file (mcp/mlfb/paths.mjs → repo root). */
export const PROJECT_ROOT = join(__dirname, "..", "..");

/** Whether we're targeting the dev build of the Tauri app. */
export const IS_DEV = process.env.MLF_DEV === "1";

export const PORT_CONFIG = {
  lockFileName: IS_DEV ? "my-last-feedback-dev.port" : "my-last-feedback.port",
  portStart: IS_DEV ? 19861 : 19850,
  portEnd: IS_DEV ? 19870 : 19860,
};

/**
 * Locate the Tauri app binary.
 * Probes the usual build outputs + the project root + $MLF_APP_PATH.
 * @returns {string} Absolute binary path.
 * @throws  If no binary is found.
 */
export function findAppBinary() {
  const candidates = [
    join(PROJECT_ROOT, "app", "src-tauri", "target", "release", "app.exe"),
    join(PROJECT_ROOT, "app", "src-tauri", "target", "release", "app"),
    join(PROJECT_ROOT, "app", "src-tauri", "target", "debug", "app.exe"),
    join(PROJECT_ROOT, "app", "src-tauri", "target", "debug", "app"),
    join(PROJECT_ROOT, "app.exe"),
    join(PROJECT_ROOT, "app"),
    process.env.MLF_APP_PATH || "",
  ];

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }

  throw new Error(
    "Could not find the Tauri app binary. " +
    "Build it with 'cd app && npx tauri build --no-bundle' or set MLF_APP_PATH env var."
  );
}
