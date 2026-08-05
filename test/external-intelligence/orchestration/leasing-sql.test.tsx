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

test("b2 leasing RPCs exist, are secure, and renew avoids ambiguous column refs", () => {
  const fwd = fs.readFileSync(
    "supabase/migrations/20260805_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );
  const schema = fs.readFileSync("supabase/schema.sql", "utf8");

  const renewSig = "create or replace function public.renew_external_collection_job_lease_v1(";

  for (const file of [fwd, schema]) {
    for (const sig of [
      "create or replace function public.lease_external_collection_job_v1(",
      renewSig,
      "create or replace function public.release_external_collection_job_lease_v1(",
      "create or replace function public.recover_expired_external_collection_leases_v1()"
    ]) {
      assert.ok(file.includes(sig));
      const body = sliceBetween(file, sig, "$fn$;");
      assert.ok(body.includes("language plpgsql"));
      assert.ok(body.includes("security definer"));
      assert.ok(body.includes("set search_path to 'public'"));
      assert.equal(/\bexecute\b/i.test(body), false);
    }

    const renewBody = sliceBetween(file, renewSig, "$fn$;");
    // Regression guard: qualify table columns to avoid plpgsql var ambiguity.
    assert.ok(renewBody.includes("public.external_collection_jobs_v1.job_id"));
    assert.ok(renewBody.includes("public.external_collection_jobs_v1.lease_owner"));
  }
});
