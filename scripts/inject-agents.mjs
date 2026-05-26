#!/usr/bin/env node

/**
 * MLRA Agent Prompt → VS Code Custom Agent (.agent.md) 注入脚本
 *
 * 将 .mlra/prompts/ 下的 Agent 提示词转换为 VS Code 用户级自定义 Agent。
 * 输出目录: %APPDATA%/Code/User/prompts/ (Windows)
 *
 * 用法: node scripts/inject-agents.mjs [--dry-run] [--force]
 *   --dry-run  仅预览将生成的文件，不实际写入
 *   --force    覆盖已有的 .agent.md 文件
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { platform, env } from "process";

// ──────────────────────────────────────────────────────────────
// Agent 定义映射
// ──────────────────────────────────────────────────────────────

const AGENT_DEFS = [
  {
    source: "expert-planning.md",
    output: "mlra-expert-planning.agent.md",
    name: "Planning Expert",
    description:
      "MLRA planning phase: technical solution architect producing plans and task breakdowns. Use when: planning, designing, architecture, task decomposition.",
    tools: ["read", "search", "web", "todo", "my-last-feedback/*"],
  },
  {
    source: "expert-execution.md",
    output: "mlra-expert-execution.agent.md",
    name: "Execution Expert",
    description:
      "MLRA execution phase: implementation engineer executing approved plans with sub-agent delegation. Use when: implementing, coding, building, delegating tasks.",
    tools: [
      "read",
      "edit",
      "search",
      "execute",
      "todo",
      "agent",
      "my-last-feedback/*",
    ],
  },
  {
    source: "inspector-planning.md",
    output: "mlra-inspector-planning.agent.md",
    name: "Planning Inspector",
    description:
      "MLRA planning phase: plan reviewer checking references, executability, and blockers. Use when: reviewing plans, verifying feasibility.",
    tools: ["read", "search", "todo", "my-last-feedback/*"],
  },
  {
    source: "inspector-execution.md",
    output: "mlra-inspector-execution.agent.md",
    name: "Execution Inspector",
    description:
      "MLRA execution phase: code reviewer verifying correctness, evidence, and regression. Use when: code review, verifying implementation.",
    tools: ["read", "search", "todo", "my-last-feedback/*"],
  },
  {
    source: "ceo.md",
    output: "mlra-ceo.agent.md",
    name: "CEO",
    description:
      "MLRA CEO: strategic decision-maker for plan gates, final verification, and agent arbitration. Use when: approving plans, resolving disputes, final sign-off.",
    tools: ["read", "search", "todo", "my-last-feedback/*"],
  },
  {
    source: "worker.md",
    output: "mlra-worker.agent.md",
    name: "Worker Agent",
    description:
      "MLRA worker: autonomous deep worker executing delegated sub-tasks. Use when: sub-task execution, implementation work.",
    tools: [
      "read",
      "edit",
      "search",
      "execute",
      "todo",
      "my-last-feedback/*",
    ],
  },
  {
    source: "worker-frontend.md",
    output: "mlra-worker-frontend.agent.md",
    name: "Frontend Worker",
    description:
      "MLRA frontend worker: specialized frontend engineer (React, TypeScript, CSS). Use when: UI implementation, component building, frontend tasks.",
    tools: [
      "read",
      "edit",
      "search",
      "execute",
      "todo",
      "my-last-feedback/*",
    ],
  },
  {
    source: "worker-backend.md",
    output: "mlra-worker-backend.agent.md",
    name: "Backend Worker",
    description:
      "MLRA backend worker: specialized backend engineer (Node.js, APIs, databases). Use when: API implementation, backend tasks, database work.",
    tools: [
      "read",
      "edit",
      "search",
      "execute",
      "todo",
      "my-last-feedback/*",
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// 路径解析
// ──────────────────────────────────────────────────────────────

function getOutputDir() {
  if (platform === "win32") {
    const appData = env.APPDATA;
    if (!appData) throw new Error("APPDATA environment variable not set");
    return join(appData, "Code", "User", "prompts");
  } else if (platform === "darwin") {
    return join(
      env.HOME,
      "Library",
      "Application Support",
      "Code",
      "User",
      "prompts"
    );
  } else {
    return join(env.HOME, ".config", "Code", "User", "prompts");
  }
}

const WORKSPACE_ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const PROMPTS_DIR = join(WORKSPACE_ROOT, ".mlra", "prompts");
const OUTPUT_DIR = getOutputDir();

// ──────────────────────────────────────────────────────────────
// 提示词内容处理
// ──────────────────────────────────────────────────────────────

/**
 * 从原始 prompt 文件中提取正文内容。
 * 移除文件头部的标题行和引用描述行（保留从 Identity Override 开始的内容）。
 */
