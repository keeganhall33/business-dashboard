import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(root, relativePath));
}

test("retired Fly/container production paths stay removed", () => {
  assert.equal(exists("fly.toml"), false);
  assert.equal(exists("Dockerfile"), false);
  assert.equal(exists("scripts/deploy.sh"), false);

  const validatedMain = read(".github/workflows/validated-main-deploy.yml");
  assert.doesNotMatch(validatedMain, /flyctl|FLY_API_TOKEN|keegan-dashboard\.fly\.dev/i);
});

test("application scheduler has one GitHub wake-up path", () => {
  const scheduler = read(".github/workflows/autopilot.yml");
  assert.match(scheduler, /\/api\/scheduler\/tick/);
  assert.doesNotMatch(scheduler, /deliverable-harvest|ceo-digest|weekly-summary/);
  assert.match(scheduler, /Fly scheduler targets are retired/);

  // The pre-migration Phase 4 bootstrap seeded old schedules/idea-pulse behavior
  // and pointed at the deleted SCHEDULER_SPEC.md. It must remain retired.
  assert.equal(exists("supabase/phase4_scheduler.sql"), false);
});

test("telemetry workflow does not run a parallel executive recommendation engine", () => {
  const telemetry = read(".github/workflows/dashboard-scheduler.yml");
  assert.doesNotMatch(telemetry, /executive:refresh|Run Executive Refresh|target == 'executive'/);
  assert.match(telemetry, /collects evidence only/i);
  assert.equal(exists("scripts/run-executive-refresh.mjs"), false);
});

test("completed milestone proof harnesses stay out of the active script tree", () => {
  for (const legacy of [
    "scripts/m8-live-reconcile.mjs",
    "scripts/m9-generate-causal-explanations.ts",
    "scripts/m10-generate-recommendations.ts",
    "scripts/m11-action-center-api-integration.ts",
    "scripts/m11-run-action-center-scenarios.ts",
    "scripts/m12-run-action-execution-scenarios.ts"
  ]) {
    assert.equal(exists(legacy), false, `${legacy} should remain historical only`);
  }
});

test("committed 1Password templates are isolated from local env files", () => {
  const envDir = path.join(root, "config/env");
  const templates = fs.readdirSync(envDir).filter((name) => name.endsWith(".op.env"));
  assert.ok(templates.length >= 5);

  for (const name of templates) {
    const lines = read(path.join("config/env", name))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const line of lines) {
      const equals = line.indexOf("=");
      assert.ok(equals > 0, `${name}: malformed environment line`);
      const value = line.slice(equals + 1);
      const isOnePasswordReference = value.startsWith("op://");
      const isAllowedConstant = name === "woo.op.env" && line === "DASHBOARD_PRIMARY_CURRENCY=USD";
      assert.ok(isOnePasswordReference || isAllowedConstant, `${name}: committed value must be an op:// reference or approved constant`);
    }
  }

  for (const legacy of [".env.website.ci", ".env.meta.ci", ".env.cloudflare.ci", ".env.leads.ci", ".env.woo.ci"]) {
    assert.equal(exists(legacy), false, `${legacy} should not exist at repository root`);
  }
});

test("superseded root specs stay out of the canonical working tree", () => {
  for (const legacy of [
    "API_SPEC.md",
    "BACKEND_SPEC.md",
    "FRONTEND_SPEC.md",
    "SCHEDULER_REFERENCE.md",
    "SCHEDULER_SPEC.md",
    "VALIDATION_SPEC.md"
  ]) {
    assert.equal(exists(legacy), false, `${legacy} should remain historical only`);
  }

  assert.equal(exists("docs/ARCHITECTURE.md"), true);
});
