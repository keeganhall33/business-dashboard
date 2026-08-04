import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

test("production fusion candidate loader does not import fixtures", () => {
  const prodDir = path.join(process.cwd(), "src/lib/fusion-v1/production");
  const files = listFiles(prodDir).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    assert.equal(src.includes("/fusion-v1/fixtures"), false);
    assert.equal(src.includes("buildFusionV1FixtureCandidates"), false);
  }
});

