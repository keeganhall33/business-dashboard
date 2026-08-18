import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW = ".github/workflows/dashboard-scheduler.yml";

function readWorkflow() {
  return fs.readFileSync(WORKFLOW, "utf8");
}

function getWooBlock(yaml: string) {
  const start = yaml.indexOf("\njobs:\n");
  assert.ok(start !== -1, "workflow must contain jobs section");

  const wooStart = yaml.indexOf("\n  woo:\n", start);
  assert.ok(wooStart !== -1, "workflow must contain jobs.woo block");

  const websiteStart = yaml.indexOf("\n  website:\n", wooStart);
  assert.ok(websiteStart !== -1, "workflow must contain jobs.website block");

  return yaml.slice(wooStart, websiteStart);
}

test("woo scheduler job uses the dedicated current Woo env template only", () => {
  const yaml = readWorkflow();
  const wooBlock = getWooBlock(yaml);

  assert.ok(!yaml.includes("GA4 Service Account JSON"), "workflow must not reference GA4 Service Account JSON");
  assert.ok(!wooBlock.includes("config/env/website.op.env"), "woo job must not use the website env template");
  assert.ok(!wooBlock.includes(".env.website"), "woo job must not materialize the website env file");

  assert.ok(wooBlock.includes("config/env/woo.op.env"), "woo job must use config/env/woo.op.env");
  assert.ok(wooBlock.includes("cp config/env/woo.op.env .env.woo"), "woo job must materialize only the Woo runtime env file");
  assert.ok(wooBlock.includes("node-version: 22"), "woo job must run on node-version 22");
});

test("woo scheduler job fails closed unless Supabase matches the production project and host", () => {
  const yaml = readWorkflow();
  const wooBlock = getWooBlock(yaml);

  assert.ok(wooBlock.includes('PROJECT_REF="$(op read'), "woo job must resolve project_ref at runtime");
  assert.ok(wooBlock.includes('SUPABASE_URL="$(op read'), "woo job must resolve Supabase URL at runtime");
  assert.ok(wooBlock.includes('test "$PROJECT_REF" = "ibjsjosplgbqevmnvvpf"'), "woo job must allowlist the production project_ref");
  assert.ok(wooBlock.includes('test "$HOST" = "ibjsjosplgbqevmnvvpf.supabase.co"'), "woo job must allowlist the production host");
  assert.ok(wooBlock.includes("Unexpected Supabase project_ref"), "unexpected project_ref must fail closed");
  assert.ok(wooBlock.includes("Unexpected Supabase host"), "unexpected host must fail closed");
});
