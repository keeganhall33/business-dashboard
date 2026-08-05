import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");

test("legal hold blocks redaction; redaction sets tombstone state", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);

    // Seed stable+version directly (synthetic; local only).
    db.psql(
      `begin;
        insert into external_evidence_references_v1(evidence_reference_id,current_content_hash,source_id,source_config_version,legal_policy_version)
         values ('ev1','${"a".repeat(64)}','s1','v1','legal/v1');

        insert into external_evidence_reference_versions_v1(
          evidence_reference_id,content_hash,schema_version,source_id,source_config_version,legal_policy_version,
          policy_refs_json,supersedes_content_hashes,payload_json,retention_policy,payload_available,legal_hold
        ) values (
          'ev1','${"a".repeat(64)}','v1','s1','v1','legal/v1',
          '[]'::jsonb,'[]'::jsonb,'{"ok":true}'::jsonb,'retain',true,true
        );
      commit;`
    );

    assert.throws(() =>
      db.psqlAs(
        "service_role",
        `select * from redact_external_evidence_payload_v1('ev1','${"a".repeat(64)}','reason');`
      )
    );

    // Release hold and redact.
    db.psql(
      `update external_evidence_reference_versions_v1 set legal_hold=false where evidence_reference_id='ev1' and content_hash='${
        "a".repeat(64)
      }';`
    );

    db.psqlAs("service_role", `select * from redact_external_evidence_payload_v1('ev1','${"a".repeat(64)}','reason');`);

    const state = db.psql(
      `select payload_available||':'||coalesce(payload_json::text,'null') from external_evidence_reference_versions_v1 where evidence_reference_id='ev1' and content_hash='${
        "a".repeat(64)
      }';`
    );
  assert.equal(state, "false:null");
});
