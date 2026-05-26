import assert from "node:assert/strict";
import { Orchestrator } from "../mcp/mlra/daemon/orchestrator.mjs";
import { ROLES } from "../mcp/mlra/protocol/roles.mjs";

const certification = {
  originalRequestSatisfied: true,
  stageDirectiveSatisfied: true,
  feedbackResolved: true,
  directVerificationEvidence: "Checked the concrete stage deliverable and review notes directly in the simulated workflow.",
  unresolvedConcerns: "none",
  exitRationale: "The simulated stage has a deliverable, a matching review, and no known unresolved blocker.",
};

const blueprint = {
  version: 1,
  templateId: "direct-execution",
  name: "Simulation",
  description: "",
  initialTask: "Verify orchestration flow",
  globalPolicy: {},
  stages: [
    {
      id: "delivery",
      order: 0,
      icon: "wrench",
      name: "Delivery",
      description: "",
      templateId: "delivery",
      isClosing: false,
      exitGateEnabled: true,
      exitGatePrompt: "",
      promptOverride: "",
      skillRefs: [],
    },
    {
      id: "closing",
      order: 1,
      icon: "flag",
      name: "Closing",
      description: "",
      templateId: "closing",
      isClosing: true,
      exitGateEnabled: false,
      exitGatePrompt: "",
      promptOverride: "",
      skillRefs: [],
    },
  ],
};

function boot(policy, stagePatch = {}) {
  const orchestrator = new Orchestrator();
  orchestrator.onEvent = () => {};
  orchestrator.registerRole(ROLES.EXPERT, { model: "sim" });
  orchestrator.registerRole(ROLES.INSPECTOR, { model: "sim" });
  orchestrator.registerRole(ROLES.CEO, { model: "sim" });
  const scopedBlueprint = {
    ...blueprint,
    stages: blueprint.stages.map((stage, index) => index === 0 ? { ...stage, ...stagePatch } : { ...stage }),
  };
  const started = orchestrator.startOrchestration("Verify orchestration flow", scopedBlueprint, null, policy);
  assert.equal(started.error, undefined);
  return orchestrator;
}

