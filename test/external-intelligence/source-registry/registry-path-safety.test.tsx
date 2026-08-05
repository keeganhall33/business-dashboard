import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";

test("production registry loader uses fixed repository path (no env-controlled path)", () => {
  const orig = fs.readFileSync;

  const allowed = new Set(["config/source-registry/v1/source_registry.production.json"]);
  (fs as any).readFileSync = (p: any, ...rest: any[]) => {
    const sp = String(p);
    // allow reading policy fixtures too if something imports them transitively
    if (sp.includes("config/policies/")) return orig(p, ...rest);
    assert.ok(allowed.has(sp), `unexpected file read: ${sp}`);
    return orig(p, ...rest);
  };

  try {
    const { file } = loadProductionSourceRegistryV1();
    assert.equal(file.sources.length, 24);
  } finally {
    (fs as any).readFileSync = orig;
  }
});
