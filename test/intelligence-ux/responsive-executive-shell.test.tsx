import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ResponsiveExecutiveShell } from "@/components/intelligence-ux/ResponsiveExecutiveShell";
import { INTELLIGENCE_UX_SHELL_FIXTURE_V1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

const html = renderToString(<ResponsiveExecutiveShell data={INTELLIGENCE_UX_SHELL_FIXTURE_V1} />);

test("responsive executive shell renders light-first premium surface and full IA", () => {
  assert.match(html, /bg-\[#f7f2ea\]/);
  for (const label of ["Executive Command Center", "Strategy", "Opportunities / Actions", "Specialists", "Relationships", "Financial", "Learning", "Data / Evidence", "Decision Rooms", "Ask Jeeves"]) {
    assert.match(html, new RegExp(label.replace("/", "\\/")));
  }
});

test("home summary card links to recommendation detail and Decision Room", () => {
  assert.match(html, /Private collector room concept/);
  assert.match(html, /Open Decision Room/);
  assert.match(html, /#decision-private-collector-room/);
  assert.match(html, /Summary moves to explanation, evidence, specialist analysis/);
});

test("persistent global and contextual Ask Jeeves controls share canonical classifications", () => {
  assert.match(html, /Global Ask Jeeves/);
  assert.match(html, /Contextual Ask Jeeves/);
  assert.match(html, /Ask about this decision/);
  assert.match(html, /Mock mic listening/);
  assert.match(html, /Voice and text share the same canonical pipeline/);
  assert.deepEqual(INTELLIGENCE_UX_SHELL_FIXTURE_V1.global_ask.supported_classifications, ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"]);
  assert.equal(INTELLIGENCE_UX_SHELL_FIXTURE_V1.global_ask.memory_write_policy, "NO_WRITE_WITHOUT_CLASSIFICATION");
});

test("Decision Room shows written answer, evidence, and assumption drill-down", () => {
  assert.match(html, /Written answer/);
  assert.match(html, /The recommendation changes if a credible host/);
  assert.match(html, /Evidence/);
  assert.match(html, /Access path/);
  assert.match(html, /Assumptions/);
  assert.match(html, /Direct economics/);
  assert.match(html, /UNKNOWN/);
});

test("mobile and desktop layout semantics are intentionally different", () => {
  assert.match(html, /md:grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.match(html, /md:hidden/);
  assert.match(html, /hidden md:block/);
  assert.match(html, /Mobile behavior/);
  assert.match(html, /Desktop behavior/);
  assert.notEqual(INTELLIGENCE_UX_SHELL_FIXTURE_V1.responsive_behavior.mobile.join(" "), INTELLIGENCE_UX_SHELL_FIXTURE_V1.responsive_behavior.desktop.join(" "));
});
