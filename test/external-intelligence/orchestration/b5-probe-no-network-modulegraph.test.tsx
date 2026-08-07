import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const PROBE_PATH = "src/lib/external-intelligence/orchestration/handlers/lifecycle-probe-v1.ts";

test("b5 probe executor is structurally internal-only (no network/client/collector deps)", () => {
  const src = fs.readFileSync(PROBE_PATH, "utf8");

  // The probe must not attempt to disable networking via global monkeypatch.
  assert.equal(src.includes("globalThis.fetch"), false);
  assert.equal(src.includes("(globalThis"), false);

  // The probe must not call fetch directly.
  assert.equal(/\bfetch\s*\(/.test(src), false);

  // It must not import typical HTTP clients.
  for (const banned of [
    "node-fetch",
    "undici",
    "axios",
    "got",
    "superagent",
    "https://",
    "http://",
    "node:http",
    "node:https"
  ]) {
    assert.equal(src.includes(banned), false, `probe source must not include: ${banned}`);
  }

  // It must not import any external collector/adapters/fusion/action/notification code paths.
  for (const banned of [
    "/collectors/",
    "/adapters/",
    "fusion",
    "recommend",
    "notification",
    "persist_external_evidence",
    "persist_external_claim",
    "persist_external_signal"
  ]) {
    assert.equal(src.toLowerCase().includes(banned.toLowerCase()), false, `probe source must not reference: ${banned}`);
  }
});
