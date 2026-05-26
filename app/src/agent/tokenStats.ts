import type { AgentSession } from "./types";
import { collectAgentStepTokenStats, type AgentStepTokenStat } from "./steps";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4.1": 1_000_000,
  "claude-sonnet": 200_000,
};

const OPENCODE_COMPACTION_BUFFER = 20_000;
const OPENCODE_OUTPUT_TOKEN_MAX = 32_000;

export interface AgentTokenStatsSummary {
  stats: AgentStepTokenStat[];
  totalTokens: number;
  contextTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  userTokens: number;
  processTokens: number;
  resultTokens: number;
  contextLimit: number | null;
  reservedTokens: number | null;
  usableLimit: number | null;
  usableRemainingTokens: number | null;
  maxOutputTokens: number | null;
  compactionAuto: boolean | null;
  remainingTokens: number | null;
  usedPercent: number | null;
  estimated: boolean;
}

export function getAgentModelContextLimit(modelId?: string): number | null {
  if (!modelId) return null;
  return MODEL_CONTEXT_LIMITS[modelId] ?? null;
}

function getSessionModelContextLimit(session: AgentSession): number | null {
  if (session.contextUsage?.contextLimit) return session.contextUsage.contextLimit;
  const modelContextLimit = session.availableModels?.find((model) => model.id === session.modelId)?.contextLimit;
  return modelContextLimit ?? getAgentModelContextLimit(session.modelId);
}

function getSessionModelOption(session: AgentSession) {
  return session.modelId ? session.availableModels?.find((model) => model.id === session.modelId) : undefined;
}

function getOpenCodeMaxOutputTokens(outputLimit: number | undefined): number {
  return Math.min(outputLimit ?? OPENCODE_OUTPUT_TOKEN_MAX, OPENCODE_OUTPUT_TOKEN_MAX) || OPENCODE_OUTPUT_TOKEN_MAX;
}

function getOpenCodeCompactionBudget(session: AgentSession, contextLimit: number | null) {
  if (contextLimit == null || contextLimit <= 0) {
    return {
      reservedTokens: null,
      usableLimit: null,
      usableRemainingTokens: null,
      maxOutputTokens: null,
      compactionAuto: session.contextCompaction?.auto ?? null,
    };
  }
  const model = getSessionModelOption(session);
  const maxOutputTokens = getOpenCodeMaxOutputTokens(model?.outputLimit);
  const reservedTokens = model?.inputLimit
    ? session.contextCompaction?.reservedTokens ?? Math.min(OPENCODE_COMPACTION_BUFFER, maxOutputTokens)
    : maxOutputTokens;
  const usableLimit = model?.inputLimit
    ? Math.max(0, model.inputLimit - reservedTokens)
    : Math.max(0, contextLimit - maxOutputTokens);
  return {
    reservedTokens: Math.min(contextLimit, reservedTokens),
    usableLimit: Math.min(contextLimit, usableLimit),
    usableRemainingTokens: null,
    maxOutputTokens,
    compactionAuto: session.contextCompaction?.auto ?? null,
  };
}

export function getAgentTokenStatsSummary(session: AgentSession): AgentTokenStatsSummary {
  const stats = collectAgentStepTokenStats(session);
  const estimatedTotalTokens = stats.reduce((sum, stat) => sum + stat.tokenCount, 0);
  const measuredTotalTokens = session.contextUsage?.totalTokens ?? session.contextUsage?.usedTokens;
  const totalTokens = measuredTotalTokens ?? estimatedTotalTokens;
  const estimatedUserTokens = stats.filter((stat) => stat.kind === "user").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const estimatedResultTokens = stats.filter((stat) => stat.kind === "result").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const estimatedProcessTokens = Math.max(0, estimatedTotalTokens - estimatedUserTokens - estimatedResultTokens);
  const scale = measuredTotalTokens && estimatedTotalTokens > 0 ? measuredTotalTokens / estimatedTotalTokens : 1;
  const userTokens = Math.round(estimatedUserTokens * scale);
  const resultTokens = Math.round(estimatedResultTokens * scale);
  const processTokens = measuredTotalTokens
    ? Math.max(0, totalTokens - userTokens - resultTokens)
    : estimatedProcessTokens;
  const contextLimit = getSessionModelContextLimit(session);
  const remainingTokens = contextLimit == null ? null : Math.max(0, contextLimit - totalTokens);
  const usedPercent = contextLimit == null || contextLimit <= 0 ? null : Math.min(100, Math.round((totalTokens / contextLimit) * 1000) / 10);
  const compactionBudget = getOpenCodeCompactionBudget(session, contextLimit);
  const usableRemainingTokens = compactionBudget.usableLimit == null ? null : Math.max(0, compactionBudget.usableLimit - totalTokens);

  return {
    stats,
    totalTokens,
    contextTokens: session.contextUsage?.contextTokens ?? null,
    inputTokens: session.contextUsage?.inputTokens ?? null,
    outputTokens: session.contextUsage?.outputTokens ?? null,
    reasoningTokens: session.contextUsage?.reasoningTokens ?? null,
    cacheReadTokens: session.contextUsage?.cacheReadTokens ?? null,
    cacheWriteTokens: session.contextUsage?.cacheWriteTokens ?? null,
    userTokens,
    processTokens,
    resultTokens,
    contextLimit,
    reservedTokens: compactionBudget.reservedTokens,
    usableLimit: compactionBudget.usableLimit,
    usableRemainingTokens,
    maxOutputTokens: compactionBudget.maxOutputTokens,
    compactionAuto: compactionBudget.compactionAuto,
    remainingTokens,
    usedPercent,
    estimated: session.contextUsage ? false : stats.some((stat) => stat.estimated),
  };
}

export function formatCompactTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  return count.toLocaleString();
}