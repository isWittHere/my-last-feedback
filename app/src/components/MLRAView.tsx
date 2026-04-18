import { useMLRAStore } from "../store/mlraStore";
import { LauncherHome } from "./LauncherHome";
import { LauncherSidebar } from "./LauncherSidebar";
import { AgentColumn } from "./AgentColumn";
// import { WorkerPoolColumn } from "./WorkerPoolColumn"; // Dormant: hidden while WORKER_ENABLED=false on backend

type MainAgentRole = "planning-expert" | "planning-inspector" | "execution-expert" | "execution-inspector" | "ceo";

/**
 * MLRA root view component.
 * - When launcher is not running: renders the unified LauncherHome page
 *   (it handles both the "create" and "configure" states internally).
 * - When launcher is running/paused: renders the multi-column workspace.
 * (Worker Pool column is dormant; see mlra-server/feature-flags.mjs)
 */
export function MLRAView() {
  const activeLauncher = useMLRAStore((s) => s.getActiveLauncher());
  const launcherSidebarOpen = useMLRAStore((s) => s.launcherSidebarOpen);
  const toggleSidebar = useMLRAStore((s) => s.toggleLauncherSidebar);
  const phaseView = useMLRAStore((s) => s.phaseView);

  // Show phase-specific agent pair + CEO (3 columns while workers are dormant)
  const phaseRoles: MainAgentRole[] = phaseView === "planning"
    ? ["planning-expert", "planning-inspector", "ceo"]
    : ["execution-expert", "execution-inspector", "ceo"];

  const isActive = activeLauncher?.status === "running" || activeLauncher?.status === "paused";

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Launcher sidebar overlay */}
      {launcherSidebarOpen && (
        <LauncherSidebar onClose={() => toggleSidebar()} />
      )}

      {/* Main content area — single unified launcher page, or running workspace */}
      {isActive ? (
        <div className="mlra-workspace">
          {phaseRoles.map((role) => (
            <AgentColumn key={role} role={role} />
          ))}
        </div>
      ) : (
        <LauncherHome launcher={activeLauncher ?? null} />
      )}
    </div>
  );
}
