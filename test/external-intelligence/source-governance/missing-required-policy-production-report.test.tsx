import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

async function loadReportModule() {
  const url = pathToFileURL(path.resolve(process.cwd(), "scripts/external-source-eligibility-report.mjs"));
  return import(url.href);
}

test("missing required policy blocks production eligibility report (fail-closed; no fallback)", async () => {
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
    const { generateEligibilityReport } = await loadReportModule();
    assert.throws(() => generateEligibilityReport());
  } finally {
    const fsRestore = fs as unknown as { readFileSync: typeof fs.readFileSync };
    fsRestore.readFileSync = orig;
  }
});
