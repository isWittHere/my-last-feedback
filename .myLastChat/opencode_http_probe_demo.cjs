#!/usr/bin/env node
/*
  Standalone OpenCode HTTP probe for MLFB.

  Default mode is read-only:
    node .myLastChat/opencode_http_probe_demo.cjs --workspace e:\Dev\my-last-feedback

  Mutating session lifecycle verification:
    node .myLastChat/opencode_http_probe_demo.cjs --workspace e:\Dev\my-last-feedback --mutate

  Connect to an existing server:
    node .myLastChat/opencode_http_probe_demo.cjs --connect http://127.0.0.1:4096 --password demo
*/

const { spawn, spawnSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const net = require("node:net")
const os = require("node:os")
const path = require("node:path")

const startedAt = new Date()
const args = parseArgs(process.argv.slice(2))
const workspace = path.resolve(args.workspace || process.cwd())
const hostname = args.hostname || "127.0.0.1"
const username = args.username || "opencode"
const password = args.password || crypto.randomUUID()
const results = []
let child = null
let baseUrl = args.connect || ""
let stoppingServer = false

function parseArgs(argv) {
  const parsed = { mutate: false, keepServer: false }
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (item === "--mutate") parsed.mutate = true
    else if (item === "--keep-server") parsed.keepServer = true
    else if (item.startsWith("--")) {
      const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      parsed[key] = argv[index + 1]
      index++
    }
  }
  return parsed
}

function record(name, ok, details = {}) {
  const item = {
    name,
    ok,
    at: new Date().toISOString(),
    ...details,
  }
  results.push(item)
  const mark = ok ? "OK" : "FAIL"
  console.log(`[${mark}] ${name}`)
  if (details.summary) console.log(`     ${details.summary}`)
  if (!ok && details.error) console.log(`     ${details.error}`)
  return item
}

function authHeader() {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

function makeUrl(route, query = {}) {
  const url = new URL(route, baseUrl)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function request(route, options = {}) {
  const query = options.query || {}
  const url = makeUrl(route, query)
  const headers = {
    Authorization: authHeader(),
    Accept: options.accept || "application/json",
    ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  const contentType = response.headers.get("content-type") || ""
  const text = await response.text()
  const data = contentType.includes("application/json") && text ? JSON.parse(text) : text
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return { response, data }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on("error", reject)
    server.listen(0, hostname, () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      return await request("/global/health")
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError || new Error("health check timed out")
}

async function startServer() {
  if (args.connect) {
    baseUrl = args.connect.replace(/\/$/, "")
    record("server.connect.external", true, { summary: baseUrl })
    return
  }

  const port = Number(args.port || (await findFreePort()))
  baseUrl = `http://${hostname}:${port}`
  const bin = args.bin || process.env.OPENCODE_BIN || "opencode"
  const serverArgs = ["serve", "--hostname", hostname, "--port", String(port)]
  const env = {
    ...process.env,
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_CLIENT: "mlfb-http-probe",
  }

  child = spawn(bin, serverArgs, {
    cwd: workspace,
    env,
    shell: process.platform === "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  const stdout = []
  const stderr = []
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString()
    stdout.push(text)
    process.stdout.write(`[opencode stdout] ${text}`)
  })
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString()
    stderr.push(text)
    process.stderr.write(`[opencode stderr] ${text}`)
  })
  child.on("exit", (code, signal) => {
    if (stoppingServer) return
    if (code !== null && code !== 0) {
      record("server.process.exit", false, { error: `code=${code} signal=${signal || ""}` })
    }
  })

  record("server.spawn", true, {
    summary: `${bin} ${serverArgs.join(" ")}`,
    pid: child.pid,
    baseUrl,
  })
}

async function readSse(route, query = {}, durationMs = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), durationMs)
  const events = []
  let buffer = ""
  try {
    const url = makeUrl(route, query)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(),
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const reader = response.body.getReader()
    while (events.length < 5) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += Buffer.from(value).toString("utf8")
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ""
      for (const chunk of chunks) {
        const dataLines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
        if (!dataLines.length) continue
        const raw = dataLines.join("\n")
        try {
          events.push(JSON.parse(raw))
        } catch {
          events.push(raw)
        }
      }
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error
  } finally {
    clearTimeout(timer)
  }
  return events
}

async function verifyAuth() {
  if (!password) return
  const response = await fetch(makeUrl("/global/health"))
  record("auth.rejects.missing.credentials", response.status === 401, {
    summary: `status=${response.status}`,
  })
}

