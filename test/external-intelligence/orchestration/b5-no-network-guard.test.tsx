import test from "node:test";
import assert from "node:assert/strict";

import { withNoNetwork } from "@/lib/external-intelligence/orchestration/no-network";

test("b5 withNoNetwork blocks fetch and restores original fetch", async () => {
  const original = globalThis.fetch;

  const ok = await withNoNetwork(async () => 123);
  assert.equal(ok.ok, true);
  assert.equal((ok as { ok: true; value: number }).value, 123);
  assert.equal(globalThis.fetch, original);

  const bad = await withNoNetwork(async () => {
    // @ts-expect-error - runtime guard should throw regardless of types
    await globalThis.fetch("https://example.com/");
    return 1;
  });
  assert.equal(bad.ok, false);
  const err = (bad as { ok: false; error: unknown }).error;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  assert.ok(msg.includes("no_network_violation:fetch"));
  assert.equal(globalThis.fetch, original);
});
