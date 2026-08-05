import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";

test("missing policy rejection: loader fails closed when required policy file missing", () => {
  const orig = fs.readFileSync;

  const fsPatch = fs as unknown as { readFileSync: typeof fs.readFileSync };
  fsPatch.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const [p] = args;
    if (String(p).includes("config/policies/confidence/v1.0.0.json")) {
      const e = new Error("ENOENT") as Error & { code?: string };
      e.code = "ENOENT";
      throw e;
    }
    return orig(...args);
  }) as typeof fs.readFileSync;

  try {
    assert.throws(() => loadExternalIntelligenceConfigV1());
  } finally {
    const fsRestore = fs as unknown as { readFileSync: typeof fs.readFileSync };
    fsRestore.readFileSync = orig;
  }
});
