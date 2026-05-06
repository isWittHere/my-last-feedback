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

export function getAgentTokenStatsSummary(session: AgentSession): AgentTokenStatsSummary {
  const stats = collectAgentStepTokenStats(session);
  const totalTokens = stats.reduce((sum, stat) => sum + stat.tokenCount, 0);
  const userTokens = stats.filter((stat) => stat.kind === "user").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const resultTokens = stats.filter((stat) => stat.kind === "result").reduce((sum, stat) => sum + stat.tokenCount, 0);
  const processTokens = totalTokens - userTokens - resultTokens;
  const contextLimit = getAgentModelContextLimit(session.modelId);
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
    estimated: stats.some((stat) => stat.estimated),
  };
}

export function formatCompactTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  return count.toLocaleString();
}