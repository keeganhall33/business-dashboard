import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION = "20260730170942_add_action_execution_v1";

function read(p: string) {
  return fs.readFileSync(p, "utf8");
}

test("M12 execution migration forward SQL defines all 7 tables with RLS", () => {
  const sqlPath = path.join(process.cwd(), "supabase", "migrations", `${MIGRATION}.sql`);
  const sql = read(sqlPath);

  const tables = [
    "action_execution_requests_v1",
    "action_execution_confirmations_v1",
    "action_execution_attempts_v1",
    "action_execution_steps_v1",
    "action_execution_locks_v1",
    "action_execution_idempotency_v1",
    "action_execution_rollbacks_v1"
  ];

  for (const t of tables) {
    assert.match(sql, new RegExp(`create table[^;]*\\b${t}\\b`, "i"), `missing CREATE TABLE for ${t}`);
    assert.match(sql, new RegExp(`alter table\\s+${t}\\s+enable row level security`, "i"), `missing RLS enablement for ${t}`);
  }

  // Must not reference production project ref.
  assert.ok(!sql.includes("ibjsjosplgbqevmnvvpf"));

  // External side effects must be constrained to 0 for attempts/rollbacks.
  assert.match(sql, /external_side_effect_count\s+int[^\n]*default\s+0/i);
  assert.match(sql, /external_side_effect_count\s*=\s*0/i);
});

test("M12 execution migration rollback SQL drops all 7 tables in FK-safe order", () => {
  const sqlPath = path.join(process.cwd(), "supabase", "migrations", `${MIGRATION}.rollback.sql`);
  const sql = read(sqlPath);

  const dropsInOrder = [
    "drop table if exists action_execution_steps_v1",
    "drop table if exists action_execution_rollbacks_v1",
    "drop table if exists action_execution_attempts_v1",
    "drop table if exists action_execution_confirmations_v1",
    "drop table if exists action_execution_idempotency_v1",
    "drop table if exists action_execution_locks_v1",
    "drop table if exists action_execution_requests_v1"
  ];

  let lastIndex = -1;
  for (const needle of dropsInOrder) {
    const idx = sql.toLowerCase().indexOf(needle);
    assert.ok(idx !== -1, `missing rollback drop: ${needle}`);
    assert.ok(idx > lastIndex, `rollback drop order incorrect around: ${needle}`);
    lastIndex = idx;
  }

  assert.ok(!sql.includes("ibjsjosplgbqevmnvvpf"));
});

