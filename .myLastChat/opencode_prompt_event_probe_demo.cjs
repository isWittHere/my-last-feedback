#!/usr/bin/env node
/*
  Standalone OpenCode prompt/event probe for MLFB.

  Dry run without token use:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback

  Prompt event probe:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Reply with exactly: MLFB probe ok" --auto-model

  Prefer a connected provider when auto-selecting a model:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Reply with exactly: MLFB probe ok" --auto-model --prefer-provider opencode

  Explicit model:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Reply with exactly: MLFB probe ok" --model opencode/minimax-m2.5-free

  Tool event probe with read-only permissions:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Use the Glob tool exactly once to find files matching .myLastChat/opencode_*probe_demo.cjs, then answer with the number of files found." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob

  Tool error probe:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Use the Glob tool exactly once with pattern * and path package.json, then stop. Do not use any other tool." --model opencode/minimax-m2.5-free --allow-readonly-tools --expect-tool glob --expect-tool-status error

  Permission ask probe:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Use the Glob tool exactly once to find package.json." --model opencode/minimax-m2.5-free --ask-readonly-tools --expect-permission-asked

  Abort probe:
    node .myLastChat/opencode_prompt_event_probe_demo.cjs --workspace e:\Dev\my-last-feedback --prompt "Write a very long numbered list from 1 to 1000, one item per line." --model opencode/minimax-m2.5-free --abort-after-ms 1000
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
const timeoutMs = Number(args.timeoutMs || 90_000)
const results = []
let child = null
let baseUrl = args.connect || ""
let stoppingServer = false

function parseArgs(argv) {
  const parsed = {
    keepServer: false,
    keepSession: false,
    autoModel: false,
    allowReadonlyTools: false,
    askReadonlyTools: false,
    expectPermissionAsked: false,
  }
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (item === "--keep-server") parsed.keepServer = true
    else if (item === "--keep-session") parsed.keepSession = true
    else if (item === "--auto-model") parsed.autoModel = true
    else if (item === "--allow-readonly-tools") parsed.allowReadonlyTools = true
    else if (item === "--ask-readonly-tools") parsed.askReadonlyTools = true
    else if (item === "--expect-permission-asked") parsed.expectPermissionAsked = true
    else if (item.startsWith("--")) {
      const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      parsed[key] = argv[index + 1]
      index++
    }
  }
  return parsed
}

function record(name, ok, details = {}) {
  const item = { name, ok, at: new Date().toISOString(), ...details }
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
  const url = makeUrl(route, options.query || {})
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: authHeader(),
      Accept: options.accept || "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
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

async function waitForHealth(timeout) {
  const deadline = Date.now() + timeout
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
  child = spawn(bin, serverArgs, {
    cwd: workspace,
    env: {
      ...process.env,
      OPENCODE_SERVER_USERNAME: username,
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_CLIENT: "mlfb-prompt-event-probe",
    },
    shell: process.platform === "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (chunk) => process.stdout.write(`[opencode stdout] ${chunk.toString()}`))
  child.stderr.on("data", (chunk) => process.stderr.write(`[opencode stderr] ${chunk.toString()}`))
  child.on("exit", (code, signal) => {
    if (stoppingServer) return
    if (code !== null && code !== 0) record("server.process.exit", false, { error: `code=${code} signal=${signal || ""}` })
  })
  record("server.spawn", true, {
    summary: `${bin} ${serverArgs.join(" ")}`,
    pid: child.pid,
    baseUrl,
  })
}

function unwrapEvent(raw) {
  const payload = raw && raw.payload ? raw.payload : raw
  return {
    raw,
    type: payload?.type || "unknown",
    properties: payload?.properties || {},
  }
}

class SseCollector {
  constructor(name, route, query) {
    this.name = name
    this.route = route
    this.query = query
    this.events = []
    this.errors = []
    this.controller = new AbortController()
    this.done = null
  }

  start() {
    this.done = this.run().catch((error) => {
      if (error.name !== "AbortError") this.errors.push(error.stack || String(error))
    })
  }

  async run() {
    const response = await fetch(makeUrl(this.route, this.query), {
      headers: {
        Authorization: authHeader(),
        Accept: "text/event-stream",
      },
      signal: this.controller.signal,
    })
    if (!response.ok) throw new Error(`${this.name}: ${response.status} ${response.statusText}`)
    const reader = response.body.getReader()
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += Buffer.from(value).toString("utf8")
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ""
      for (const chunk of chunks) {
        const dataLines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
        if (!dataLines.length) continue
        const rawData = dataLines.join("\n")
        try {
          const parsed = JSON.parse(rawData)
          const event = unwrapEvent(parsed)
          this.events.push(event)
          console.log(`[event:${this.name}] ${event.type}`)
        } catch {
          this.events.push({ raw: rawData, type: "raw", properties: {} })
        }
      }
    }
  }

  stop() {
    this.controller.abort()
  }

  async waitUntil(predicate, timeout) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const hit = this.events.find(predicate)
      if (hit) return hit
      if (this.errors.length > 0) throw new Error(this.errors.join("\n"))
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return undefined
  }

  summary(sessionID) {
    const scoped = sessionID ? this.events.filter((event) => event.properties?.sessionID === sessionID) : this.events
    const counts = {}
    for (const event of scoped) counts[event.type] = (counts[event.type] || 0) + 1
    const toolEvents = scoped
      .filter((event) => event.type === "message.part.updated" && event.properties?.part?.type === "tool")
      .map((event) => {
        const part = event.properties.part
        return {
          tool: part.tool,
          callID: part.callID,
          status: part.state?.status,
          title: part.state?.title,
          input: part.state?.input,
          output: typeof part.state?.output === "string" ? part.state.output.slice(0, 1000) : undefined,
          error: part.state?.error,
          metadata: part.state?.metadata,
        }
      })
    const toolStatusCounts = {}
    for (const event of toolEvents) {
      const key = `${event.tool || "unknown"}:${event.status || "unknown"}`
      toolStatusCounts[key] = (toolStatusCounts[key] || 0) + 1
    }
    const textDelta = scoped
      .filter((event) => event.type === "message.part.delta" && event.properties?.field === "text")
      .map((event) => event.properties?.delta || "")
      .join("")
    const partTypes = scoped
      .filter((event) => event.type === "message.part.updated")
      .map((event) => event.properties?.part?.type)
      .filter(Boolean)
    const permissionRequests = scoped
      .filter((event) => event.type === "permission.asked")
      .map((event) => ({
        id: event.properties?.id,
        sessionID: event.properties?.sessionID,
        permission: event.properties?.permission,
        patterns: event.properties?.patterns,
        metadata: event.properties?.metadata,
        tool: event.properties?.tool,
      }))
    const statusEvents = scoped
      .filter((event) => event.type === "session.status" || event.type === "session.idle")
      .map((event) => ({ type: event.type, status: event.properties?.status }))
    return {
      counts,
      textDelta,
      partTypes,
      toolEvents,
      toolStatusCounts,
      permissionRequests,
      statusEvents,
      total: scoped.length,
      errors: this.errors,
    }
  }
}

function readOnlyPermissionRules(action = "allow") {
  return [
    { permission: "glob", pattern: "*", action },
    { permission: "grep", pattern: "*", action },
    { permission: "read", pattern: "*", action },
    { permission: "list", pattern: "*", action },
    { permission: "external_directory", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "deny" },
  ]
}

function parseModel(input) {
  if (!input) return undefined
  const [providerID, ...rest] = input.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) throw new Error(`Invalid --model value: ${input}. Expected provider/model.`)
  return { providerID, modelID }
}

function chooseModel(providerData) {
  const explicit = parseModel(args.model)
  if (explicit) return explicit
  if (!args.autoModel) return undefined
  const connected = new Set(providerData?.connected || [])
  const providers = Array.isArray(providerData?.all) ? providerData.all : []
  const preferred = args.preferProvider
  const orderedProviders = preferred
    ? [...providers.filter((provider) => provider.id === preferred), ...providers.filter((provider) => provider.id !== preferred)]
    : providers
  for (const provider of orderedProviders) {
    if (connected.size && !connected.has(provider.id)) continue
    const models = Object.values(provider.models || {}).filter((model) => !model.status || model.status === "active")
    if (models.length > 0) return { providerID: provider.id, modelID: models[0].id }
  }
  return undefined
}

async function dryRun(providerData) {
  const connected = providerData?.connected || []
  const model = chooseModel(providerData)
  record("prompt.dry_run", true, {
    summary: `connected=${connected.length} suggested=${model ? `${model.providerID}/${model.modelID}` : "none"}`,
    connected,
    suggestedModel: model,
  })
}

async function runPromptProbe(providerData) {
  if (!args.prompt) {
    await dryRun(providerData)
    return
  }

  const model = chooseModel(providerData)
  record("prompt.model", !!model || !args.model, {
    summary: model ? `${model.providerID}/${model.modelID}` : "using OpenCode default model",
    model,
  })

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

  if (args.allowReadonlyTools || args.askReadonlyTools) {
    const permissionAction = args.askReadonlyTools ? "ask" : "allow"
    const updated = await request(`/session/${encodeURIComponent(sessionID)}`, {
      method: "PATCH",
      query: { directory: workspace },
      body: { permission: readOnlyPermissionRules(permissionAction) },
    })
    record(`session.permission.readonly.${permissionAction}`, !!updated.data?.permission, {
      summary: `rules=${updated.data?.permission?.length || 0}`,
      permission: updated.data?.permission,
    })
  }

  const instanceEvents = new SseCollector("instance", "/event", { directory: workspace })
  const globalEvents = new SseCollector("global", "/global/event", {})
  instanceEvents.start()
  globalEvents.start()
  await instanceEvents.waitUntil((event) => event.type === "server.connected", 5000)
  await globalEvents.waitUntil((event) => event.type === "server.connected", 5000)

  const body = {
    parts: [{ type: "text", text: args.prompt }],
    ...(model ? { model } : {}),
    ...(args.agent ? { agent: args.agent } : {}),
  }

  await request(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    query: { directory: workspace },
    body,
  })
  record("session.prompt_async", true, {
    summary: `accepted sessionID=${sessionID}`,
    body: { ...body, parts: [{ type: "text", text: args.prompt.slice(0, 120) }] },
  })

  const abortAfterMs = args.abortAfterMs === undefined ? 0 : Number(args.abortAfterMs)
  let abortResult
  if (abortAfterMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, abortAfterMs))
    await request(`/session/${encodeURIComponent(sessionID)}/abort`, {
      method: "POST",
      query: { directory: workspace },
    })
      .then((response) => {
        abortResult = { ok: response.data === true, data: response.data }
        record("session.abort.request", response.data === true, { summary: `aborted=${response.data}` })
      })
      .catch((error) => {
        abortResult = { ok: false, error: error.stack || error.message }
        record("session.abort.request", false, { error: abortResult.error })
      })
  }

  let permissionAskedSeen = false
  if (args.expectPermissionAsked) {
    const permissionAsked = await instanceEvents.waitUntil(
      (event) => event.type === "permission.asked" && event.properties?.sessionID === sessionID,
      timeoutMs,
    )
    permissionAskedSeen = !!permissionAsked
    record("permission.asked", !!permissionAsked, {
      summary: permissionAsked
        ? `${permissionAsked.properties?.permission || "unknown"} ${JSON.stringify(permissionAsked.properties?.patterns || [])}`
        : `not seen within ${timeoutMs}ms`,
      event: permissionAsked,
    })
    if (permissionAsked) {
      const aborted = await request(`/session/${encodeURIComponent(sessionID)}/abort`, {
        method: "POST",
        query: { directory: workspace },
      }).catch((error) => ({ error }))
      record("session.abort.after_permission", !aborted.error && aborted.data === true, {
        summary: aborted.error ? aborted.error.message : `aborted=${aborted.data}`,
        error: aborted.error?.stack || aborted.error?.message,
      })
    }
  }

  const completed = await instanceEvents.waitUntil((event) => {
    if (event.properties?.sessionID !== sessionID) return false
    if (args.expectPermissionAsked && event.type === "permission.asked") return true
    if (event.type === "session.error") return true
    if (abortAfterMs > 0 && (event.type === "session.idle" || event.properties?.status?.type === "idle")) return true
    if (event.type !== "message.updated") return false
    const info = event.properties?.info
    return info?.role === "assistant" && (info?.time?.completed || info?.finish || info?.error)
  }, timeoutMs)

  instanceEvents.stop()
  globalEvents.stop()
  await Promise.allSettled([instanceEvents.done, globalEvents.done])

  record("prompt.completion.event", !!completed, {
    summary: completed ? completed.type : `not completed within ${timeoutMs}ms`,
    event: completed,
  })

  const messages = await request(`/session/${encodeURIComponent(sessionID)}/message`, {
    query: { directory: workspace },
  })
  record("session.messages.after_prompt", Array.isArray(messages.data) && messages.data.length > 0, {
    summary: `messages=${Array.isArray(messages.data) ? messages.data.length : "not-array"}`,
    data: messages.data,
  })

  const todos = await request(`/session/${encodeURIComponent(sessionID)}/todo`, {
    query: { directory: workspace },
  }).catch((error) => ({ error }))
  record("session.todo.after_prompt", !todos.error, {
    summary: todos.error ? todos.error.message : `todos=${Array.isArray(todos.data) ? todos.data.length : "not-array"}`,
    data: todos.data,
    error: todos.error?.stack || todos.error?.message,
  })

  const instanceSummary = instanceEvents.summary(sessionID)
  const globalSummary = globalEvents.summary(sessionID)
  if (abortAfterMs > 0) {
    const abortSeen = !!abortResult?.ok || instanceSummary.statusEvents.some((event) => event.status?.type === "idle")
    record("session.abort.observed", abortSeen, {
      summary: abortSeen ? "abort requested or idle observed" : "abort not observed",
      abortResult,
      statusEvents: instanceSummary.statusEvents,
    })
  }
  const expectedTool = args.expectTool
  if (expectedTool) {
    const expectedToolStatus = args.expectToolStatus || "completed"
    const matchingTool = instanceSummary.toolEvents.find((event) => event.tool === expectedTool)
    const matchingStatusTool = instanceSummary.toolEvents.find(
      (event) => event.tool === expectedTool && event.status === expectedToolStatus,
    )
    record("tool.expected", !!matchingTool, {
      summary: matchingTool ? `${expectedTool} seen` : `${expectedTool} not seen`,
      expectedTool,
      matchingTool,
      matchingStatusTool,
    })
    record("tool.status", !!matchingStatusTool, {
      summary: matchingStatusTool ? `${expectedTool} ${expectedToolStatus}` : `${expectedTool} not ${expectedToolStatus}`,
      expectedTool,
      expectedToolStatus,
      matchingStatusTool,
    })
  }
  const assistantMessages = Array.isArray(messages.data)
    ? messages.data.filter((message) => message.info?.role === "assistant")
    : []
  const assistantError = assistantMessages.find((message) => message.info?.error)?.info?.error
  const successfulResponse = assistantMessages.some(
    (message) =>
      !message.info?.error &&
      (message.info?.time?.completed || message.info?.finish || instanceSummary.textDelta.length > 0),
  )
  const modelResponseRequired = !args.expectPermissionAsked && abortAfterMs <= 0
  record("prompt.model_response", successfulResponse || !modelResponseRequired, {
    summary: !modelResponseRequired
      ? `not required for ${args.expectPermissionAsked ? "permission" : "abort"} probe`
      : successfulResponse
      ? `textDelta=${instanceSummary.textDelta.length}`
      : assistantError
        ? `assistant error: ${assistantError.name || "error"}`
        : "no completed assistant response",
    assistantError,
    permissionAskedSeen,
    modelResponseRequired,
    textDelta: instanceSummary.textDelta,
  })
  record("events.instance.summary", instanceSummary.total > 0, {
    summary: JSON.stringify(instanceSummary.counts),
    data: instanceSummary,
  })
  record("events.global.summary", true, {
    summary: JSON.stringify(globalSummary.counts),
    data: globalSummary,
  })

  if (!args.keepSession) {
    const deleted = await request(`/session/${encodeURIComponent(sessionID)}`, {
      method: "DELETE",
      query: { directory: workspace },
    })
    record("session.delete", deleted.data === true, { summary: `deleted=${deleted.data}` })
  } else {
    record("session.keep", true, { summary: sessionID })
  }
}

async function writeReport() {
  const safeStamp = startedAt.toISOString().replace(/[:.]/g, "-")
  const reportPath = path.join(__dirname, `opencode_prompt_event_probe_result_${safeStamp}.json`)
  const ok = results.every((item) => item.ok)
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ok,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        workspace,
        baseUrl,
        username,
        passwordSet: !!password,
        spawned: !!child,
        pid: child?.pid,
        promptProvided: !!args.prompt,
        keepSession: !!args.keepSession,
        results,
      },
      null,
      2,
    ),
    "utf8",
  )
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
  console.log("OpenCode prompt/event probe")
  console.log(`Workspace: ${workspace}`)
  console.log(`Platform: ${os.platform()} ${os.release()}`)
  console.log(`Prompt mode: ${args.prompt ? "enabled" : "dry-run"}`)

  try {
    await startServer()
    const health = await waitForHealth(30_000)
    record("global.health", health.data?.healthy === true, {
      summary: `version=${health.data?.version || "unknown"}`,
      data: health.data,
    })
    const providers = await request("/provider", { query: { directory: workspace } })
    record("provider.list", !!providers.data?.all, {
      summary: `all=${providers.data?.all?.length || 0} connected=${providers.data?.connected?.length || 0}`,
      connected: providers.data?.connected,
    })
    await runPromptProbe(providers.data)
  } catch (error) {
    record("probe.fatal", false, { error: error?.stack || String(error) })
    process.exitCode = 1
  } finally {
    await writeReport().catch((error) => console.error(`Failed to write report: ${error.stack || error}`))
    await cleanup()
  }
}

main()