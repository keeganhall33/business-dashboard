import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import {
  buildExecutiveHomeVisualSummaryV2,
  ExecutiveHomeVisualSummaryV2
} from "@/components/executive-home/ExecutiveHomeVisualSummaryV2";
import {
  EXECUTIVE_HOME_FIXTURE_V1,
  type ExecutiveHomeFixtureV1,
  type ExecutiveIntelligenceCardV1
} from "@/lib/executive-home/fixtures";
import { getExecutiveHomeDecisionRoomDrilldownFixtureV1 } from "./support/decision-room-drilldown-fixture-adapter";

function cloneCard(
  base: ExecutiveIntelligenceCardV1,
  id: string,
  title: string,
  overrides: Partial<ExecutiveIntelligenceCardV1> = {}
): ExecutiveIntelligenceCardV1 {
  return { ...base, id, title, ...overrides };
}

function buildDecisionScanFixture(): ExecutiveHomeFixtureV1 {
  const matters = EXECUTIVE_HOME_FIXTURE_V1.cards.find(
    (card) => card.section === "WHAT_MATTERS_NOW"
  );
  const changed = EXECUTIVE_HOME_FIXTURE_V1.command_center.what_changed[0];
  const opportunity = EXECUTIVE_HOME_FIXTURE_V1.command_center.opportunities[0];
  assert.ok(matters);
  assert.ok(changed);
  assert.ok(opportunity);

  return {
    ...EXECUTIVE_HOME_FIXTURE_V1,
    cards: [
      cloneCard(matters, "approval-1", "Approve one high-value move", {
        approval_state: "KEEGAN_ACTION_REQUIRED",
        priority: "PREPARE",
        next_action: "Approve or decline the bounded move."
      }),
      cloneCard(matters, "approval-2", "Approve second high-value move", {
        approval_state: "KEEGAN_ACTION_REQUIRED",
        priority: "DO_NOW",
        state: "UNKNOWN",
        confidence: "UNKNOWN",
        freshness: "UNKNOWN",
        next_action: "Verify the missing evidence before approval."
      }),
      cloneCard(matters, "do-now-1", "Immediate supported move", {
        priority: "DO_NOW",
        approval_state: "NONE"
      }),
      cloneCard(matters, "do-now-2", "Fourth item must stay below fold", {
        priority: "DO_NOW",
        approval_state: "NONE"
      }),
      ...EXECUTIVE_HOME_FIXTURE_V1.cards
    ],
    command_center: {
      ...EXECUTIVE_HOME_FIXTURE_V1.command_center,
      opportunities: [
        opportunity,
        { ...opportunity, id: "opportunity-2", title: "Second opportunity" },
        { ...opportunity, id: "opportunity-3", title: "Third opportunity", evidence: "STALE" },
        { ...opportunity, id: "opportunity-4", title: "Fourth opportunity stays below fold" }
      ],
      what_changed: [
        changed,
        { ...changed, id: "change-2", label: "Second material change" },
        { ...changed, id: "change-3", label: "Third material change", truth_state: "CONFLICTED" },
        { ...changed, id: "change-4", label: "Fourth change stays below fold" }
      ],
      do_now: [
        ...EXECUTIVE_HOME_FIXTURE_V1.command_center.do_now,
        {
          id: "completed-work",
          label: "Completed work",
          state: "COMPLETED",
          progress: 100,
          detail: "Completed work is not counted as active."
        }
      ]
    }
  };
}

const fixture = buildDecisionScanFixture();
const decisionRoomFixture = getExecutiveHomeDecisionRoomDrilldownFixtureV1();

test("visual decision model enforces three-item budgets with approval-first deterministic ordering", () => {
  const first = buildExecutiveHomeVisualSummaryV2(fixture);
  const second = buildExecutiveHomeVisualSummaryV2(fixture);

  assert.deepEqual(first, second);
  assert.equal(first.needsYouNow.length, 3);
  assert.deepEqual(
    first.needsYouNow.map((card) => card.id),
    ["approval-1", "approval-2", "do-now-1"]
  );
  assert.equal(first.biggestOpportunities.length, 3);
  assert.equal(first.whatChanged.length, 3);
  assert.equal(first.biggestOpportunities.some((item) => item.id === "opportunity-4"), false);
  assert.equal(first.whatChanged.some((item) => item.id === "change-4"), false);
});

test("business pulse is derived from canonical counts and preserves uncertainty without invented economics", () => {
  const model = buildExecutiveHomeVisualSummaryV2(fixture);
  const expectedEvidenceStates = [
    ...fixture.command_center.kpis.map((item) => item.truth_state),
    ...fixture.command_center.opportunities.map((item) => item.evidence)
  ];
  const expectedWatch = expectedEvidenceStates.filter(
    (state) => state === "UNKNOWN" || state === "STALE" || state === "CONFLICTED"
  ).length;

  assert.equal(model.pulse.approvalRequired, 2);
  assert.equal(
    model.pulse.activeWork,
    fixture.command_center.do_now.filter((item) => item.state !== "COMPLETED").length
  );
  assert.equal(model.pulse.opportunityCount, fixture.command_center.opportunities.length);
  assert.equal(model.pulse.evidenceWatch, expectedWatch);
  assert.equal(model.pulse.totalEvidenceSignals, expectedEvidenceStates.length);
  assert.deepEqual(Object.keys(model.pulse).sort(), [
    "activeWork",
    "approvalRequired",
    "evidenceWatch",
    "opportunityCount",
    "totalEvidenceSignals"
  ]);
  assert.equal(model.needsYouNow[1]?.state, "UNKNOWN");
});

test("top scan renders decision-first visual hierarchy with accessible compact evidence treatment", () => {
  const html = renderToString(<ExecutiveHomeVisualSummaryV2 data={fixture} />);

  assert.match(html, /aria-label="Executive decision scan"/);
  assert.match(html, /aria-label="Business pulse"/);
  assert.match(html, />Needs you now</);
  assert.match(html, />Biggest opportunities</);
  assert.match(html, />What changed</);
  assert.match(html, />Evidence pulse</);
  assert.match(html, />APPROVAL</);
  assert.match(html, />UNKNOWN</);
  assert.match(html, />STALE</);
  assert.match(html, /role="img"/);
  assert.match(html, /unknown, stale, or conflicted/);
  assert.doesNotMatch(html, /Fourth item must stay below fold/);
  assert.doesNotMatch(html, /Fourth opportunity stays below fold/);
  assert.doesNotMatch(html, /Fourth change stays below fold/);
  assert.match(html, /grid-cols-2/);
  assert.match(html, /sm:grid-cols-4/);
  assert.match(html, /xl:grid-cols/);
});

test("Executive Home removes visible placeholder and section-pill walls while keeping depth reachable", () => {
  const html = renderToString(<ExecutiveHomeShell data={fixture} decisionRoom={decisionRoomFixture} />);

  assert.match(html, /data-testid="executive-home-visual-summary-v2"/);
  assert.match(html, /data-testid="executive-home-hidden-status-copy"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, />Loading</);
  assert.doesNotMatch(html, />Empty</);
  assert.doesNotMatch(html, />Error</);
  assert.doesNotMatch(html, /aria-label="Executive Home sections"/);
  assert.match(html, /<details/);
  assert.match(html, /Operational detail and specialist signals/);
  assert.match(html, /Supporting intelligence/);
  assert.match(html, /Decision Room detail/);
  assert.match(html, /Choose recommendation above/);
  assert.match(html, /Loading executive intelligence with provenance intact/);
  assert.match(html, /No material intelligence changes need attention right now/);
  assert.match(html, /Unable to verify executive intelligence/);
});
