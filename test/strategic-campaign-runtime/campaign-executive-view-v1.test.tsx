import assert from "node:assert/strict";
import test from "node:test";

import type { CampaignEventLinkResultV1 } from "../../src/lib/strategic-campaign-runtime/campaign-event-linker-v1";
import {
  projectCampaignExecutiveViewV1,
  type CampaignExecutiveViewInputV1
} from "../../src/lib/strategic-campaign-runtime/campaign-executive-view-v1";
import {
  createCampaignSteeringSnapshotV1,
  waitCampaignV1,
  type CampaignSteeringSnapshotV1
} from "../../src/lib/strategic-campaign-runtime/campaign-steering-v1";
import type { CampaignWorkflowTaskV1 } from "../../src/lib/strategic-campaign-runtime/campaign-workflow-adapter-v1";
import {
  createLongHorizonGoalRunV1,
  transitionGoalRunV1,
  type LongHorizonGoalRunV1
} from "../../src/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";

function draftRun(): LongHorizonGoalRunV1 {
  return createLongHorizonGoalRunV1({
    owner: "JEEVES",
    objective: "Secure one differentiated 2027 strategic partnership.",
    initialPlan: ["research-rights", "prepare-structure", "prepare-outreach"],
    successConditions: [{ metric: "verified-partnerships", operator: "gte", value: 1 }],
    killConditions: [{ metric: "rights-blocked", operator: "gte", value: 1 }],
    sourceRef: "strategy:partnership-2027",
    createdAt: "2026-09-01T00:00:00.000Z"
  });
}

function activeSnapshot(): CampaignSteeringSnapshotV1 {
  const active = transitionGoalRunV1(draftRun(), "ACTIVE", {
    actor: "JEEVES",
    at: "2026-09-02T00:00:00.000Z",
    reason: "Campaign approved for bounded preparation."
  });
  return createCampaignSteeringSnapshotV1(active, ["research-rights"]);
}

function workflowTask(overrides: Partial<CampaignWorkflowTaskV1> = {}): CampaignWorkflowTaskV1 {
  const snapshot = activeSnapshot();
  return {
    contractVersion: "CampaignWorkflowTaskV1",
    taskId: "campaign_step_prepare_structure",
    idempotencyKey: "idempotency-prepare-structure",
    campaignId: snapshot.run.id,
    planVersion: snapshot.run.planVersion,
    campaignObjective: snapshot.run.objective,
    stepId: "prepare-structure",
    stepObjective: "Prepare a bounded partnership structure for review.",
    evidenceRefs: ["evidence:structure"],
    allowedActions: ["DRAFT_INTERNAL"],
    forbiddenActions: ["SEND_EXTERNAL"],
    approvalClass: "NONE",
    dependencyIds: [],
    validationChecks: ["rights-current"],
    expectedCompletionEvidence: ["draft-ready"],
    bounds: {
      timeoutSeconds: 300,
      maxCostUsd: 0,
      maxAttempts: 1,
      blastRadius: "PURE"
    },
    requestedCampaignOutcome: "CONTINUE",
    externalSideEffectsPerformed: false,
    ...overrides
  };
}

function eventLink(overrides: Partial<CampaignEventLinkResultV1> = {}): CampaignEventLinkResultV1 {
  const snapshot = activeSnapshot();
  return {
    contractVersion: "CampaignEventLinkResultV1",
    disposition: "UPDATE_EXISTING",
    campaignId: snapshot.run.id,
    eventId: "event-material-1",
    eventFingerprint: "fingerprint-material-1",
    sourceRef: "crm:opportunity-1",
    evidenceRefs: ["evidence:event-1"],
    relationship: null,
    materialChange: "Decision maker and planning window were newly verified.",
    steeringWake: null,
    outboundApproval: null,
    primaryPathPreserved: true,
    authorityExpanded: false,
    duplicateCampaignCreated: false,
    duplicateOutreachCreated: false,
    externalSideEffects: 0,
    writesPerformed: 0,
    ...overrides
  };
}

function input(overrides: Partial<CampaignExecutiveViewInputV1> = {}): CampaignExecutiveViewInputV1 {
  const snapshot = activeSnapshot();
  return {
    snapshot,
    evaluatedAt: "2026-09-18T06:00:00.000Z",
    campaignTruthState: "CURRENT",
    evidence: [
      {
        evidenceRef: "evidence:newest",
        summary: "A canonical source verified the current planning window.",
        truthState: "CURRENT",
        observedAt: "2026-09-17T20:00:00.000Z"
      }
    ],
    accessPaths: [
      {
        pathId: "path-primary",
        relationshipRef: "relationship:champion-1",
        label: "Known champion to partnership lead",
        isPrimary: true,
        authority: ["INTRODUCE"],
        truthState: "CURRENT",
        evidenceRefs: ["evidence:path-primary"]
      },
      {
        pathId: "path-alternate",
        relationshipRef: "relationship:alternate-1",
        label: "Alternate research path",
        isPrimary: false,
        authority: [],
        truthState: "UNKNOWN",
        evidenceRefs: ["evidence:path-alternate"]
      }
    ],
    workflowTasks: [workflowTask()],
    eventLinks: [eventLink()],
    leadingIndicators: [
      {
        metricRef: "metric:verified-decision-maker",
        label: "Verified decision maker",
        truthState: "CURRENT",
        value: 1,
        unit: "count",
        evidenceRefs: ["evidence:decision-maker"]
      }
    ],
    previousMaterialFingerprint: null,
    ...overrides
  };
}

