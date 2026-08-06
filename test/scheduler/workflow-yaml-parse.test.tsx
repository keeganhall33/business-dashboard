import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

const ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(ROOT, ".github/workflows");

type WorkflowDoc = Record<string, unknown>;

type WorkflowOn = {
  workflow_dispatch?: unknown;
  schedule?: Array<{ cron?: string }>;
  push?: unknown;
  pull_request?: unknown;
} & Record<string, unknown>;

function readWorkflow(relPath: string): { raw: string; parsed: WorkflowDoc } {
  const filePath = path.join(ROOT, relPath);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw) as WorkflowDoc;
  return { raw, parsed };
}

function getOn(doc: WorkflowDoc): WorkflowOn {
  const onValue = doc.on;
  if (!onValue || typeof onValue !== "object") {
    throw new Error("missing_or_invalid_on");
  }
  return onValue as WorkflowOn;
}

test("workflows: YAML parses and exposes expected triggers", () => {
  const schedulerPath = ".github/workflows/production-scheduler-heartbeat.yml";
  const managePath = ".github/workflows/manage-recurring-internal-orchestration.yml";
  const controlPath = ".github/workflows/controlled-internal-heartbeat.yml";

  const scheduler = readWorkflow(schedulerPath);
  const manage = readWorkflow(managePath);
  const control = readWorkflow(controlPath);

  const schedulerOn = getOn(scheduler.parsed);
  const manageOn = getOn(manage.parsed);
  const controlOn = getOn(control.parsed);

  assert.ok("workflow_dispatch" in schedulerOn);
  assert.ok(Array.isArray(schedulerOn.schedule));

  assert.ok("workflow_dispatch" in manageOn);
  assert.ok("workflow_dispatch" in controlOn);

  // Ensure no push or pull_request triggers were introduced.
  for (const on of [schedulerOn, manageOn, controlOn]) {
    assert.ok(!("push" in on));
    assert.ok(!("pull_request" in on));
  }

  // Ensure scheduler cadence remains */5.
  const sched = schedulerOn.schedule?.[0];
  assert.equal(sched?.cron, "*/5 * * * *");
});

test("workflows: exactly one five-minute tick trigger workflow exists", () => {
  const files = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));

  const matches: string[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf8");
    const hasTickPath = raw.includes("/api/scheduler/tick");
    const hasFiveMinuteCron = /cron:\s*"\*\/5 \* \* \* \*"/.test(raw);
    if (hasTickPath && hasFiveMinuteCron) {
      matches.push(file);
    }
  }

  assert.deepEqual(matches, ["production-scheduler-heartbeat.yml"]);
});
