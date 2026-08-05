import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { loadExternalIntelligenceConfigV1 } from "@/lib/external-intelligence/config/load-all";

test("missing required policy fails closed (config bundle blocks)", () => {
  const orig = fs.readFileSync;

  // Simulate a missing required policy file by intercepting fs reads.
  (fs as any).readFileSync = (p: any, ...rest: any[]) => {
    if (String(p).includes("config/policies/confidence/v1.0.0.json")) {
      const e: any = new Error("ENOENT");
      e.code = "ENOENT";
      throw e;
    }
    return orig(p, ...rest);
  };

  try {
    assert.throws(() => loadExternalIntelligenceConfigV1());
  } finally {
    (fs as any).readFileSync = orig;
  }
});
