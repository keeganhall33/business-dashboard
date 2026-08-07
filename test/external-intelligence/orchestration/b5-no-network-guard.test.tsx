import test from "node:test";
import assert from "node:assert/strict";

import { withNoNetwork } from "@/lib/external-intelligence/orchestration/no-network";

test("b5 withNoNetwork blocks fetch and restores original fetch", async () => {
  const original = globalThis.fetch;

  const ok = await withNoNetwork(async () => 123);
  assert.equal(ok.ok, true);
  assert.equal((ok as any).value, 123);
  assert.equal(globalThis.fetch, original);

  const bad = await withNoNetwork(async () => {
    // @ts-expect-error - runtime guard should throw regardless of types
    await globalThis.fetch("https://example.com/");
    return 1;
  });
  assert.equal(bad.ok, false);
  assert.ok(String((bad as any).error?.message ?? "").includes("no_network_violation:fetch"));
  assert.equal(globalThis.fetch, original);
});
