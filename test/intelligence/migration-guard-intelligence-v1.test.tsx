import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("intelligence v1 migration guard: findings table uses analysis_window (no unquoted window column)", () => {
  const migrationPath = path.join(process.cwd(), "supabase/migrations/20260803_intelligence_v1_tables.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Must not define an unquoted column named window.
  assert.equal(/\n\s*window\s+jsonb\b/i.test(sql), false);

  // Must define analysis_window jsonb not null.
  assert.ok(/\n\s*analysis_window\s+jsonb\s+not\s+null\b/i.test(sql));
});

test("intelligence store mapping: Finding.window maps to analysis_window column", () => {
  const storePath = path.join(process.cwd(), "src/lib/intelligence-v1/store.ts");
  const src = fs.readFileSync(storePath, "utf8");
  assert.ok(src.includes("analysis_window: row.window"));
});

