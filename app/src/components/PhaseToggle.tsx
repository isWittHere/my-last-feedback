import { useMLRAStore, type PhaseView } from "../store/mlraStore";
import { Icon } from "./Icons";

/**
 * Vertical pill toggle for switching between planning and implementation phases.
 * Only interactive when a launcher is in "running" state.
 */
export function PhaseToggle() {
  const phaseView = useMLRAStore((s) => s.phaseView);
  const setPhaseView = useMLRAStore((s) => s.setPhaseView);
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());

  const isRunning = activeLauncher?.status === "running";

  return (
    <div className="phase-toggle">
      <PhaseButton
        phase="planning"
        label="阶段1:规划"
        icon="search"
        active={phaseView === "planning"}
        disabled={!isRunning}
        onClick={() => setPhaseView("planning")}
      />
      <PhaseButton
        phase="implementation"
        label="阶段2:实施"
        icon="wrench"
        active={phaseView === "implementation"}
        disabled={!isRunning}
        onClick={() => setPhaseView("implementation")}
      />
    </div>
  );
}

function PhaseButton({
  phase,
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  phase: PhaseView;
  label: string;
  icon: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`phase-toggle-btn${active ? ` phase-toggle-active phase-toggle-${phase}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon name={icon} size={10} />
      {label}
    </button>
  );
}