{
  const orchestrator = boot({ preset: "autopilot", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" });
  const expertSubmit = orchestrator.handleExpertSubmit("auto deliverable");
  assert.equal(expertSubmit.action, "route");
  assert.equal(expertSubmit.targetRole, ROLES.INSPECTOR);
  const inspectorSubmit = orchestrator.handleInspectorSubmit("auto review");
  assert.equal(inspectorSubmit.action, "route");
  assert.equal(inspectorSubmit.targetRole, ROLES.EXPERT);
}

{
  const orchestrator = boot({
    preset: "full-review",
    expertSubmit: "user-review",
    inspectorSubmit: "user-review",
    ceoGateTrigger: "user-replaces-ceo",
    ceoVerdict: "auto-release",
  });
  const gate = orchestrator.handleExpertSubmit("deliverable draft");
  assert.equal(gate.action, "human_gate");
  assert.equal(orchestrator.humanGate.kind, "submit_handoff_review");
  const approved = orchestrator.approveHumanGate({ id: orchestrator.humanGate.id, content: "" });
  assert.equal(approved.action, "route");
  assert.equal(approved.targetRole, ROLES.INSPECTOR);
}

{
  const orchestrator = boot({
    preset: "custom",
    expertSubmit: "auto",
    inspectorSubmit: "user-review",
    ceoGateTrigger: "user-replaces-ceo",
    ceoVerdict: "auto-release",
  });
  const expertSubmit = orchestrator.handleExpertSubmit("deliverable for manual inspector return");
  assert.equal(expertSubmit.action, "route");
  const inspectorGate = orchestrator.handleInspectorSubmit("editable inspector review");
  assert.equal(inspectorGate.action, "human_gate");
  assert.equal(orchestrator.humanGate.kind, "submit_handoff_review");
  const approved = orchestrator.approveHumanGate({ id: orchestrator.humanGate.id, content: "edited inspector review" });
  assert.equal(approved.action, "route");
  assert.equal(approved.targetRole, ROLES.EXPERT);
}

{
  const orchestrator = boot({
    preset: "full-review",
    expertSubmit: "user-review",
    inspectorSubmit: "user-review",
    ceoGateTrigger: "user-replaces-ceo",
    ceoVerdict: "auto-release",
  });
  orchestrator.handleExpertSubmit("draft to reject");
  const rejected = orchestrator.rejectHumanGate({ id: orchestrator.humanGate.id, reason: "Needs more detail." });
  assert.equal(rejected.action, "route");
  assert.equal(rejected.targetRole, ROLES.EXPERT);
}

{
  const orchestrator = boot({
    preset: "ceo-user",
    expertSubmit: "auto",
    inspectorSubmit: "auto",
    ceoGateTrigger: "user-replaces-ceo",
    ceoVerdict: "auto-release",
  });
  orchestrator.handleExpertSubmit("deliverable ready for review");
  orchestrator.handleInspectorSubmit("review confirms deliverable");
  const firstCertification = orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for exit.", certification);
  assert.equal(firstCertification.action, "certification_recorded");
  const secondCertification = orchestrator.handleInspectorVote("pass", "Independent review confirms the current deliverable satisfies the whole stage.", certification);
  assert.equal(secondCertification.action, "stage_exit_ready");
  const gate = orchestrator.triggerStageExit(secondCertification.materials);
  assert.equal(gate.action, "human_gate");
  assert.equal(orchestrator.humanGate.kind, "stage_exit_gate_trigger");
  const verdict = orchestrator.approveHumanGate({ id: orchestrator.humanGate.id, verdict: "approved", reason: "User approves stage exit." });
  assert.equal(verdict.action, "transition_to_stage");
}

{
  const orchestrator = boot({ preset: "autopilot", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" }, { exitGateEnabled: false });
  orchestrator.handleExpertSubmit("deliverable without gate");
  orchestrator.handleInspectorSubmit("review without gate");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for direct advance.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms direct advance is safe.", certification);
  const advanced = orchestrator.triggerStageExit(ready.materials);
  assert.equal(advanced.action, "transition_to_stage");
}

{
  const orchestrator = boot({ preset: "autopilot", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" });
  orchestrator.handleExpertSubmit("deliverable for ceo approval");
  orchestrator.handleInspectorSubmit("review for ceo approval");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for CEO approval.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms CEO approval path is safe.", certification);
  assert.equal(orchestrator.triggerStageExit(ready.materials).action, "wake_ceo");
  assert.equal(orchestrator.handleCeoVerdict("approved", "First defensive approval.", []).action, "wake_ceo");
  assert.equal(orchestrator.handleCeoVerdict("approved", "Second defensive approval.", []).action, "wake_ceo");
  assert.equal(orchestrator.handleCeoVerdict("approved", "First final confirmation.", []).action, "wake_ceo");
  assert.equal(orchestrator.handleCeoVerdict("approved", "Second final confirmation.", []).action, "transition_to_stage");
}

{
  const orchestrator = boot({ preset: "autopilot", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "auto-release" });
  orchestrator.handleExpertSubmit("deliverable for ceo rejection");
  orchestrator.handleInspectorSubmit("review for ceo rejection");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for CEO rejection test.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms CEO rejection path is safe.", certification);
  orchestrator.triggerStageExit(ready.materials);
  const rejected = orchestrator.handleCeoVerdict("rejected", "Reject to Inspector.", []);
  assert.equal(rejected.action, "route_multiple");
  assert.deepEqual(rejected.targets.map((target) => target.targetRole), [ROLES.INSPECTOR]);
}

{
  const orchestrator = boot({ preset: "ceo-user", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "user-replaces-ceo", ceoVerdict: "auto-release" });
  orchestrator.handleExpertSubmit("deliverable for user gate reject");
  orchestrator.handleInspectorSubmit("review for user gate reject");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for user gate reject.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms user gate rejection path is safe.", certification);
  orchestrator.triggerStageExit(ready.materials);
  const rejected = orchestrator.rejectHumanGate({ id: orchestrator.humanGate.id, reason: "User rejects stage exit." });
  assert.equal(rejected.action, "route_multiple");
  assert.deepEqual(rejected.targets.map((target) => target.targetRole), [ROLES.INSPECTOR]);
}

{
  const orchestrator = boot({
    preset: "ceo-review",
    expertSubmit: "auto",
    inspectorSubmit: "auto",
    ceoGateTrigger: "auto-to-ceo",
    ceoVerdict: "user-review",
  });
  orchestrator.handleExpertSubmit("deliverable ready for ceo");
  orchestrator.handleInspectorSubmit("review confirms ceo material");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for CEO gate.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms the current deliverable satisfies the whole stage.", certification);
  const wakeCeo = orchestrator.triggerStageExit(ready.materials);
  assert.equal(wakeCeo.action, "wake_ceo");
  const blockedVerdict = orchestrator.handleCeoVerdict("approved", "CEO approves after reviewing the materials.", []);
  assert.equal(blockedVerdict.action, "human_gate");
  assert.equal(orchestrator.humanGate.kind, "ceo_verdict_review");
  const releasedVerdict = orchestrator.approveHumanGate({ id: orchestrator.humanGate.id, verdict: "approved", reason: "User confirms CEO verdict." });
  assert.equal(releasedVerdict.action, "wake_ceo");
}

{
  const orchestrator = boot({ preset: "ceo-review", expertSubmit: "auto", inspectorSubmit: "auto", ceoGateTrigger: "auto-to-ceo", ceoVerdict: "user-review" });
  orchestrator.handleExpertSubmit("deliverable for reviewed rejection");
  orchestrator.handleInspectorSubmit("review for reviewed rejection");
  orchestrator.handleExpertVote("pass", "Stage-level evidence is complete and ready for reviewed rejection.", certification);
  const ready = orchestrator.handleInspectorVote("pass", "Independent review confirms reviewed rejection path is safe.", certification);
  orchestrator.triggerStageExit(ready.materials);
  const blockedVerdict = orchestrator.handleCeoVerdict("rejected", "CEO proposes rejection.", [ROLES.INSPECTOR]);
  assert.equal(blockedVerdict.action, "human_gate");
  const released = orchestrator.approveHumanGate({ id: orchestrator.humanGate.id, verdict: "rejected", reason: "User edits and confirms rejection.", targets: [ROLES.INSPECTOR] });
  assert.equal(released.action, "route_multiple");
  assert.deepEqual(released.targets.map((target) => target.targetRole), [ROLES.INSPECTOR]);
}

{
  const orchestrator = boot({ preset: "full-review", expertSubmit: "user-review", inspectorSubmit: "user-review", ceoGateTrigger: "user-replaces-ceo", ceoVerdict: "auto-release" });
  orchestrator.handleExpertSubmit("draft to cancel");
  const cancelled = orchestrator.cancelHumanGate({ id: orchestrator.humanGate.id, reason: "Cancel current gate." });
  assert.equal(cancelled.action, "route");
  assert.equal(cancelled.targetRole, ROLES.EXPERT);
  assert.equal(orchestrator.humanGate, null);
}

console.log("mlra human gate simulation passed");