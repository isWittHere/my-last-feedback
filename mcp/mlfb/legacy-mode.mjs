// mcp/mlfb/legacy-mode.mjs
// Legacy fallback used when the persistent IPC mode fails.
// Launches the Tauri app synchronously with --output-file and reads the result.

import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { findAppBinary } from "./paths.mjs";

export function launchFeedbackUILegacy(projectDirectory, summary, requestName) {
  const outputFile = join(
    tmpdir(),
    `mlf_${randomBytes(8).toString("hex")}.json`
  );

  try {
    const appPath = findAppBinary();

    execFileSync(appPath, [
      "--summary", summary,
      "--request-name", requestName,
      "--project-directory", projectDirectory,
      "--output-file", outputFile,
    ], {
      stdio: "ignore",
      windowsHide: false,
    });

    if (!existsSync(outputFile)) {
      return { interactive_feedback: "", command_logs: "", images: [] };
    }

    const raw = readFileSync(outputFile, "utf-8");
    return JSON.parse(raw);
  } finally {
    try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch {}
  }
}
