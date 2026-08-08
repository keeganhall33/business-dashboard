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

test("b2 milestone alert lifecycle SQL is present, secure, and mirrored", () => {
  const fwd = fs.readFileSync(
    "supabase/migrations/20260805010000_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );
  const rb = fs.readFileSync(
    "supabase/rollbacks/20260805_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );
  const schema = fs.readFileSync("supabase/schema.sql", "utf8");

  // Index
  assert.ok(fwd.includes("sports_milestone_alerts_v1__milestone_idx"));
  assert.ok(schema.includes("sports_milestone_alerts_v1__milestone_idx"));

  // Functions: signatures + security/search_path
  const upsertSig =
    "create or replace function public.upsert_sports_milestone_alerts_v1(in_alerts jsonb)";
  const invalidateSig =
    "create or replace function public.invalidate_obsolete_sports_milestone_alerts_v1()";
  const expireSig =
    "create or replace function public.expire_sports_milestone_alerts_v1(in_now timestamptz)";

  for (const file of [fwd, schema]) {
    assert.ok(file.includes(upsertSig));
    assert.ok(file.includes(invalidateSig));
    assert.ok(file.includes(expireSig));

    for (const sig of [upsertSig, invalidateSig, expireSig]) {
      const body = sliceBetween(file, sig, "$fn$;");
      assert.ok(body.includes("language plpgsql"));
      assert.ok(body.includes("security definer"));
      assert.ok(body.includes("set search_path to 'public'"));

      // No dynamic SQL inside function bodies.
      // Note: grants/revokes elsewhere contain the word "execute"; we only scan the function body slice.
      assert.equal(/\bexecute\b/i.test(body), false);
      assert.equal(/format\(/i.test(body), false);
    }

    // Grants/revokes are service_role only.
    assert.ok(file.includes(
      "revoke execute on function public.upsert_sports_milestone_alerts_v1(jsonb) from public;"
    ));
    assert.ok(file.includes(
      "revoke execute on function public.upsert_sports_milestone_alerts_v1(jsonb) from anon, authenticated;"
    ));
    assert.ok(file.includes(
      "grant execute on function public.upsert_sports_milestone_alerts_v1(jsonb) to service_role;"
    ));

    assert.ok(file.includes(
      "revoke execute on function public.invalidate_obsolete_sports_milestone_alerts_v1() from public;"
    ));
    assert.ok(file.includes(
      "revoke execute on function public.invalidate_obsolete_sports_milestone_alerts_v1() from anon, authenticated;"
    ));
    assert.ok(file.includes(
      "grant execute on function public.invalidate_obsolete_sports_milestone_alerts_v1() to service_role;"
    ));

    assert.ok(file.includes(
      "revoke execute on function public.expire_sports_milestone_alerts_v1(timestamptz) from public;"
    ));
    assert.ok(file.includes(
      "revoke execute on function public.expire_sports_milestone_alerts_v1(timestamptz) from anon, authenticated;"
    ));
    assert.ok(file.includes(
      "grant execute on function public.expire_sports_milestone_alerts_v1(timestamptz) to service_role;"
    ));
  }

  // Rollback: exact signatures must be dropped.
  assert.ok(rb.includes("drop function if exists public.upsert_sports_milestone_alerts_v1(jsonb);"));
  assert.ok(rb.includes("drop function if exists public.invalidate_obsolete_sports_milestone_alerts_v1();"));
  assert.ok(rb.includes("drop function if exists public.expire_sports_milestone_alerts_v1(timestamptz);"));
});
