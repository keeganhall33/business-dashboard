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

test("b3 durable lock RPCs exist and are service_role-only in migration + schema mirror", () => {
  const mig = fs.readFileSync(
    "supabase/migrations/20260805_external_intelligence_phase_b3_internal_activation.sql",
    "utf8"
  );
  const schema = fs.readFileSync("supabase/schema.sql", "utf8");

  for (const file of [mig, schema]) {
    assert.ok(file.includes("create table if not exists public.internal_orchestration_locks_v1"));

    for (const sig of [
      "function public.acquire_internal_orchestration_lock_v1",
      "function public.renew_internal_orchestration_lock_v1",
      "function public.release_internal_orchestration_lock_v1"
    ]) {
      assert.ok(file.includes(sig));
      assert.ok(file.includes("language plpgsql"));
      assert.ok(file.includes("security definer"));
      assert.ok(file.includes("set search_path to 'public'"));
    }

    assert.ok(file.includes("revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from public;"));
    assert.ok(file.includes("revoke execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) from anon, authenticated;"));
    assert.ok(file.includes("grant execute on function public.acquire_internal_orchestration_lock_v1(text,text,integer) to service_role;"));

    assert.ok(file.includes("revoke execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) from public;"));
    assert.ok(file.includes("revoke execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) from anon, authenticated;"));
    assert.ok(file.includes("grant execute on function public.renew_internal_orchestration_lock_v1(text,text,integer) to service_role;"));

    assert.ok(file.includes("revoke execute on function public.release_internal_orchestration_lock_v1(text,text) from public;"));
    assert.ok(file.includes("revoke execute on function public.release_internal_orchestration_lock_v1(text,text) from anon, authenticated;"));
    assert.ok(file.includes("grant execute on function public.release_internal_orchestration_lock_v1(text,text) to service_role;"));

    // No dynamic SQL inside function bodies.
    const acquireBody = sliceBetween(file, "function public.acquire_internal_orchestration_lock_v1", "$fn$;");
    const renewBody = sliceBetween(file, "function public.renew_internal_orchestration_lock_v1", "$fn$;");
    const releaseBody = sliceBetween(file, "function public.release_internal_orchestration_lock_v1", "$fn$;");
    assert.equal(/\bexecute\b/i.test(acquireBody), false);
    assert.equal(/\bexecute\b/i.test(renewBody), false);
    assert.equal(/\bexecute\b/i.test(releaseBody), false);
  }
});