async function runReadOnlyProbe() {
  const health = await waitForHealth(30_000)
  record("global.health", health.data?.healthy === true, {
    summary: `version=${health.data?.version || "unknown"}`,
    data: health.data,
  })

  await verifyAuth()

  const pathInfo = await request("/path", { query: { directory: workspace } })
  record("instance.path", !!pathInfo.data?.directory, {
    summary: `directory=${pathInfo.data?.directory}`,
    data: pathInfo.data,
  })

  const globalEvents = await readSse("/global/event", {}, 1500)
  record("global.event.sse", globalEvents.length > 0, {
    summary: `events=${globalEvents.map((event) => event?.payload?.type || event?.type || "unknown").join(", ")}`,
    data: globalEvents,
  })

  const instanceEvents = await readSse("/event", { directory: workspace }, 1500)
  record("instance.event.sse", instanceEvents.length > 0, {
    summary: `events=${instanceEvents.map((event) => event?.type || "unknown").join(", ")}`,
    data: instanceEvents,
  })

  const sessions = await request("/session", { query: { directory: workspace, roots: true, limit: 20 } })
  record("session.list", Array.isArray(sessions.data), {
    summary: `count=${Array.isArray(sessions.data) ? sessions.data.length : "not-array"}`,
    sample: Array.isArray(sessions.data) ? sessions.data.slice(0, 3) : sessions.data,
  })

  const status = await request("/session/status", { query: { directory: workspace } })
  record("session.status", status.data && typeof status.data === "object", {
    summary: `keys=${Object.keys(status.data || {}).length}`,
    data: status.data,
  })

  const providers = await request("/provider", { query: { directory: workspace } })
  record("provider.list", !!providers.data?.all, {
    summary: `all=${providers.data?.all?.length || 0} connected=${providers.data?.connected?.length || 0}`,
    sample: providers.data?.all?.slice?.(0, 3),
    defaults: providers.data?.default,
  })

  const config = await request("/config", { query: { directory: workspace } })
  record("config.get", config.data && typeof config.data === "object", {
    summary: `keys=${Object.keys(config.data || {}).length}`,
  })
}

async function runMutationProbe() {
  const title = `MLFB HTTP probe ${new Date().toISOString()}`
  const created = await request("/session", {
    method: "POST",
    query: { directory: workspace },
    body: {},
  })
  const sessionID = created.data?.id
  record("session.create", !!sessionID, {
    summary: `sessionID=${sessionID || "missing"} title=${created.data?.title || ""}`,
    data: created.data,
  })

  if (!sessionID) return

  const updated = await request(`/session/${encodeURIComponent(sessionID)}`, {
    method: "PATCH",
    query: { directory: workspace },
    body: { title },
  })
  record("session.update.rename", updated.data?.title === title, {
    summary: `title=${updated.data?.title || ""}`,
    data: updated.data,
  })

  const messages = await request(`/session/${encodeURIComponent(sessionID)}/message`, {
    query: { directory: workspace },
  })
  record("session.messages", Array.isArray(messages.data), {
    summary: `messages=${Array.isArray(messages.data) ? messages.data.length : "not-array"}`,
    data: messages.data,
  })

  const deleted = await request(`/session/${encodeURIComponent(sessionID)}`, {
    method: "DELETE",
    query: { directory: workspace },
  })
  record("session.delete", deleted.data === true, {
    summary: `deleted=${deleted.data}`,
  })

  const after = await request("/session", { query: { directory: workspace, roots: true, limit: 50 } })
  const stillThere = Array.isArray(after.data) && after.data.some((item) => item.id === sessionID)
  record("session.delete.confirm", !stillThere, {
    summary: `stillThere=${stillThere}`,
  })
}

async function writeReport() {
  const safeStamp = startedAt.toISOString().replace(/[:.]/g, "-")
  const reportPath = path.join(__dirname, `opencode_http_probe_result_${safeStamp}.json`)
  const ok = results.every((item) => item.ok)
  const payload = {
    ok,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    workspace,
    baseUrl,
    username,
    passwordSet: !!password,
    spawned: !!child,
    pid: child?.pid,
    mutate: !!args.mutate,
    results,
  }
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8")
  console.log(`\nReport written: ${reportPath}`)
  console.log(`Overall: ${ok ? "PASS" : "FAIL"}`)
}

async function cleanup() {
  if (!child || args.keepServer) return
  if (child.exitCode !== null || child.killed) return
  stoppingServer = true
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    return
  }
  await new Promise((resolve) => {
    child.once("exit", resolve)
    child.kill("SIGTERM")
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL")
      resolve()
    }, 3000).unref()
  })
}

async function main() {
  console.log("OpenCode HTTP probe")
  console.log(`Workspace: ${workspace}`)
  console.log(`Platform: ${os.platform()} ${os.release()}`)
  console.log(`Mode: ${args.mutate ? "mutating session lifecycle" : "read-only"}`)

  try {
    await startServer()
    await runReadOnlyProbe()
    if (args.mutate) await runMutationProbe()
  } catch (error) {
    record("probe.fatal", false, {
      error: error && error.stack ? error.stack : String(error),
    })
    process.exitCode = 1
  } finally {
    await writeReport().catch((error) => {
      console.error(`Failed to write report: ${error.stack || error}`)
    })
    await cleanup()
  }
}

main()