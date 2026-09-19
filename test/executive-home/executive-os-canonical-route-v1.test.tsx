import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("legacy Executive OS route redirects to canonical Executive Home instead of rendering fixture intelligence", () => {
  const page = fs.readFileSync("src/app/(app)/executive-os/page.tsx", "utf8");

  assert.match(page, /redirect\("\/dashboard"\)/);
  assert.doesNotMatch(page, /ResponsiveExecutiveShell/);
  assert.doesNotMatch(page, /INTELLIGENCE_UX_SHELL_FIXTURE_V1/);
  assert.doesNotMatch(page, /responsive-shell-fixtures/);
});
