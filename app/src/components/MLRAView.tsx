import { useEffect, useMemo, useState } from "react";
import { useMLRAStore, type HumanGateState } from "../store/mlraStore";
import { LauncherHome } from "./LauncherHome";
import { LauncherSidebar } from "./LauncherSidebar";
import { AgentColumn } from "./AgentColumn";
import { AppSelect } from "./AppSelect";
import { Icon } from "./Icons";

type MainAgentRole = "expert" | "inspector" | "ceo";

const MAIN_AGENT_ROLES: MainAgentRole[] = ["expert", "inspector", "ceo"];

const HUMAN_GATE_KIND_LABELS: Record<HumanGateState["kind"], string> = {
  submit_handoff_review: "Handoff 审阅",
  stage_exit_gate_trigger: "阶段门控裁定",
  ceo_verdict_review: "CEO verdict 确认",
  closing_feedback: "结束反馈",
};

const VERDICT_OPTIONS = [
  { value: "approved", label: "approved" },
  { value: "rejected", label: "rejected" },
  { value: "arbitration", label: "arbitration" },
];

function HumanGatePanel({ gate }: { gate: HumanGateState }) {
  const daemonApproveHumanGate = useMLRAStore((s) => s.daemonApproveHumanGate);
  const daemonRejectHumanGate = useMLRAStore((s) => s.daemonRejectHumanGate);
  const daemonCancelHumanGate = useMLRAStore((s) => s.daemonCancelHumanGate);
  const [draft, setDraft] = useState(gate.draftContent || gate.originalContent || "");
  const [verdict, setVerdict] = useState(String(gate.metadata?.verdict || "approved"));
  const [reason, setReason] = useState(String(gate.metadata?.reason || gate.draftContent || gate.originalContent || ""));
  const [targets, setTargets] = useState<string[]>(Array.isArray(gate.metadata?.targets) ? gate.metadata.targets.map(String) : ["inspector"]);

  useEffect(() => {
    setDraft(gate.draftContent || gate.originalContent || "");
    setVerdict(String(gate.metadata?.verdict || "approved"));
    setReason(String(gate.metadata?.reason || gate.draftContent || gate.originalContent || ""));
    setTargets(Array.isArray(gate.metadata?.targets) ? gate.metadata.targets.map(String) : ["inspector"]);
  }, [gate.id, gate.draftContent, gate.originalContent, gate.metadata]);

  const isVerdictGate = gate.kind === "stage_exit_gate_trigger" || gate.kind === "ceo_verdict_review";

  return (
    <section className="mlra-human-gate-panel">
      <div className="mlra-human-gate-head">
        <div className="mlra-human-gate-title-block">
          <span className="mlra-human-gate-kind">{HUMAN_GATE_KIND_LABELS[gate.kind]}</span>
          <strong>{gate.title}</strong>
        </div>
        <div className="mlra-human-gate-route">
          {gate.sourceRole}{gate.targetRole ? ` -> ${gate.targetRole}` : ""}
        </div>
      </div>

      {isVerdictGate ? (
        <div className="mlra-human-gate-verdict-grid">
          <label className="mlra-human-gate-field">
            <span>Verdict</span>
            <AppSelect
              className="mlra-human-gate-select"
              value={verdict}
              options={VERDICT_OPTIONS}
              onChange={setVerdict}
              ariaLabel="Verdict"
            />
          </label>
          <label className="mlra-human-gate-field mlra-human-gate-field-wide">
            <span>Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </label>
          <div className="mlra-human-gate-targets">
            <span>Targets</span>
            {(["expert", "inspector", "ceo"] as const).map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={targets.includes(role)}
                  onChange={(event) => {
                    setTargets((current) => event.target.checked
                      ? [...new Set([...current, role])]
                      : current.filter((item) => item !== role));
                  }}
                />
                {role}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <label className="mlra-human-gate-field">
          <span>释放内容</span>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
        </label>
      )}

      <details className="mlra-human-gate-original">
        <summary>
          <Icon name="chevron-down" size={11} className="app-disclosure-icon mlra-human-gate-summary-icon" />
          <span>原始内容</span>
        </summary>
        <pre>{gate.originalContent || "(空)"}</pre>
      </details>

      <div className="mlra-human-gate-actions">
        <button
          className="mlra-human-gate-btn primary"
          onClick={() => daemonApproveHumanGate({ id: gate.id, content: draft, verdict, reason, targets })}
        >
          确认释放
        </button>
        <button
          className="mlra-human-gate-btn"
          onClick={() => daemonRejectHumanGate({ id: gate.id, reason: reason || draft || "用户退回修改。" })}
        >
          退回修改
        </button>
        <button
          className="mlra-human-gate-btn"
          onClick={() => daemonCancelHumanGate({ id: gate.id, reason: reason || "用户取消当前人工门控。" })}
        >
          取消阻塞
        </button>
      </div>
    </section>
  );
}

/**
 * MLRA root view component.
 * - When launcher is not running: renders the unified LauncherHome page
 *   (it handles both the "create" and "configure" states internally).
 * - When launcher is running/paused: renders the multi-column workspace.
 */
export function MLRAView() {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const launcherSidebarOpen = useMLRAStore((s) => s.launcherSidebarOpen);
  const toggleSidebar = useMLRAStore((s) => s.toggleLauncherSidebar);
  const columnOrder = useMLRAStore((s) => s.columnOrder);
  const phaseRoles = useMemo(() => {
    const orderedRoles = columnOrder.filter((role): role is MainAgentRole => MAIN_AGENT_ROLES.includes(role as MainAgentRole));
    return [...orderedRoles, ...MAIN_AGENT_ROLES.filter((role) => !orderedRoles.includes(role))];
  }, [columnOrder]);

  const isActive = activeLauncher?.status === "running" || activeLauncher?.status === "paused" || activeLauncher?.status === "awaiting-user";

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Launcher sidebar overlay */}
      {launcherSidebarOpen && (
        <LauncherSidebar onClose={() => toggleSidebar()} />
      )}

      {/* Main content area — single unified launcher page, or running workspace */}
      {isActive ? (
        <div className="mlra-runtime-shell">
          {activeLauncher?.humanGate?.active ? <HumanGatePanel gate={activeLauncher.humanGate} /> : null}
          <div className="mlra-workspace">
            {phaseRoles.map((role) => (
              <AgentColumn key={role} role={role} />
            ))}
          </div>
        </div>
      ) : (
        <LauncherHome launcher={activeLauncher ?? null} />
      )}
    </div>
  );
}
