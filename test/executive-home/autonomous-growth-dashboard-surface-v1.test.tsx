import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("canonical Executive Home loads the live governed decision portfolio briefing instead of fixture strategy", () => {
  const page = fs.readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");

  assert.match(page, /loadAutonomousGrowthLiveBriefingV1/);
  assert.match(page, /EXECUTIVE_HOME_PORTFOLIO_MAX_AGE_MS = 36 \* 60 \* 60 \* 1_000/);
  assert.match(page, /historyLimit: 6/);
  assert.match(page, /Promise\.all\(\[/);
  assert.match(page, /sanitizeDashboardPayloadForHtml\(chiefOfStaffBriefing\)/);
  assert.match(page, /<AutonomousGrowthBriefingV1 briefing=\{sanitizedChiefOfStaffBriefing\} \/>/);
  assert.doesNotMatch(page, /fixture/i);
});

test("Executive Home keeps live portfolio synthesis read-only and ahead of the legacy shell in the canonical route", () => {
  const page = fs.readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  const briefingIndex = page.indexOf("<AutonomousGrowthBriefingV1 briefing={sanitizedChiefOfStaffBriefing} />");
  const shellIndex = page.indexOf("<ExecutiveHomeShell");

  assert.ok(briefingIndex >= 0, "chief-of-staff briefing should be rendered");
  assert.ok(shellIndex >= 0, "Executive Home shell should remain rendered");
  assert.ok(briefingIndex < shellIndex, "decision portfolio synthesis should be visible before deeper Home detail");
});
