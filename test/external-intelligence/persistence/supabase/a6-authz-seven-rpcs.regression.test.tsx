import test from "node:test";
import assert from "node:assert/strict";

import { createDisposableDb } from "./_rpc-disposable-db";

const RPCS = [
  "persist_external_evidence_reference_v1",
  "persist_external_claim_v1",
  "persist_external_signal_write_set_v1",
  "complete_external_processing_run_v1",
  "redact_external_evidence_payload_v1",
  "redact_external_claim_payload_v1",
  "redact_external_signal_payload_v1"
] as const;

function assertHas(haystack: string, needle: string) {
  assert.ok(haystack.includes(needle), `expected to include: ${needle}`);
}

function assertNotHas(haystack: string, needle: string) {
  assert.ok(!haystack.includes(needle), `expected to NOT include: ${needle}`);
}

test("a6 authz regression: seven RPCs use PostgREST JWT role gate (no session_user) and preserve security/grants", () => {
  const db = createDisposableDb();

  db.file("supabase/migrations/20260804_external_intelligence_phase_a5.sql");
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file("supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");
  db.file("supabase/migrations/20260807201000_external_intelligence_phase_a6_rpc_authz_fix.sql");

  for (const fn of RPCS) {
    const def = db.psql(
      `select pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='${fn}'
       limit 1;`
    );

    assert.ok(def.length > 0);
    const d = def.toLowerCase();
    assertNotHas(d, "session_user is distinct from 'service_role'");
    assertHas(d, "current_setting('request.jwt.claim.role'");
    assertHas(d, "current_setting('request.jwt.claims'");
    assertHas(d, "is distinct from 'service_role'");
    assertHas(d, "errcode = '42501'");
    assertHas(d, "message = 'unauthorized'");
    assertHas(d, "security definer");
    assertHas(d, "set search_path to 'public'");

    // Grants: service_role must have EXECUTE, and there must be no PUBLIC/anon/authenticated grants.
    const grants = db.psql(
      `select string_agg(grantee, ',')
       from information_schema.role_routine_grants
       where specific_schema='public' and routine_name='${fn}' and privilege_type='EXECUTE';`
    );
    assertHas(grants, "service_role");
    assertNotHas(grants, "anon");
    assertNotHas(grants, "authenticated");
    assertNotHas(grants, "public");

    // Auth gate behavior: missing role and wrong role both fail closed with 42501 unauthorized.
    // Provide minimal args so the auth check is exercised first.
    const minimalCallSqlByFn: Record<string, string> = {
      persist_external_evidence_reference_v1:
        "select persist_external_evidence_reference_v1('ev1', repeat('a',64), 'evidence_reference_v1','src','v1','lp','[]'::jsonb,null,null,null,'[]'::jsonb,'{}'::jsonb,'link_only',null,false,null,null,'r',true);",
      persist_external_claim_v1:
        "select persist_external_claim_v1('c1', repeat('b',64), 'claim_v1', 'fp1', 'p', 'iph', 'ev1', repeat('a',64), '{}'::jsonb, '[]'::jsonb, null,null,null, '[]'::jsonb, '{}'::jsonb, 'retain', null,false,null,null,'r',true,'supported_by','provenance/v1','ph');",
      persist_external_signal_write_set_v1:
        "select persist_external_signal_write_set_v1('sig1', repeat('c',64), 'external_signal_v1', 'fp', 'p', 'iph', 'ev1', repeat('a',64), 'cl1', repeat('b',64), 'ms1', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, null,null,null, '[]'::jsonb, '{}'::jsonb, 'retain', null,false,null,null,'r',true, 'supersedes', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'provenance/v1', 0, '{}'::jsonb, '{}'::jsonb);",
      complete_external_processing_run_v1: "select complete_external_processing_run_v1('run1');",
      redact_external_evidence_payload_v1: "select redact_external_evidence_payload_v1('ev1', repeat('a',64), 'reason');",
      redact_external_claim_payload_v1: "select redact_external_claim_payload_v1('c1', repeat('b',64), 'reason');",
      redact_external_signal_payload_v1: "select redact_external_signal_payload_v1('sig1', repeat('c',64), 'reason');"
    };

    const minimal = minimalCallSqlByFn[fn];

    assert.throws(() => {
      db.psql(minimal);
    }, /unauthorized/);

    assert.throws(() => {
      db.psql(`select set_config('request.jwt.claim.role','authenticated', false); ${minimal}`);
    }, /unauthorized/);
  }
});
