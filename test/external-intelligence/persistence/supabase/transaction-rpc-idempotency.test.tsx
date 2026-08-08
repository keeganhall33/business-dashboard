import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
const A6_AUTHZ = path.join(
  process.cwd(),
  "supabase/migrations/20260807201000_external_intelligence_phase_a6_rpc_authz_fix.sql"
);
const A6_DIGEST_FIX = path.join(
  process.cwd(),
  "supabase/migrations/20260808205200_schema_qualify_pgcrypto_digest.sql"
);
const A61RB = path.join(
  process.cwd(),
  "supabase/rollbacks/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
);

test("rpc idempotency + rollback/reapply sequence", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);
  db.file(A6_AUTHZ);
  db.file(A6_DIGEST_FIX);

    const evPayload = "'{\"ok\":true}'";
    const call = () =>
      db.psqlAs(
        "service_role",
        `select * from persist_external_evidence_reference_v1(
          'ev1','${"a".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
          null,null,null,'[]'::jsonb,${evPayload}::jsonb,
          'retain',null,false,null,null,'reason',true
        );`
      );

    const r1 = call();
    assert.ok(r1.includes("ev1"));
  const r2 = call();
  assert.ok(r2.includes("ev1"));

    // conflict: same id+hash different payload
  assert.throws(() =>
      db.psqlAs(
        "service_role",
        `select * from persist_external_evidence_reference_v1(
          'ev1','${"a".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
          null,null,null,'[]'::jsonb,'{"ok":false}'::jsonb,
          'retain',null,false,null,null,'reason',true
        );`
      )
  );

  // New content hash creates a second immutable version.
  db.psqlAs(
    "service_role",
    `select * from persist_external_evidence_reference_v1(
      'ev1','${"b".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
      null,null,null,'[]'::jsonb,'{"ok":2}'::jsonb,
      'retain',null,false,null,null,'reason',true
    );`
  );
  const vCount = db.psql(
    `select count(*) from external_evidence_reference_versions_v1 where evidence_reference_id='ev1';`
  );
  assert.equal(vCount, "2");

  // Claim: missing evidence version fails and leaves no claim rows.
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_claim_v1(
        'c_missing_ev','${"c".repeat(64)}','v1','fp1','signal-interpretation/v1','iph1',
        'ev_missing','${"d".repeat(64)}',
        '{"object_type":"evidence_reference","object_id":"ev_missing","content_hash":"${"d".repeat(64)}"}'::jsonb,
        '[]'::jsonb,
        null,null,null,'[]'::jsonb,'{"claim":1}'::jsonb,
        'retain',null,false,null,null,'reason',true,
        'supported_by','provenance/v1','ph1'
      );`
    )
  );
  assert.equal(db.psql("select count(*) from external_claims_v1 where claim_id='c_missing_ev';"), "0");
  assert.equal(
    db.psql("select count(*) from external_claim_versions_v1 where claim_id='c_missing_ev';"),
    "0"
  );

  // Claim: successful write creates stable+version+edge.
  db.psqlAs(
    "service_role",
    `select * from persist_external_claim_v1(
      'c1','${"e".repeat(64)}','v1','fp1','signal-interpretation/v1','iph1',
      'ev1','${"a".repeat(64)}',
      '{"object_type":"evidence_reference","object_id":"ev1","content_hash":"${"a".repeat(64)}"}'::jsonb,
      '[]'::jsonb,
      null,null,null,'[]'::jsonb,'{"claim":1}'::jsonb,
      'retain',null,false,null,null,'reason',true,
      'supported_by','provenance/v1','ph1'
    );`
  );
  assert.equal(db.psql("select count(*) from external_claims_v1 where claim_id='c1';"), "1");
  assert.equal(db.psql("select count(*) from external_claim_versions_v1 where claim_id='c1';"), "1");
  assert.equal(
    db.psql(
      `select count(*) from external_provenance_edges_v1 where from_object_type='claim' and from_object_id='c1';`
    ),
    "1"
  );

  // Claim: provenance failure rolls back entire call.
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_claim_v1(
        'c2','${"f".repeat(64)}','v1','fp2','signal-interpretation/v1','iph1',
        'ev1','${"a".repeat(64)}',
        '{"object_type":"evidence_reference","object_id":"ev1","content_hash":"${"a".repeat(64)}"}'::jsonb,
        '[]'::jsonb,
        null,null,null,'[]'::jsonb,'{"claim":2}'::jsonb,
        'retain',null,false,null,null,'reason',true,
        'supported_by','provenance/v1',null
      );`
    )
  );
  assert.equal(db.psql("select count(*) from external_claims_v1 where claim_id='c2';"), "0");
  assert.equal(db.psql("select count(*) from external_claim_versions_v1 where claim_id='c2';"), "0");

  // Signal: missing claim version fails and rolls back.
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_signal_write_set_v1(
        'sig1','${"1".repeat(64)}','v1','sfp1',
        'signal-interpretation/v1','siph1','confidence/v1','disposition/v1','entity-resolution/v1','source-registry/v1','legal/v1',
        '[]'::jsonb,
        '[{"object_type":"claim","object_id":"nope","content_hash":"${"2".repeat(64)}"}]'::jsonb,
        '[{"object_type":"evidence_reference","object_id":"ev1","content_hash":"${"a".repeat(64)}"}]'::jsonb,
        null,null,null,'[]'::jsonb,
        '{"signal":1}'::jsonb,'retain',null,false,null,null,'reason',true,
        'triage','{"confidence_label":"high","confidence_value":0.9}'::jsonb,
        '[]'::jsonb,'[]'::jsonb,
        null,0,'[]'::jsonb,
        null
      );`
    )
  );
  assert.equal(db.psql("select count(*) from external_signals_v1 where signal_id='sig1';"), "0");
  assert.equal(db.psql("select count(*) from external_signal_versions_v1 where signal_id='sig1';"), "0");

  // Signal: provenance self-supersession failure rolls back signal stable+version.
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_signal_write_set_v1(
        'sig2','${"3".repeat(64)}','v1','sfp2',
        'signal-interpretation/v1','siph1','confidence/v1','disposition/v1','entity-resolution/v1','source-registry/v1','legal/v1',
        '[]'::jsonb,
        '[{"object_type":"claim","object_id":"c1","content_hash":"${"e".repeat(64)}"}]'::jsonb,
        '[{"object_type":"evidence_reference","object_id":"ev1","content_hash":"${"a".repeat(64)}"}]'::jsonb,
        null,null,null,'[]'::jsonb,
        '{"signal":2}'::jsonb,'retain',null,false,null,null,'reason',true,
        'triage','{"confidence_label":"high","confidence_value":0.9}'::jsonb,
        ('[
          {
            "from_object_type":"signal",
            "from_object_id":"sig2",
            "from_content_hash":"${"3".repeat(64)}",
            "to_object_type":"signal",
            "to_object_id":"sig2",
            "to_content_hash":"${"3".repeat(64)}",
            "relation":"supersedes",
            "policy_version":"provenance/v1",
            "policy_hash":"phx",
            "from_ref_json":{"object_type":"signal","object_id":"sig2","content_hash":"${"3".repeat(64)}"},
            "to_ref_json":{"object_type":"signal","object_id":"sig2","content_hash":"${"3".repeat(64)}"},
            "metadata_json":{}
          }
        ]')::jsonb,
        '[]'::jsonb,
        null,0,'[]'::jsonb,
        null
      );`
    )
  );
  assert.equal(db.psql("select count(*) from external_signals_v1 where signal_id='sig2';"), "0");
  assert.equal(db.psql("select count(*) from external_signal_versions_v1 where signal_id='sig2';"), "0");

  // Apply rollback removes only RPCs
  db.file(A61RB);
    const fnExists = db.psql(
      `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='persist_external_evidence_reference_v1';`
    );
    assert.equal(fnExists, "0");

    // Tables still exist
    const tExists = db.psql(
      `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='external_evidence_references_v1' and c.relkind='r';`
    );
    assert.equal(tExists, "1");

  // Reapply
  db.file(A61);
  db.file(A6_AUTHZ);
  db.file(A6_DIGEST_FIX);
});
