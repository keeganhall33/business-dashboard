import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";

test("production registry loader uses fixed repository path (no env-controlled path)", () => {
  const orig = fs.readFileSync;

  const allowed = new Set(["config/source-registry/v1/source_registry.production.json"]);
  const fsPatch = fs as unknown as { readFileSync: typeof fs.readFileSync };
  fsPatch.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const [p] = args;
    const sp = String(p);
    // allow reading policy fixtures too if something imports them transitively
    if (sp.includes("config/policies/")) return orig(...args);
    assert.ok(allowed.has(sp), `unexpected file read: ${sp}`);
    return orig(...args);
  }) as typeof fs.readFileSync;

  try {
    const { file } = loadProductionSourceRegistryV1();
    assert.equal(file.sources.length, 25);
  } finally {
    const fsRestore = fs as unknown as { readFileSync: typeof fs.readFileSync };
    fsRestore.readFileSync = orig;
  }
});
