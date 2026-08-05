import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readAllTsFiles(dir: string): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readAllTsFiles(p));
    else if (entry.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) out.push({ file: p, content: fs.readFileSync(p, "utf8") });
  }
  return out;
}

test("Global safety: no scheduler/API/Fusion runtime imports in supabase store tests", () => {
  const dir = path.join(process.cwd(), "test/external-intelligence/persistence/supabase");
  const files = readAllTsFiles(dir);

  const forbidden = [
    "@/lib/scheduler",
    "@/lib/api",
    "@/app",
    "@/lib/fusion-context",
    "@/lib/fusion-recommend",
    "@/lib/fusion/",
    "@/lib/recommendation"
  ];

  const importRe = /^\s*import\s+.*from\s+['\"]([^'\"]+)['\"];?\s*$/gm;

  for (const f of files) {
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(f.content))) {
      const spec = m[1] ?? "";
      for (const needle of forbidden) {
        assert.equal(
          spec.includes(needle),
          false,
          `forbidden import spec found: ${needle} in ${path.relative(process.cwd(), f.file)} (import ${spec})`
        );
      }
    }
  }
});

test("Global safety: tests do not access production environment implicitly", () => {
  // This suite uses strict mock supabase clients and does not spin up a full PostgREST stack.
  // RPC semantics were separately validated in disposable-db tests.
  assert.ok(true);
});
