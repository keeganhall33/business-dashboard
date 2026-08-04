import test from "node:test";
import assert from "node:assert/strict";

import { enforceFusionRunCompletenessInvariantV1, type FusionCountClient } from "@/lib/fusion-v1/persistence-invariant";

type Row = Record<string, unknown>;

function buildFakeSupabase(input: {
  candidatesByRun: Record<string, Row[]>;
  rankingsByRun: Record<string, Row[]>;
}) {
  const updates: Array<{ table: string; where: Record<string, unknown>; patch: Row }> = [];

  function tableRows(table: string, run_id: string): Row[] {
    if (table === "fusion_candidates_v1") return input.candidatesByRun[run_id] ?? [];
    if (table === "fusion_rankings_v1") return input.rankingsByRun[run_id] ?? [];
    return [];
  }

  const supabase: FusionCountClient = {
    updates,
    from(table: string) {
      const api: {
        _select?: { opts?: { count?: "exact"; head?: boolean } };
        _update?: { patch: Row };
        select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => typeof api;
        update: (patch: Row) => typeof api;
        eq: (col: string, value: unknown) => Promise<{ error: null; count: number; data: null }> | Promise<{ error: null; data: null }>;
      } = {
        select(_cols: string, opts?: { count?: "exact"; head?: boolean }) {
          api._select = { opts };
          return api;
        },
        update(patch: Row) {
          api._update = { patch };
          return api;
        },
        eq(col: string, value: unknown) {
          if (api._select) {
            if (col !== "run_id") throw new Error(`expected eq(run_id, ...) got ${col}`);
            const rows = tableRows(table, String(value));
            return Promise.resolve({ error: null, count: rows.length, data: null });
          }

          if (api._update) {
            updates.push({ table, where: { [col]: value }, patch: api._update.patch });
            return Promise.resolve({ error: null, data: null });
          }

          throw new Error("unexpected call order");
        }
      };
      return api;
    }
  };

  return { supabase, updates };
}

test("completeness invariant: complete non-decision run does not throw", async () => {
  const run_id = "r1";
  const { supabase, updates } = buildFakeSupabase({
    candidatesByRun: { [run_id]: [{ id: 1 }] },
    rankingsByRun: { [run_id]: [{ id: 1 }] }
  });

  await enforceFusionRunCompletenessInvariantV1({
    client: supabase,
    run_id,
    policy: { status: "no_fresh_candidates", reason_codes: ["no_fresh_candidates"] }
  });

  assert.equal(updates.length, 0);
});

test("completeness invariant: missing rankings marks run failed and throws", async () => {
  const run_id = "r2";
  const { supabase, updates } = buildFakeSupabase({
    candidatesByRun: { [run_id]: [{ id: 1 }] },
    rankingsByRun: { [run_id]: [] }
  });

  await assert.rejects(
    () =>
      enforceFusionRunCompletenessInvariantV1({
        client: supabase,
        run_id,
        policy: { status: "no_fresh_candidates", reason_codes: ["no_fresh_candidates"] }
      }),
    /Fusion persistence incomplete/
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.table, "fusion_runs_v1");
  assert.deepEqual(updates[0]!.where, { run_id });
  assert.equal(updates[0]!.patch.run_status, "failed");
  assert.ok(Array.isArray(updates[0]!.patch.reason_codes));
  assert.ok((updates[0]!.patch.reason_codes as unknown[]).includes("persistence_incomplete"));
});

test("completeness invariant: zero-candidate run is not marked failed", async () => {
  const run_id = "r3";
  const { supabase, updates } = buildFakeSupabase({
    candidatesByRun: { [run_id]: [] },
    rankingsByRun: { [run_id]: [] }
  });

  await enforceFusionRunCompletenessInvariantV1({
    client: supabase,
    run_id,
    policy: { status: "insufficient_candidates", reason_codes: ["insufficient_candidates"] }
  });

  assert.equal(updates.length, 0);
});
