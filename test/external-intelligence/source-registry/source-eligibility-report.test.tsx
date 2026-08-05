import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

async function loadReportModule() {
  const url = pathToFileURL(path.resolve(process.cwd(), "scripts/external-source-eligibility-report.mjs"));
  return import(url.href);
}

test("eligibility report: deterministic and contains all canonical ids", async () => {
  const { generateEligibilityReport } = await loadReportModule();
  const r1 = generateEligibilityReport();
  const r2 = generateEligibilityReport();

  assert.equal(r1, r2);

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
