import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("guard: no production entry point imports external-intelligence supabase store", () => {
  const forbiddenFragment = "/external-intelligence/persistence/supabase";

  // Keep this guard narrow: scan server routes + scheduler runners.
  const roots = ["src/app/api", "src/lib/scheduler", "src/lib/fusion-v1", "src/lib/intelligence-v1"]; // high-risk importers

  for (const root of roots) {
    const full = path.join(process.cwd(), root);
    if (!fs.existsSync(full)) continue;

    const files = walk(full);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      assert.equal(src.includes(forbiddenFragment), false, `forbidden import found in ${f}`);
    }
  }
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}
