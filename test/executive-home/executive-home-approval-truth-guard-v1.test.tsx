import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  enforceExecutiveApprovalTruthV1,
  evaluateExecutiveApprovalEvidenceV1
} from "@/lib/executive-home/approval-truth-guard-v1";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

function overview(input: {
  actionQueueCount?: number;
  bottleneckCount?: number;
} = {}): DashboardOverviewResponse {
  return {
    ...(input.actionQueueCount === undefined
      ? {}
      : {
          actionQueue: {
            needsApprovalTasks: {
              label: "Approvals",
              count: input.actionQueueCount,
              items: []
            }
          }
        }),
    ...(input.bottleneckCount === undefined
      ? {}
      : {
          approvalBottlenecks: {
            pendingCount: input.bottleneckCount,
            oldestPendingHours: null,
            tasks: []
          }
        })
  } as unknown as DashboardOverviewResponse;
}

function projection() {
  return { home: structuredClone(EXECUTIVE_HOME_FIXTURE_V1) };
}

test("missing approval evidence stays UNKNOWN instead of becoming a false clear queue", () => {
  const source = projection();
  const sourceBefore = structuredClone(source);
  const result = enforceExecutiveApprovalTruthV1(source, overview());

  const card = result.home.cards.find((item) => item.section === "KEEGAN_ACTION_REQUIRED");
  const kpi = result.home.command_center.kpis.find((item) => item.id === "keegan-review");
  const action = result.home.command_center.keegan_actions.find((item) => item.id === "approval-queue");
  const execution = result.home.command_center.intelligence_engine.find((item) => item.id === "execution");

  assert.equal(card?.state, "UNKNOWN");
  assert.equal(card?.confidence, "UNKNOWN");
  assert.equal(card?.freshness, "UNKNOWN");
  assert.match(card?.summary ?? "", /cannot claim that no Keegan approval is required/i);
  assert.equal(kpi?.truth_state, "UNKNOWN");
  assert.equal(kpi?.value, "Approval status unknown");
  assert.equal(action?.approval_state, "NONE");
  assert.match(action?.detail ?? "", /did not provide a valid approval count/i);
  assert.equal(execution?.truth_state, "UNKNOWN");
  assert.deepEqual(source, sourceBefore);
});

test("disagreeing approval counts fail closed as CONFLICTED and preserve the safer review boundary", () => {
  const result = enforceExecutiveApprovalTruthV1(
    projection(),
    overview({ actionQueueCount: 0, bottleneckCount: 2 })
  );

  const card = result.home.cards.find((item) => item.section === "KEEGAN_ACTION_REQUIRED");
  const kpi = result.home.command_center.kpis.find((item) => item.id === "keegan-review");
  const action = result.home.command_center.keegan_actions.find((item) => item.id === "approval-queue");
  const execution = result.home.command_center.intelligence_engine.find((item) => item.id === "execution");

  assert.equal(card?.state, "CONFLICTED");
  assert.equal(card?.approval_state, "KEEGAN_ACTION_REQUIRED");
  assert.equal(card?.priority, "DO_NOW");
  assert.equal(kpi?.truth_state, "CONFLICTED");
  assert.equal(action?.approval_state, "KEEGAN_ACTION_REQUIRED");
  assert.equal(execution?.truth_state, "CONFLICTED");
  assert.match(card?.evidence.join(" ") ?? "", /actionQueue\.needsApprovalTasks\.count=0/);
  assert.match(card?.evidence.join(" ") ?? "", /approvalBottlenecks\.pendingCount=2/);
});

test("matching or single valid approval evidence is KNOWN and leaves the projection untouched", () => {
  for (const candidate of [
    overview({ actionQueueCount: 0, bottleneckCount: 0 }),
    overview({ actionQueueCount: 3 }),
    overview({ bottleneckCount: 0 })
  ]) {
    const source = projection();
    assert.equal(evaluateExecutiveApprovalEvidenceV1(candidate).state, "KNOWN");
    assert.strictEqual(enforceExecutiveApprovalTruthV1(source, candidate), source);
  }
});

test("invalid counts are not accepted as proof of an empty approval queue", () => {
  assert.equal(
    evaluateExecutiveApprovalEvidenceV1(overview({ actionQueueCount: -1, bottleneckCount: 1.5 })).state,
    "UNKNOWN"
  );
});

test("canonical Executive Home loader applies the final approval truth guard", () => {
  const loader = fs.readFileSync("src/lib/executive-home/executive-home-v3-loader.ts", "utf8");
  assert.match(loader, /enforceExecutiveApprovalTruthV1/);
  assert.match(loader, /return enforceExecutiveApprovalTruthV1\(projection, input\.overview\)/);
  assert.doesNotMatch(loader, /insert\(|update\(|delete\(|upsert\(/);
});
