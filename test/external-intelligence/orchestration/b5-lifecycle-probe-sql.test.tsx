import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function sliceBetween(haystack: string, start: string, end: string) {
  const s = haystack.indexOf(start);
  assert.ok(s >= 0, `missing start marker: ${start}`);
  const e = haystack.indexOf(end, s + start.length);
  assert.ok(e >= 0, `missing end marker: ${end}`);
  return haystack.slice(s, e + end.length);
}

test("b5 lifecycle probe operator RPCs exist, are secure, and are hard-gated", () => {
  const mig = fs.readFileSync(
    "supabase/migrations/20260807050000_external_intelligence_phase_b5_lifecycle_probe.sql",
    "utf8"
  );
  const schema = fs.readFileSync("supabase/schema.sql", "utf8");

  for (const file of [mig, schema]) {
    assert.ok(file.includes("internal.lifecycle_probe"));
    assert.ok(file.includes("internal/no-network"));

    for (const sig of [
      "create or replace function public.enable_external_lifecycle_probe_v1(",
      "create or replace function public.disable_external_lifecycle_probe_v1("
    ]) {
      assert.ok(file.includes(sig));
      const body = sliceBetween(file, sig, "$fn$;");
      assert.ok(body.includes("language plpgsql"));
      assert.ok(body.includes("security definer"));
      assert.ok(body.includes("set search_path to 'public'"));
    }

    // Guard: cannot enable probe if any other production schedules are enabled.
    assert.ok(file.includes("and s.source_id <> 'internal.lifecycle_probe'"));
    assert.ok(file.includes("raise exception 'precondition_failed'"));
  }
});
