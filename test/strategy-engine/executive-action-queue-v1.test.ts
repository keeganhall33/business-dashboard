import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutiveActionQueueV1,
  executiveActionQueueGoldenFixtureV1,
  executiveActionQueueGoldenFixturesV1,
  formatExpectedUpsideRange,
  sortExecutiveActions
} from "@/lib/strategy-engine/executive-action-queue-v1";

test("golden fixture exposes DO_NOW PREPARE and MONITOR executive action states", () => {
  const queue = executiveActionQueueGoldenFixtureV1;

  assert.equal(queue.data_mode, "GOLDEN_FIXTURE");
  assert.equal(queue.items.length, 3);
  assert.deepEqual(Object.keys(queue.sections), ["DO_NOW", "PREPARE", "MONITOR"]);
  assert.equal(queue.sections.DO_NOW.length, 1);
  assert.equal(queue.sections.PREPARE.length, 1);
  assert.equal(queue.sections.MONITOR.length, 1);
});

test("deterministic ordering honors state rank and time sensitivity", () => {
  const reversed = [...executiveActionQueueGoldenFixturesV1].reverse();
  const sorted = sortExecutiveActions(reversed);

  assert.deepEqual(
    sorted.map((item) => item.ACTION_ID),
    [
      "strategy-do-now-qualified-traffic",
      "strategy-prepare-creative-direction",
      "strategy-monitor-meta-attribution"
    ]
  );
});

test("dashboard contract includes every required executive action field", () => {
  const action = executiveActionQueueGoldenFixtureV1.items[0];

  for (const key of [
    "WHAT_CHANGED",
    "WHY_IT_MATTERS",
    "RECOMMENDED_ACTION",
    "EXPECTED_UPSIDE_RANGE",
    "CONFIDENCE",
    "KEY_UNCERTAINTY",
    "EVIDENCE_REFS",
    "TIME_SENSITIVITY",
    "OWNER",
    "APPROVAL_CLASS",
    "NEXT_STEP",
    "SUCCESS_METRIC",
    "EVALUATION_WINDOW",
    "WHAT_WOULD_CHANGE_THE_RECOMMENDATION"
  ] as const) {
    assert.ok(action[key]);
  }
});

test("approval class is preserved and not collapsed during queue build", () => {
  const queue = buildExecutiveActionQueueV1(executiveActionQueueGoldenFixturesV1);

  assert.deepEqual(
    queue.items.map((item) => [item.ACTION_ID, item.APPROVAL_CLASS]),
    [
      ["strategy-do-now-qualified-traffic", "L2_DRAFT_PREPARED"],
      ["strategy-prepare-creative-direction", "L1_RECOMMENDATION"],
      ["strategy-monitor-meta-attribution", "L0_INSIGHT"]
    ]
  );
});

test("KNOWN INFERRED and UNKNOWN semantics remain visible", () => {
  const queue = executiveActionQueueGoldenFixtureV1;

  assert.deepEqual(
    queue.items.map((item) => item.TRUTH_STATE),
    ["INFERRED", "KNOWN", "UNKNOWN"]
  );
  const unknown = queue.items.find((item) => item.TRUTH_STATE === "UNKNOWN");
  assert.ok(unknown);
  assert.equal(unknown.DISPLAY.uncertainty_label.startsWith("UNKNOWN:"), true);
  assert.equal(unknown.EXPECTED_UPSIDE_RANGE.currency, "UNKNOWN");
  assert.equal(formatExpectedUpsideRange(unknown.EXPECTED_UPSIDE_RANGE), "Upside unknown");
});

test("expected upside formatting avoids fake precision when range is unavailable", () => {
  const [revenue, creative] = executiveActionQueueGoldenFixtureV1.items;

  assert.equal(revenue.DISPLAY.upside_label, "$90-$220 / 7d");
  assert.equal(creative.DISPLAY.upside_label, "Upside unknown");
  assert.equal(creative.EXPECTED_UPSIDE_RANGE.expected_incremental_revenue_cents, null);
});

test("owner labels remain honest for unknown owners", () => {
  const queue = buildExecutiveActionQueueV1([
    {
      ...executiveActionQueueGoldenFixturesV1[0],
      ACTION_ID: "strategy-owner-unknown",
      OWNER: "UNKNOWN",
      DISPLAY: {
        ...executiveActionQueueGoldenFixturesV1[0].DISPLAY,
        owner_label: "Owner unknown"
      }
    }
  ]);

  assert.equal(queue.items[0].OWNER, "UNKNOWN");
  assert.equal(queue.items[0].DISPLAY.owner_label, "Owner unknown");
});