test("projects one concise active campaign view with exact drill-down lineage", () => {
  const result = projectCampaignExecutiveViewV1(input());

  assert.equal(result.executiveStatus, "ACTIVE");
  assert.equal(result.trajectory, "ADVANCING");
  assert.equal(result.health, "HEALTHY");
  assert.deepEqual(result.currentPlan.pendingStepIds, ["prepare-structure", "prepare-outreach"]);
  assert.equal(result.nextBestStep, "prepare-structure");
  assert.equal(result.accessPaths[0].pathId, "path-primary");
  assert.deepEqual(result.accessPaths[0].authority, ["INTRODUCE"]);
  assert.equal(result.accessPaths[1].truthState, "UNKNOWN");
  assert.deepEqual(result.accessPaths[1].authority, []);
  assert.equal(result.newestMaterialEvidence?.evidenceRef, "evidence:newest");
  assert.ok(result.drilldown.evidenceRefs.includes("evidence:event-1"));
  assert.ok(result.drilldown.eventRefs.includes("event:event-material-1"));
});

test("waiting campaign exposes reason and wake condition without inventing a next action", () => {
  const waiting = waitCampaignV1(activeSnapshot(), {
    actor: "JEEVES",
    at: "2026-09-10T00:00:00.000Z",
    reason: "Waiting for partner legal review.",
    wakeClass: "DEPENDENCY",
    triggerValue: "partner-legal-response",
    reviewAt: "2026-09-20T00:00:00.000Z"
  });
  const result = projectCampaignExecutiveViewV1(
    input({ snapshot: waiting, workflowTasks: [], eventLinks: [] })
  );

  assert.equal(result.executiveStatus, "WAITING");
  assert.equal(result.trajectory, "WAITING");
  assert.equal(result.health, "WAITING");
  assert.equal(result.waitOrBlockReason, "Waiting for partner legal review.");
  assert.equal(result.nextWakeCondition, "ON_DEPENDENCY:partner-legal-response");
  assert.equal(result.nextBestStep, null);
});

test("prepared consequential work derives BLOCKED_APPROVAL without weakening approval authority", () => {
  const snapshot = activeSnapshot();
  const approvalTask = workflowTask({
    campaignId: snapshot.run.id,
    planVersion: snapshot.run.planVersion,
    taskId: "campaign_step_prepare_outreach",
    stepId: "prepare-outreach",
    approvalClass: "KEEGAN",
    evidenceRefs: ["evidence:outreach-draft"]
  });
  const result = projectCampaignExecutiveViewV1(
    input({ snapshot, workflowTasks: [approvalTask], eventLinks: [] })
  );

  assert.equal(result.executiveStatus, "BLOCKED_APPROVAL");
  assert.equal(result.trajectory, "BLOCKED");
  assert.equal(result.health, "BLOCKED");
  assert.equal(result.approvalsNeeded.length, 1);
  assert.equal(result.approvalsNeeded[0].approvalClass, "KEEGAN");
  assert.equal(result.nextBestStep, null);
  assert.equal(result.actionAuthority.approvalBypassAuthorized, false);
  assert.equal(result.actionAuthority.externalActionAuthorized, false);
});

