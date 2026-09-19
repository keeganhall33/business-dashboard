import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/validated-main-deploy.yml"),
  "utf8"
);

function productionSmokeJob(): string {
  const start = workflow.indexOf("  production-smoke:\n");
  assert.notEqual(start, -1, "validated-main workflow must define the production-smoke job");
  return workflow.slice(start);
}

test("main production propagation proof cannot be skipped when the production URL variable is missing", () => {
  const job = productionSmokeJob();

  assert.match(job, /if: \$\{\{ github\.event_name == 'push' \}\}/);
  assert.doesNotMatch(job, /DASHBOARD_PRODUCTION_URL\s*!=\s*''/);
  assert.match(job, /- name: Require configured production URL/);
  assert.match(job, /if \[ -z "\$\{SMOKE_BASE_URL:-\}" \]; then/);
  assert.match(job, /exit 1/);
});

test("production propagation proof rejects non-HTTPS configured origins before smoke", () => {
  const job = productionSmokeJob();
  const configurationGuard = job.slice(
    job.indexOf("- name: Require configured production URL"),
    job.indexOf("- name: Wait for configured production URL")
  );

  assert.match(configurationGuard, /case "\$SMOKE_BASE_URL" in/);
  assert.match(configurationGuard, /https:\/\/\*\) ;;/);
  assert.match(configurationGuard, /DASHBOARD_PRODUCTION_URL must be an HTTPS production origin/);
  assert.match(configurationGuard, /exit 1/);
});
