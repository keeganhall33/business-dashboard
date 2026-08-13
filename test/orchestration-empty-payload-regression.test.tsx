import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adapter = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");

test("silent result.payloads is classified before strict JSON parsing", () => {
  assert.match(adapter, /if \(!candidate\.trim\(\)\)/);
  assert.match(adapter, /OpenClaw envelope contained no renderable final text/);
  assert.match(adapter, /return \{ kind: "invalid", error:/);
});

test("nested result payload text remains supported", () => {
  assert.match(adapter, /envelope\?\.result/);
  assert.match(adapter, /projection\?\.payloads/);
  assert.match(adapter, /payload\?\.text/);
});

test("normal strict JSON contracts still parse through JSON.parse", () => {
  assert.match(adapter, /const obj = JSON\.parse\(candidate\.trim\(\)\)/);
  assert.match(adapter, /typeof obj\.TASK_ID === "string"/);
  assert.match(adapter, /typeof obj\.STATUS === "string"/);
  assert.match(adapter, /typeof obj\.CHECKPOINT_ID === "string"/);
});
