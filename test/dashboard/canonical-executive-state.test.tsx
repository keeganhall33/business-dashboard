import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const overviewRoute = fs.readFileSync("src/app/api/dashboard/overview/route.ts", "utf8");
const localArtifacts = fs.readFileSync("src/lib/local/artifacts.ts", "utf8");

test("dashboard overview does not contain legacy canned executive recommendations", () => {
  for (const legacy of [
    "Shift focus to pricing power, conversion lift, and partnership pipeline expansion immediately.",
    "Increase AOV via premium tiered pricing",
    "Fix homepage and product page conversion bottlenecks",
    "Expand active partnership conversations",
    "Do not chase volume. Increase pricing power, strengthen luxury messaging, and build the partnership machine."
  ]) {
    assert.equal(overviewRoute.includes(legacy), false, legacy);
  }
});

test("executive command is governed by Avery, Career OS, and Fusion evidence state", () => {
  assert.match(overviewRoute, /buildGovernedExecutiveCommand/);
  assert.match(overviewRoute, /buildCareerOperatingSystem/);
  assert.match(overviewRoute, /getLatestAgentFusionContext/);
  assert.match(overviewRoute, /INSUFFICIENT_EXECUTIVE_EVIDENCE/);
  assert.match(overviewRoute, /Fusion state unavailable; do not infer recommendations from raw telemetry/);
  assert.doesNotMatch(overviewRoute, /DEFAULT_EXECUTIVE_(DIRECTIVE|PRIORITIES|BOTTLENECKS|RECOMMENDATION)/);
});

test("fixture mode uses explicit Vercel or test gate instead of retired Fly app semantics", () => {
  assert.match(overviewRoute, /DASHBOARD_STAGING_FIXTURES/);
  assert.match(overviewRoute, /VERCEL_ENV/);
  assert.match(overviewRoute, /DASHBOARD_FIXTURE_ENV/);
  assert.doesNotMatch(overviewRoute, /FLY_APP_NAME/);
  assert.doesNotMatch(overviewRoute, /keegan-dashboard-preview/);
});

test("local artifacts preserve facts without manufacturing executive strategy", () => {
  assert.doesNotMatch(localArtifacts, /data", "executive", "latest\.json"/);
  assert.doesNotMatch(localArtifacts, /EXEC_SUMMARY_PATH/);
  assert.doesNotMatch(localArtifacts, /function buildTopActions/);
  assert.match(localArtifacts, /executiveSummary: null/);
  assert.match(localArtifacts, /topActions: \[\]/);
  assert.match(localArtifacts, /function buildBlockedItems/);
});
