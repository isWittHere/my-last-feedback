#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const env = process.env;

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function pathExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function splitPathList(value) {
  return String(value || "")
    .split(path.delimiter)
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function executableNames(baseName) {
  if (!isWindows) return [baseName];
  const pathext = splitPathList(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").map((item) => item.toLowerCase());
  const extensions = unique(["", ".exe", ".cmd", ".bat", ".ps1", ...pathext]);
  return extensions.map((ext) => baseName.toLowerCase().endsWith(ext) ? baseName : `${baseName}${ext}`);
}

function findOnPath(commandName) {
  const pathDirs = splitPathList(env.PATH || env.Path || "");
  const names = executableNames(commandName);
  const matches = [];
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (pathExists(candidate)) matches.push(candidate);
    }
  }
  return unique(matches);
}

function commonCandidates() {
  const home = os.homedir();
  const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const programData = env.ProgramData || "C:\\ProgramData";
  if (!isWindows) {
    return [
      "/usr/local/bin/opencode",
      "/opt/homebrew/bin/opencode",
      path.join(home, ".local", "bin", "opencode"),
      path.join(home, ".bun", "bin", "opencode"),
    ];
  }
  return [
    path.join(appData, "npm", "opencode.cmd"),
    path.join(appData, "npm", "opencode.exe"),
    path.join(appData, "npm", "node_modules", ".bin", "opencode.cmd"),
    path.join(localAppData, "pnpm", "opencode.cmd"),
    path.join(localAppData, "Programs", "opencode", "opencode.exe"),
    path.join(localAppData, "opencode", "opencode.exe"),
    path.join(home, ".bun", "bin", "opencode.exe"),
    path.join(home, ".bun", "bin", "opencode.cmd"),
    path.join(home, ".opencode", "bin", "opencode.exe"),
    path.join(home, "scoop", "shims", "opencode.exe"),
    path.join(home, "scoop", "shims", "opencode.cmd"),
    path.join(programData, "chocolatey", "bin", "opencode.exe"),
    path.join(programData, "chocolatey", "bin", "opencode.cmd"),
  ];
}

function shellCommandForDisplay(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? `"${part}"` : part).join(" ");
}

function commandForCandidate(filePath, extraArgs) {
  const lower = filePath.toLowerCase();
  if (isWindows && (lower.endsWith(".cmd") || lower.endsWith(".bat"))) {
    return {
      command: "cmd.exe",
      args: ["/d", "/c", `"${filePath}" ${extraArgs.map((arg) => `"${arg}"`).join(" ")}`],
      note: "Windows cmd shim via cmd.exe",
    };
  }
  if (isWindows && lower.endsWith(".ps1")) {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", filePath, ...extraArgs],
      note: "PowerShell shim via powershell.exe",
    };
  }
  return { command: filePath, args: extraArgs, note: "direct executable" };
}

function npmShimNodeTarget(filePath) {
  if (!isWindows || !filePath.toLowerCase().endsWith(".cmd")) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/"%dp0%\\([^"\r\n]+)"\s+%\*/i);
    if (!match) return null;
    const baseDir = path.dirname(filePath);
    const scriptPath = path.join(baseDir, match[1]);
    return pathExists(scriptPath) ? scriptPath : null;
  } catch {
    return null;
  }
}

