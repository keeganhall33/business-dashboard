import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildCanonicalExecutiveHomeHrefV1 } from "@/lib/executive-home/canonical-route-v1";
import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";

test("Executive Home information architecture names /dashboard as the canonical route", () => {
  const home = EXECUTIVE_WORKSPACE_NAV_V1.find((item) => item.id === "EXECUTIVE_HOME");
  assert.equal(home?.href, "/dashboard");
});

test("legacy Executive Home alias preserves only canonical date-range controls", () => {
  assert.equal(buildCanonicalExecutiveHomeHrefV1(), "/dashboard");
  assert.equal(
    buildCanonicalExecutiveHomeHrefV1({
      range: "custom",
      start: "2026-09-01",
      end: "2026-09-18",
      returnTo: "https://attacker.example/",
      arbitrary: "ignored"
    }),
    "/dashboard?range=custom&start=2026-09-01&end=2026-09-18"
  );
});

test("legacy alias does not forward array values or user-controlled redirect parameters", () => {
  assert.equal(
    buildCanonicalExecutiveHomeHrefV1({
      range: ["7d", "30d"],
      start: ["2026-09-01"],
      end: "2026-09-18",
      redirect: "/login"
    }),
    "/dashboard?end=2026-09-18"
  );
});

test("legacy alias safely encodes accepted date-range values", () => {
  assert.equal(
    buildCanonicalExecutiveHomeHrefV1({ range: "last 30 days&debug=true" }),
    "/dashboard?range=last+30+days%26debug%3Dtrue"
  );
});

test("legacy page redirects instead of rendering a second Executive Home truth surface", () => {
  const page = fs.readFileSync("src/app/(app)/executive-home/page.tsx", "utf8");

  assert.match(page, /redirect\(buildCanonicalExecutiveHomeHrefV1\(resolvedParams\)\)/);
  assert.doesNotMatch(page, /buildExecutiveHomeFromDashboardOverviewV1/);
  assert.doesNotMatch(page, /IonosCommunicationAttentionCard/);
  assert.doesNotMatch(page, /inbox=\{null\}/);
});
