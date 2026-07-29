import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW = ".github/workflows/dashboard-scheduler.yml";

function readWorkflow() {
  return fs.readFileSync(WORKFLOW, "utf8");
}

test("woo scheduler job does not reference GA4 service account or website env file", () => {
  const yaml = readWorkflow();

  // Must not reference GA4 1Password item in the workflow at all.
  // (Woo job previously failed because op run attempted to resolve it.)
  assert.ok(!yaml.includes("GA4 Service Account JSON"), "workflow must not reference GA4 Service Account JSON");

  // Woo job must not inherit the website env injection path.
  // Scope this assertion to the woo job block only (other jobs can legitimately use .env.website.ci).
  const start = yaml.indexOf("\njobs:\n");
  assert.ok(start !== -1, "workflow must contain jobs section");

  const wooStart = yaml.indexOf("\n  woo:\n", start);
  assert.ok(wooStart !== -1, "workflow must contain jobs.woo block");

  // The next job in this workflow file is website; use it as the delimiter.
  const websiteStart = yaml.indexOf("\n  website:\n", wooStart);
  assert.ok(websiteStart !== -1, "workflow must contain jobs.website block");

  const wooBlock = yaml.slice(wooStart, websiteStart);

  assert.ok(
    !wooBlock.includes("cp .env.website.ci .env.website"),
    "woo job must not copy/use .env.website.ci"
  );

  // Must use dedicated woo env template
  assert.ok(wooBlock.includes(".env.woo.ci"), "woo job must use .env.woo.ci");
  assert.ok(wooBlock.includes("cp .env.woo.ci .env.woo"), "woo job must copy woo env template");

  // Must use Node 22+ for the TypeScript-importing scripts.
  assert.ok(wooBlock.includes("node-version: 22"), "woo job must run on node-version 22");
});

test("woo scheduler job includes production Supabase safety checks", () => {
  const yaml = readWorkflow();

  assert.ok(yaml.includes("ibjsjosplgbqevmnvvpf"), "workflow must validate production project_ref");
  assert.ok(yaml.includes("ibjsjosplgbqevmnvvpf.supabase.co"), "workflow must validate production host");
  assert.ok(
    yaml.includes("tpgkyluovzhwvoajinra"),
    "workflow must explicitly reject staging project_ref"
  );
});