function verifyCandidate(filePath) {
  const launch = commandForCandidate(filePath, ["--version"]);
  const result = spawnSync(launch.command, launch.args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  return {
    launch,
    ok: result.status === 0,
    status: result.status,
    error: result.error ? result.error.message : "",
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function verifyNodeTarget(scriptPath) {
  const launch = {
    command: "node",
    args: [scriptPath, "--version"],
    note: "npm shim target via node",
  };
  const result = spawnSync(launch.command, launch.args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  return {
    launch,
    ok: result.status === 0,
    status: result.status,
    error: result.error ? result.error.message : "",
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function printSection(title) {
  console.log(`\n## ${title}`);
}

console.log("# ACP OpenCode Executable Probe");
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Node: ${process.version}`);
console.log(`CWD: ${process.cwd()}`);

printSection("Environment hints");
console.log(`OPENCODE_PATH=${env.OPENCODE_PATH || ""}`);
console.log(`MLFB_OPENCODE_PATH=${env.MLFB_OPENCODE_PATH || ""}`);
console.log(`PATH entries=${splitPathList(env.PATH || env.Path || "").length}`);

const explicitCandidates = [env.MLFB_OPENCODE_PATH, env.OPENCODE_PATH].filter(Boolean);
const pathMatches = findOnPath("opencode");
const commonMatches = commonCandidates().filter(pathExists);
const allMatches = unique([...explicitCandidates, ...pathMatches, ...commonMatches]);
const nodeTargets = unique(allMatches.map(npmShimNodeTarget).filter(Boolean));

printSection("Matches");
if (allMatches.length === 0) {
  console.log("No OpenCode executable was found in PATH or common install locations.");
} else {
  allMatches.forEach((candidate, index) => {
    console.log(`${index + 1}. ${candidate}`);
  });
}

printSection("Verification");
if (allMatches.length === 0) {
  console.log("Skipped: no candidate found.");
} else {
  for (const candidate of allMatches) {
    const result = verifyCandidate(candidate);
    const nodeTarget = npmShimNodeTarget(candidate);
    console.log(`\n${candidate}`);
    console.log(`  launch=${shellCommandForDisplay(result.launch.command, result.launch.args)}`);
    console.log(`  note=${result.launch.note}`);
    if (nodeTarget) console.log(`  nodeTarget=${nodeTarget}`);
    console.log(`  ok=${result.ok} status=${result.status ?? ""}`);
    if (result.stdout) console.log(`  stdout=${result.stdout}`);
    if (result.stderr) console.log(`  stderr=${result.stderr}`);
    if (result.error) console.log(`  error=${result.error}`);
  }
}

if (nodeTargets.length > 0) {
  printSection("Derived Node targets");
  for (const scriptPath of nodeTargets) {
    const result = verifyNodeTarget(scriptPath);
    console.log(`\n${scriptPath}`);
    console.log(`  launch=${shellCommandForDisplay(result.launch.command, result.launch.args)}`);
    console.log(`  note=${result.launch.note}`);
    console.log(`  ok=${result.ok} status=${result.status ?? ""}`);
    if (result.stdout) console.log(`  stdout=${result.stdout}`);
    if (result.stderr) console.log(`  stderr=${result.stderr}`);
    if (result.error) console.log(`  error=${result.error}`);
  }
}

printSection("Recommendation");
const verifiedNodeTarget = nodeTargets.find((candidate) => verifyNodeTarget(candidate).ok);
const verified = allMatches.find((candidate) => verifyCandidate(candidate).ok);
if (verifiedNodeTarget) {
  console.log(`Best no-shell launch for MLFB: node "${verifiedNodeTarget}" acp`);
  console.log("This keeps ACP on ordinary stdin/stdout pipes and avoids PTY/xterm and shell command lookup.");
} else if (verified) {
  const nodeTarget = npmShimNodeTarget(verified);
  console.log(`Use this absolute executable path in MLFB: ${verified}`);
  const launch = commandForCandidate(verified, ["acp"]);
  console.log(`Verified launch shape for ACP: ${shellCommandForDisplay(launch.command, launch.args)}`);
  if (nodeTarget) {
    console.log(`Lower-level no-shell alternative: node "${nodeTarget}" acp`);
  }
  console.log("If Tauri cannot resolve plain `opencode`, use the verified launch shape above instead of `Command::new(\"opencode\")`.");
} else if (allMatches.length > 0) {
  console.log("Candidates exist but none returned a successful `--version`. Inspect the verification errors above.");
} else {
  console.log("Install OpenCode or add its executable directory to the environment PATH visible to the Tauri app.");
  console.log("On Windows, npm global installs are commonly under %APPDATA%\\npm, and GUI apps may not inherit shell profile PATH updates.");
}