function extractBody(rawContent) {
  const lines = rawContent.split("\n");
  let startIdx = 0;

  // 跳过开头的标题 (# ...) 和引用行 (> ...) 以及空行和分隔线 (---)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("# ") ||
      trimmed.startsWith("> ") ||
      trimmed === "" ||
      trimmed === "---"
    ) {
      startIdx = i + 1;
    } else {
      break;
    }
  }

  return lines.slice(startIdx).join("\n").trim();
}

/**
 * 生成 .agent.md 文件的完整内容
 */
function buildAgentFile(def, body) {
  const toolsStr = JSON.stringify(def.tools);
  const frontmatter = [
    "---",
    `name: "${def.name}"`,
    `description: "${def.description}"`,
    `tools: ${toolsStr}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n${body}\n`;
}

// ──────────────────────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  console.log("MLRA Agent → VS Code Custom Agent 注入工具");
  console.log("─".repeat(50));
  console.log(`源目录:   ${PROMPTS_DIR}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log(`模式:     ${dryRun ? "DRY RUN (不写入)" : force ? "FORCE (覆盖)" : "NORMAL"}`);
  console.log();

  // 确保输出目录存在
  if (!dryRun && !existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✓ 创建输出目录: ${OUTPUT_DIR}`);
  }

  let created = 0;
  let skipped = 0;
  let overwritten = 0;
  const errors = [];

  for (const def of AGENT_DEFS) {
    const srcPath = join(PROMPTS_DIR, def.source);
    const outPath = join(OUTPUT_DIR, def.output);

    // 检查源文件
    if (!existsSync(srcPath)) {
      errors.push(`✗ 源文件不存在: ${srcPath}`);
      continue;
    }

    // 检查是否已存在
    const exists = existsSync(outPath);
    if (exists && !force) {
      console.log(`⊘ 跳过 (已存在): ${def.output}`);
      skipped++;
      continue;
    }

    // 读取源文件并处理
    const raw = readFileSync(srcPath, "utf-8");
    const body = extractBody(raw);
    const content = buildAgentFile(def, body);

    if (dryRun) {
      console.log(`◎ [DRY RUN] 将写入: ${def.output}`);
      console.log(`  - name: ${def.name}`);
      console.log(`  - tools: ${def.tools.join(", ")}`);
      console.log(`  - body: ${body.split("\n").length} lines`);
      console.log();
    } else {
      writeFileSync(outPath, content, "utf-8");
      if (exists) {
        console.log(`⟳ 覆盖: ${def.output}`);
        overwritten++;
      } else {
        console.log(`✓ 创建: ${def.output}`);
        created++;
      }
    }
  }

  // 汇总
  console.log();
  console.log("─".repeat(50));
  if (dryRun) {
    console.log(`DRY RUN 完成. 将创建/更新 ${AGENT_DEFS.length - errors.length} 个 agent 文件.`);
  } else {
    console.log(`完成: 创建 ${created}, 覆盖 ${overwritten}, 跳过 ${skipped}, 错误 ${errors.length}`);
  }

  if (errors.length > 0) {
    console.log();
    errors.forEach((e) => console.log(e));
  }
}

main();
