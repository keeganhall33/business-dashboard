import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ExecutiveHomeVisualSummaryV2,
  buildExecutiveHomeVisualSummaryV2
} from "@/components/executive-home/ExecutiveHomeVisualSummaryV2";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

test("visual decision scan enforces three-item executive budgets deterministically", () => {
  const first = buildExecutiveHomeVisualSummaryV2(EXECUTIVE_HOME_FIXTURE_V1);
  const second = buildExecutiveHomeVisualSummaryV2(EXECUTIVE_HOME_FIXTURE_V1);

  assert.deepEqual(second, first);
  assert.ok(first.needsYouNow.length <= 3);
  assert.ok(first.biggestOpportunities.length <= 3);
  assert.ok(first.whatChanged.length <= 3);
});

test("approval-required work is separated from awareness while uncertainty stays explicit", () => {
  const data = structuredClone(EXECUTIVE_HOME_FIXTURE_V1);
  data.cards = [
    {
      ...data.cards[0],
      id: "approval-first",
      title: "Approve a bounded decision",
      approval_state: "KEEGAN_ACTION_REQUIRED",
      priority: "DO_NOW"
    },
    {
      ...data.cards[1],
      id: "awareness-only",
      title: "Monitor a material change",
      approval_state: "NONE",
      priority: "MONITOR"
    }
  ];
  data.command_center.opportunities = [
    {
      ...data.command_center.opportunities[0],
      id: "uncertain-opportunity",
      evidence: "UNKNOWN"
    }
  ];

  const model = buildExecutiveHomeVisualSummaryV2(data);
  assert.equal(model.needsYouNow[0].id, "approval-first");
  assert.equal(model.pulse.approvalRequired, 1);
  assert.equal(model.pulse.evidenceWatch, 1);

  const html = renderToStaticMarkup(<ExecutiveHomeVisualSummaryV2 data={data} />);
  assert.match(html, /Needs you now/i);
  assert.match(html, /Biggest opportunities/i);
  assert.match(html, /What changed/i);
  assert.match(html, /UNKNOWN/);
});

test("visual summary uses supported counts and language rather than manufacturing financial KPIs", () => {
  const html = renderToStaticMarkup(<ExecutiveHomeVisualSummaryV2 data={EXECUTIVE_HOME_FIXTURE_V1} />);

  assert.match(html, /Needs approval/i);
  assert.match(html, /Active work/i);
  assert.match(html, /Opportunities/i);
  assert.match(html, /Evidence watch/i);
  assert.doesNotMatch(html, /\$[0-9]/);
  assert.doesNotMatch(html, /revenue forecast/i);
});

test("populated Executive Home moves status placeholders and prose-heavy navigation out of the primary scan", () => {
  const shellSource = fs.readFileSync(
    new URL("../../src/components/executive-home/ExecutiveHomeShell.tsx", import.meta.url),
    "utf8"
  );

  assert.match(shellSource, /ExecutiveHomeVisualSummaryV2/);
  assert.match(shellSource, /More intelligence|secondary/i);
  assert.doesNotMatch(shellSource, /aria-label="Executive Home sections"/);
  assert.doesNotMatch(shellSource, /Light-first intelligence dashboard/);
});
