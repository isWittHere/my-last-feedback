// Phase 4.2c smoke test — daemon integration (no actual TCP/IPC, uses orchestrator API directly)
// Verifies daemon module loads and internal methods work with v2 protocol.

import { Orchestrator } from "../mcp/mlra/daemon/orchestrator.mjs";
import { MessageRouter } from "../mcp/mlra/daemon/router.mjs";
import { MSG } from "../mcp/mlra/protocol/messages.mjs";
import { ROLES, START_MODES } from "../mcp/mlra/protocol/roles.mjs";

let pass = 0, fail = 0;
function t(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 4.2c smoke test ===\n");

// 1. router has no worker methods
const router = new MessageRouter();
t("router has no blockAwaitOrder", typeof router.blockAwaitOrder !== "function");
t("router has no releaseAwaitOrder", typeof router.releaseAwaitOrder !== "function");
t("router has no awaitCallbacks", router.awaitCallbacks === undefined);
t("router.block exists", typeof router.block === "function");
t("router.release exists", typeof router.release === "function");

// 2. MSG has v2 types only
t("MSG.ROLE_HELLO", MSG.ROLE_HELLO === "role_hello");
t("MSG.EXPERT_SUBMIT", MSG.EXPERT_SUBMIT === "expert_submit");
t("MSG.INSPECTOR_SUBMIT", MSG.INSPECTOR_SUBMIT === "inspector_submit");
t("MSG.CEO_VERDICT", MSG.CEO_VERDICT === "ceo_verdict");
t("MSG.MLRA_START", MSG.MLRA_START === "mlra_start");
t("no MSG.AGENT_REGISTER", MSG.AGENT_REGISTER === undefined);
t("no MSG.AGENT_SUBMIT", MSG.AGENT_SUBMIT === undefined);
t("no MSG.WORKER_SUBMIT_FEEDBACK", MSG.WORKER_SUBMIT_FEEDBACK === undefined);

// 3. block + release integration
const o = new Orchestrator();
o.registerRole(ROLES.CEO, { clientName: "test-ceo" });
o.registerRole(ROLES.EXPERT, { clientName: "test-expert" });
o.registerRole(ROLES.INSPECTOR, { clientName: "test-inspector" });

const res = o.startOrchestration("Test workflow", START_MODES.FULL, "coding");
t("startOrchestration returns instructions", Array.isArray(res.instructions));
t("instructions includes expert", res.instructions.some(i => i.role === ROLES.EXPERT));

// 4. async router round-trip
(async () => {
  const p = router.block(ROLES.EXPERT, "submit");
  const released = router.release(ROLES.EXPERT, "hello expert");
  t("router.release returns true when blocked", released === true);
  const got = await p;
  t("router delivered message", got === "hello expert");

  // 5. release when not blocked → queues
  const q = router.release(ROLES.INSPECTOR, "queued msg");
  t("release queues when not blocked", q === false);
  const p2 = router.block(ROLES.INSPECTOR, "submit");
  const got2 = await p2;
  t("queued message delivered on next block", got2 === "queued msg");

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
