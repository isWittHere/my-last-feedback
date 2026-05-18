import { useCallback, useState } from "react";
import { useAgentStore } from "../../store/agentStore";

interface QuestionInfo {
  question: string;
  header: string;
  options?: { label: string; description?: string }[];
  multiple?: boolean;
  custom?: boolean;
}

interface AgentQuestionCardProps {
  questions: QuestionInfo[];
  status: "pending" | "running" | "completed" | "failed";
  sessionId?: string;
  requestId?: string;
}

export function AgentQuestionCard({ questions, status, sessionId, requestId }: AgentQuestionCardProps) {
  const isPending = status === "running" || status === "pending";

  if (!questions || questions.length === 0) return null;

  return (
    <div className="agent-process-questions-card">
      <div className="questions-list">
        {questions.map((q, index) => (
          <QuestionItem
            key={index}
            index={index}
            info={q}
            readonly={!isPending}
          />
        ))}
      </div>
      {isPending && requestId && sessionId && (
        <AgentQuestionActions sessionId={sessionId} requestId={requestId} questions={questions} />
      )}
    </div>
  );
}

function QuestionItem({ index, info, readonly }: { index: number; info: QuestionInfo; readonly: boolean }) {
  const label = info.header || info.question;
  const options = info.options || [];
  const hasOptions = options.length > 0;

  return (
    <div className="questions-item">
      <div className="questions-item-header">
        <span className="questions-row-num">{index + 1}</span>
        <span className="questions-label">{label}</span>
        <div className="questions-chips">
          {hasOptions ? options.map((opt, optIndex) => (
            <button key={optIndex} className="questions-chip" disabled>
              {opt.label}
            </button>
          )) : null}
          {readonly && hasOptions ? (
            <span className="questions-no-selection">未选择</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface AgentQuestionActionsProps {
  sessionId: string;
  requestId: string;
  questions: QuestionInfo[];
}

function AgentQuestionActions({ sessionId, requestId, questions }: AgentQuestionActionsProps) {
  const [selectedOptions, setSelectedOptions] = useState<Record<number, Set<number>>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const toggleOption = useCallback((questionIndex: number, optionIndex: number) => {
    setSelectedOptions((prev) => {
      const next = { ...prev };
      const current = new Set(next[questionIndex] || []);
      const q = questions[questionIndex];
      if (q?.multiple) {
        if (current.has(optionIndex)) current.delete(optionIndex);
        else current.add(optionIndex);
      } else {
        if (current.has(optionIndex)) current.delete(optionIndex);
        else current.clear();
        current.add(optionIndex);
      }
      next[questionIndex] = current;
      return next;
    });
  }, [questions]);

  const updateCustomAnswer = useCallback((questionIndex: number, value: string) => {
    setCustomAnswers((prev) => ({ ...prev, [questionIndex]: value }));
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const answers = questions.map((q, qi) => {
        const selected = selectedOptions[qi];
        const opts = selected ? Array.from(selected).map((oi) => q.options?.[oi]?.label || "").filter(Boolean) : [];
        if (q.custom && customAnswers[qi]?.trim()) {
          opts.push(customAnswers[qi].trim());
        }
        return opts;
      });
      const runtime = useAgentStore.getState().sessions.find((s) => s.id === sessionId);
      if (!runtime?.providerRuntime?.baseUrl) throw new Error("No runtime");
      await fetch(`${runtime.providerRuntime.baseUrl}/question/${encodeURIComponent(requestId)}/reply`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${runtime.providerRuntime.username || ""}:`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      });
    } catch (e) {
      console.error("[AgentQuestionCard] Failed to submit:", e);
    } finally {
      setSubmitting(false);
    }
  }, [questions, selectedOptions, customAnswers, sessionId, requestId]);

  const reject = useCallback(async () => {
    setRejecting(true);
    try {
      const runtime = useAgentStore.getState().sessions.find((s) => s.id === sessionId);
      if (!runtime?.providerRuntime?.baseUrl) throw new Error("No runtime");
      await fetch(`${runtime.providerRuntime.baseUrl}/question/${encodeURIComponent(requestId)}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${runtime.providerRuntime.username || ""}:`)}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch (e) {
      console.error("[AgentQuestionCard] Failed to reject:", e);
    } finally {
      setRejecting(false);
    }
  }, [sessionId, requestId]);

  if (questions.length === 0) return null;

  return (
    <div className="agent-process-questions-actions">
      {questions.map((q, qi) => {
        const opts = q.options || [];
        if (opts.length === 0 && !q.custom) return null;
        const selected = selectedOptions[qi] || new Set<number>();
        return (
          <div key={qi} className="questions-item" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
            <div className="questions-item-header">
              <span className="questions-row-num">{qi + 1}</span>
              <span className="questions-label">{q.header || q.question}</span>
              <div className="questions-chips">
                {opts.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    className={`questions-chip${selected.has(oi) ? " active" : ""}`}
                    onClick={() => toggleOption(qi, oi)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {q.custom && (
              <input
                className="questions-input"
                placeholder="输入自定义答案..."
                value={customAnswers[qi] || ""}
                onChange={(e) => updateCustomAnswer(qi, e.currentTarget.value)}
              />
            )}
          </div>
        );
      })}
      <div className="agent-process-questions-actions-bar">
        <button type="button" className="agent-process-questions-submit" onClick={submit} disabled={submitting}>
          {submitting ? "提交中..." : "提交回答"}
        </button>
        <button type="button" className="agent-process-questions-reject" onClick={reject} disabled={rejecting}>
          {rejecting ? "取消中..." : "取消问题"}
        </button>
      </div>
    </div>
  );
}