test("stale truth remains visibly stale rather than becoming confidence", () => {
  const result = projectCampaignExecutiveViewV1(
    input({
      campaignTruthState: "STALE",
      evidence: [
        {
          evidenceRef: "evidence:old",
          summary: "This evidence is old and needs refresh.",
          truthState: "STALE",
          observedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      leadingIndicators: [
        {
          metricRef: "metric:stale",
          label: "Stale metric",
          truthState: "STALE",
          value: 2,
          unit: "count",
          evidenceRefs: ["evidence:old"]
        },
        {
          metricRef: "metric:unknown",
          label: "Unknown metric",
          truthState: "UNKNOWN",
          value: 99,
          unit: "count",
          evidenceRefs: []
        }
      ],
      eventLinks: []
    })
  );

  assert.equal(result.truthState, "STALE");
  assert.equal(result.health, "STALE");
  assert.equal(result.leadingIndicators.find((item) => item.metricRef === "metric:stale")?.value, 2);
  assert.equal(result.leadingIndicators.find((item) => item.metricRef === "metric:unknown")?.value, null);
  assert.ok(result.materialDelta?.reasons.includes("TRUTH_STALE"));
});

test("terminal success and kill outcomes remain explicit and stop proposing next work", () => {
  const active = activeSnapshot().run;
  const succeeded = transitionGoalRunV1(active, "SUCCEEDED", {
    actor: "JEEVES",
    at: "2026-09-15T00:00:00.000Z",
    reason: "Verified success condition satisfied."
  });
  const successView = projectCampaignExecutiveViewV1(
    input({
      snapshot: createCampaignSteeringSnapshotV1(succeeded, ["research-rights", "prepare-structure", "prepare-outreach"]),
      workflowTasks: [],
      eventLinks: []
    })
  );
  assert.equal(successView.executiveStatus, "SUCCEEDED");
  assert.deepEqual(successView.closedOutcome, {
    state: "SUCCEEDED",
    reason: "Verified success condition satisfied."
  });
  assert.equal(successView.nextBestStep, null);
  assert.equal(successView.health, "TERMINAL");

  const killed = transitionGoalRunV1(active, "KILLED", {
    actor: "JEEVES",
    at: "2026-09-15T00:00:00.000Z",
    reason: "Verified rights condition makes the campaign non-viable."
  });
  const killedView = projectCampaignExecutiveViewV1(
    input({ snapshot: createCampaignSteeringSnapshotV1(killed), workflowTasks: [], eventLinks: [] })
  );
  assert.equal(killedView.executiveStatus, "KILLED");
  assert.equal(killedView.closedOutcome?.state, "KILLED");
  assert.equal(killedView.nextBestStep, null);
});

test("emits a material event once, then suppresses an identical executive delta", () => {
  const first = projectCampaignExecutiveViewV1(input());
  assert.ok(first.materialDelta);
  assert.deepEqual(first.materialDelta?.eventIds, ["event-material-1"]);

  const second = projectCampaignExecutiveViewV1(
    input({ previousMaterialFingerprint: first.materialFingerprint })
  );
  assert.equal(second.materialDelta, null);
  assert.equal(second.materialFingerprint, first.materialFingerprint);
});

test("no-change and duplicate events stay silent", () => {
  for (const disposition of ["NO_MATERIAL_CHANGE", "DUPLICATE"] as const) {
    const result = projectCampaignExecutiveViewV1(
      input({
        eventLinks: [eventLink({ disposition, materialChange: null })],
        evidence: [],
        accessPaths: [],
        workflowTasks: [],
        leadingIndicators: []
      })
    );
    assert.equal(result.materialDelta, null);
  }
});

test("event approval is visible but cannot imply outreach authority", () => {
  const result = projectCampaignExecutiveViewV1(
    input({
      workflowTasks: [],
      eventLinks: [
        eventLink({
          disposition: "NO_MATERIAL_CHANGE",
          materialChange: null,
          outboundApproval: {
            actionId: "outreach-1",
            approvalClass: "REVIEW",
            approvalRequired: true
          }
        })
      ]
    })
  );

  assert.equal(result.executiveStatus, "BLOCKED_APPROVAL");
  assert.equal(result.approvalsNeeded[0].source, "EVENT");
  assert.equal(result.actionAuthority.outreachAuthorized, false);
});

test("preserves plan-change reason and canonical success/kill condition references", () => {
  const result = projectCampaignExecutiveViewV1(input());

  assert.deepEqual(result.lastPlanChange, {
    version: 1,
    revisedAt: "2026-09-01T00:00:00.000Z",
    reason: "INITIAL_PLAN"
  });
  assert.deepEqual(result.successConditionRefs, ["success:verified-partnerships:gte:1"]);
  assert.deepEqual(result.killCriteriaRefs, ["kill:rights-blocked:gte:1"]);
});

test("ignores workflow tasks and events owned by another campaign instead of cross-contaminating state", () => {
  const result = projectCampaignExecutiveViewV1(
    input({
      workflowTasks: [workflowTask({ campaignId: "campaign-other", approvalClass: "KEEGAN" })],
      eventLinks: [eventLink({ campaignId: "campaign-other" })]
    })
  );

  assert.equal(result.executiveStatus, "ACTIVE");
  assert.deepEqual(result.approvalsNeeded, []);
  assert.deepEqual(result.drilldown.workflowTaskRefs, []);
  assert.deepEqual(result.drilldown.eventRefs, []);
});

test("projection is deterministic, immutable, and performs no mutation or external side effect", () => {
  const request = input();
  const before = structuredClone(request);
  const first = projectCampaignExecutiveViewV1(request);
  const second = projectCampaignExecutiveViewV1(request);

  assert.deepEqual(request, before);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.currentPlan));
  assert.ok(Object.isFrozen(first.accessPaths));
  assert.deepEqual(first.actionAuthority, {
    readOnlyProjection: true,
    campaignMutationAuthorized: false,
    workflowDispatchAuthorized: false,
    externalActionAuthorized: false,
    outreachAuthorized: false,
    approvalBypassAuthorized: false
  });
});
