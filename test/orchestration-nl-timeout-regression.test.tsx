import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("NL adapter regression: uses openclaw agent (not agent exec) and has bounded default timeout", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("\"agent\""), "expected openclaw agent usage");
  assert.ok(text.includes("\"--agent\""), "expected --agent flag");
  assert.equal(text.includes("agent\",\n      \"exec\""), false, "must not use deprecated agent exec path");
  assert.ok(text.includes("Number(arg(\"--timeout\") ?? \"120\")"), "expected default timeout=120");
});

test("Watcher regression: NL detached launcher uses bounded timeout (<= 180s)", () => {
  const text = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
  assert.ok(text.includes("launch-orchestration-nl-detached"));
  assert.ok(text.includes("--timeout 180"));
});

