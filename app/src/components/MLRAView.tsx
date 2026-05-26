import { useMLRAStore } from "../store/mlraStore";
import { LauncherHome } from "./LauncherHome";
import { LauncherSidebar } from "./LauncherSidebar";
import { AgentColumn } from "./AgentColumn";
import { WorkerPoolColumn } from "./WorkerPoolColumn";

/**
 * MLRA root view component.
 * Shows LauncherHome when configuring, or four-column workspace when running.
 */
export function MLRAView() {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const launcherSidebarOpen = useMLRAStore((s) => s.launcherSidebarOpen);
  const toggleSidebar = useMLRAStore((s) => s.toggleLauncherSidebar);
  const phaseView = useMLRAStore((s) => s.phaseView);

  // Show phase-specific agent pair + CEO + workers (always 4 columns)
  const phaseRoles = phaseView === "planning"
    ? ["planning-expert", "planning-inspector", "ceo", "workers"]
    : ["execution-expert", "execution-inspector", "ceo", "workers"];

  const isActive = activeLauncher?.status === "running" || activeLauncher?.status === "paused";

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Launcher sidebar overlay */}
      {launcherSidebarOpen && (
        <LauncherSidebar onClose={() => toggleSidebar()} />
      )}

      {/* Main content area */}
      {!activeLauncher ? (
        <LauncherHome launcher={null} />
      ) : !isActive ? (
        <LauncherHome launcher={activeLauncher} />
      ) : (
        /* Multi-column workspace */
        <div className="mlra-workspace">
          {phaseRoles.map((role) =>
            role === "workers" ? (
              <WorkerPoolColumn key="workers" />
            ) : (
              <AgentColumn key={role} role={role} />
            )
          )}
        </div>
      )}
    </div>
  );
}
