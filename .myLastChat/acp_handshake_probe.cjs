const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function findNode() {
  return process.execPath;
}

function candidateOpenCodeScripts() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return [
    path.join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode"),
    path.join(appData, "npm", "node_modules", "opencode", "bin", "opencode"),
  ];
}

function findOpenCodeScript() {
  for (const candidate of candidateOpenCodeScripts()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not find OpenCode npm script");
}

function summarizeSession(result) {
  const models = result?.models?.availableModels || [];
  const modes = result?.modes?.availableModes || [];
  const configOptions = result?.configOptions || [];
  return {
    sessionId: result?.sessionId,
    currentModelId: result?.models?.currentModelId,
    modelCount: models.length,
    modelSamples: models.slice(0, 8).map((item) => ({ modelId: item.modelId, name: item.name })),
    currentModeId: result?.modes?.currentModeId,
    modeCount: modes.length,
    modeSamples: modes.slice(0, 8).map((item) => ({ id: item.id, name: item.name })),
    configOptionCount: configOptions.length,
    configOptions: configOptions.map((item) => ({ id: item.id, category: item.category, type: item.type, currentValue: item.currentValue, optionCount: Array.isArray(item.options) ? item.options.length : 0 })),
  };
}

async function main() {
  const node = findNode();
  const script = findOpenCodeScript();
  const cwd = path.join(process.cwd(), "app", "src-tauri");
  console.log("launch", JSON.stringify({ node, script, cwd }, null, 2));

  const child = spawn(node, [script, "acp"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let nextId = 1;
  const pending = new Map();
  let stdoutBuffer = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    for (;;) {
      const index = stdoutBuffer.indexOf("\n");
      if (index < 0) break;
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        console.log("invalid-json-line", line);
        continue;
      }
      console.log("recv", JSON.stringify(message).slice(0, 600));
      if (Object.prototype.hasOwnProperty.call(message, "id") && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else entry.resolve(message.result);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const trimmed = chunk.trim();
    if (trimmed) console.log("stderr", trimmed.slice(0, 800));
  });

  child.on("exit", (code, signal) => {
    console.log("exit", { code, signal });
  });

  function request(method, params, timeoutMs = 30000) {
    const id = nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    console.log("send", JSON.stringify(message));
    child.stdin.write(`${JSON.stringify(message)}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  }

  try {
    const initialize = await request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { _meta: { "terminal-auth": true } },
      clientInfo: { name: "My Last Feedback Probe", version: "0.0.0" },
    });
    console.log("initialize-summary", JSON.stringify({
      protocolVersion: initialize?.protocolVersion,
      agentInfo: initialize?.agentInfo,
      agentCapabilities: initialize?.agentCapabilities,
      authMethods: initialize?.authMethods,
    }, null, 2));

    const session = await request("session/new", { cwd, mcpServers: [] }, 60000);
    console.log("session-summary", JSON.stringify(summarizeSession(session), null, 2));
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error("probe-error", error);
  process.exitCode = 1;
});
