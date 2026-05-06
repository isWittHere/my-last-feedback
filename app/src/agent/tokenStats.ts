import type { AgentSession } from "./types";
import { collectAgentStepTokenStats, type AgentStepTokenStat } from "./steps";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4.1": 1_000_000,
  "claude-sonnet": 200_000,
};

export interface AgentTokenStatsSummary {
  stats: AgentStepTokenStat[];
  totalTokens: number;
  userTokens: number;
  processTokens: number;
  resultTokens: number;
  contextLimit: number | null;
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

export function getAgentTokenStatsSummary(session: AgentSession): AgentTokenStatsSummary {
  const stats = collectAgentStepTokenStats(session);
  const estimatedTotalTokens = stats.reduce((sum, stat) => sum + stat.tokenCount, 0);
  const totalTokens = session.contextUsage?.usedTokens ?? estimatedTotalTokens;
  const userTokens = stats.filter((stat) => stat.kind === "user").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const resultTokens = stats.filter((stat) => stat.kind === "result").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const processTokens = Math.max(0, (session.contextUsage ? totalTokens : estimatedTotalTokens) - userTokens - resultTokens);
  const contextLimit = getSessionModelContextLimit(session);
  const remainingTokens = contextLimit == null ? null : Math.max(0, contextLimit - totalTokens);
  const usedPercent = contextLimit == null || contextLimit <= 0 ? null : Math.min(100, Math.round((totalTokens / contextLimit) * 1000) / 10);

  return {
    stats,
    totalTokens,
    userTokens,
    processTokens,
    resultTokens,
    contextLimit,
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