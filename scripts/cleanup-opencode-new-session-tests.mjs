#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 40974;
const DEFAULT_LIMIT = 10000;
const MATCH_PREFIX = "New session - ";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const help = args.has("--help") || args.has("-h");

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

if (help) {
  console.log(`Usage:
  node scripts/cleanup-opencode-new-session-tests.mjs
  node scripts/cleanup-opencode-new-session-tests.mjs --apply

Options:
  --apply           Delete matching sessions. Without this flag, only prints a dry run.
  --bin=<command>   OpenCode command to run. Default: opencode
  --port=<port>     Preferred local port. Default: ${DEFAULT_PORT}
  --limit=<number>  Max sessions to fetch. Default: ${DEFAULT_LIMIT}
`);
  process.exit(0);
}

const bin = argValue("--bin", "opencode");
const preferredPort = Number(argValue("--port", String(DEFAULT_PORT)));
const limit = Number(argValue("--limit", String(DEFAULT_LIMIT)));
const username = "opencode-cleanup";
const password = randomUUID();

function authHeader() {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function isMatchingSession(session) {
  return typeof session?.title === "string" && session.title.trim().startsWith(MATCH_PREFIX);
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, DEFAULT_HOST);
    });
    if (available) return port;
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + 99}`);
}

async function requestJson(baseUrl, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 30000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      await requestJson(baseUrl, "/global/health", { timeoutMs: 1000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`OpenCode server did not become healthy. ${lastError instanceof Error ? lastError.message : ""}\n${output.slice(-4000)}`);
}

function formatSession(session) {
  const id = session.id || session.sessionId || "<unknown>";
  const title = session.title || "<untitled>";
  const directory = session.directory || session.cwd || "<no directory>";
  const updated = session.time?.updated ? new Date(session.time.updated).toISOString() : "<no updated time>";
  return `${id}\n  ${title}\n  ${directory}\n  ${updated}`;
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
}

let child;
let shuttingDown = false;

function handleSigint() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child) stopChild(child);
  process.exit(130);
}

try {
  const port = await findFreePort(Number.isFinite(preferredPort) ? preferredPort : DEFAULT_PORT);
  const baseUrl = `http://${DEFAULT_HOST}:${port}`;
  let output = "";

  child = spawn(bin, ["serve", "--hostname", DEFAULT_HOST, "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPENCODE_SERVER_USERNAME: username,
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_CLIENT: "mlfb-cleanup-script",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  process.on("SIGINT", handleSigint);

  console.log(`Starting temporary OpenCode server on ${baseUrl}...`);
  await waitForHealth(baseUrl, child, output);

  const sessions = await requestJson(baseUrl, `/experimental/session?roots=true&limit=${Number.isFinite(limit) ? limit : DEFAULT_LIMIT}`);
  const matches = Array.isArray(sessions) ? sessions.filter(isMatchingSession) : [];

  console.log(`Found ${matches.length} session(s) matching title prefix ${JSON.stringify(MATCH_PREFIX)}.`);
  for (const session of matches) {
    console.log(formatSession(session));
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete these sessions.");
    process.exitCode = 0;
  } else {
    let deleted = 0;
    let failed = 0;
    for (const session of matches) {
      const id = session.id || session.sessionId;
      if (!id) {
        failed += 1;
        console.error("Skipping session without id:", session.title || session);
        continue;
      }
      try {
        await requestJson(baseUrl, `/session/${encodeURIComponent(id)}`, { method: "DELETE" });
        deleted += 1;
        console.log(`Deleted ${id}`);
      } catch (error) {
        failed += 1;
        console.error(`Failed to delete ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log(`Done. Deleted ${deleted}, failed ${failed}.`);
    process.exitCode = failed > 0 ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  shuttingDown = true;
  if (child) stopChild(child);
}