import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

async function loadReportModule() {
  const url = pathToFileURL(path.resolve(process.cwd(), "scripts/external-source-eligibility-report.mjs"));
  return import(url.href);
}

test("eligibility report: deterministic and includes current + potential summaries", async () => {
  const { generateEligibilityReport } = await loadReportModule();
  const r1 = generateEligibilityReport();
  const r2 = generateEligibilityReport();

  assert.equal(r1, r2);

  // Current eligibility should be fully blocked given the production config is fail-closed.
  assert.ok(r1.includes("automated_eligible_now=0"));
  assert.ok(r1.includes("manual_eligible_now=0"));
  assert.ok(r1.includes("metadata_only_eligible_now=0"));
  assert.ok(r1.includes("fully_blocked_now=24"));

  for (const id of [
    "sports.major_leagues.official",
    "calendar.sports.milestones",
    "search.google_trends",
    "economics.fred",
    "licensing.uspto.trademarks",
    "ops.shipping.alerts",
    "sports_business.boardroom"
  ]) {
    assert.ok(r1.includes(`- ${id}`));
  }
});
