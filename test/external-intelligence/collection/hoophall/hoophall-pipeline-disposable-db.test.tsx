import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "../../persistence/supabase/_rpc-disposable-db";
import { computeMilestoneCalendarHash, computeMilestoneContentHash, parseSportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import { buildMilestoneHorizonAlertsV2 } from "@/lib/external-intelligence/milestones/horizon-engine";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");
const B2 = path.join(process.cwd(), "supabase/migrations/20260805_external_intelligence_phase_b2_orchestration.sql");
const B6 = path.join(process.cwd(), "supabase/migrations/20260807195000_external_intelligence_phase_b6_hoophall_source.sql");

test("b6 hoophall pipeline: EvidenceReference -> Claim -> SportsMilestone persists + versions + horizon consumes", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);
  db.file(B2);
  db.file(B6);

  // Seed a Hoophall evidence reference (link-only).
  const evId = "ev_hoophall_1";
  const evHash = "a".repeat(64);
  db.psqlAs(
    "service_role",
    `select * from persist_external_evidence_reference_v1(
      '${evId}','${evHash}','evidence_reference_v1','sports.basketball.hoophall.official','v1','b6.hoophall.link_only.v1','[]'::jsonb,
      null,null,null,'[]'::jsonb,'{"headline":"Test","url":"https://www.hoophall.com/news/test"}'::jsonb,
      'link_only',null,false,null,null,'reason',true
    );`
  );

  assert.equal(db.psql(`select count(*) from external_evidence_references_v1 where evidence_reference_id='${evId}';`), "1");
  assert.equal(
    db.psql(`select count(*) from external_evidence_reference_versions_v1 where evidence_reference_id='${evId}';`),
    "1"
  );

  // Claim linked to the evidence version.
  const claimId = "cl_hoophall_1";
  const claimHash = "b".repeat(64);
  const claimFp = "fp_hoophall_1";
  db.psqlAs(
    "service_role",
    `select * from persist_external_claim_v1(
      '${claimId}','${claimHash}','claim_v1','${claimFp}','b6.hoophall.deterministic.v1','iph',
      '${evId}','${evHash}',
      '{"object_type":"evidence_reference","object_id":"${evId}","content_hash":"${evHash}"}'::jsonb,
      '[]'::jsonb,
      null,null,null,'[]'::jsonb,'{"predicate":"milestone_scheduled_for","object":"2027-08-15"}'::jsonb,
      'retain',null,false,null,null,'reason',true,
      'supported_by','provenance/v1','ph'
    );`
  );
  assert.equal(db.psql(`select count(*) from external_claims_v1 where claim_id='${claimId}';`), "1");
  assert.equal(db.psql(`select count(*) from external_claim_versions_v1 where claim_id='${claimId}';`), "1");
  assert.equal(
    db.psql(
      `select count(*) from external_provenance_edges_v1 where from_object_type='claim' and from_object_id='${claimId}';`
    ),
    "1"
  );

  // Sports milestone + version.
  const milestoneId = "sports.hoophall.hall_of_fame_enshrinement.2027-08-15";
  const payload1NoHash = {
    schema_version: "sports_milestone_v1",
    milestone_id: milestoneId,
    milestone_type: "hall_of_fame_anniversary_or_eligibility",
    subject_entities: [
      { entity_type: "organization", entity_id: "naismith_basketball_hall_of_fame", label: "Naismith Basketball Hall of Fame" }
    ],
    team: null,
    league: "basketball",
    geographic_market: "us",
    original_event_date: null,
    milestone_date: "2027-08-15",
    anniversary_number: null,
    season_or_year: "2027",
    championship_or_achievement_type: "hall_of_fame_enshrinement",
    historical_significance: "high",
    fan_collector_relevance: "high",
    partnership_potential: "medium",
    licensing_rights_considerations: [],
    evidence_refs: [{ label: "Test", url: "https://www.hoophall.com/news/test" }],
    source_ids: ["sports.basketball.hoophall.official"],
    confidence: "high",
    correction_status: "none",
    review_status: "unreviewed",
  };
  const milestoneHash1 = computeMilestoneContentHash(payload1NoHash);
  const payload1 = { ...payload1NoHash, content_hash: milestoneHash1 };

  db.psqlAs(
    "service_role",
    `select * from persist_sports_milestone_v1(
      '${milestoneId}','${milestoneHash1}','sports_milestone_v1',
      '${JSON.stringify(payload1).replaceAll("'", "''")}'::jsonb,
      '[{"policy_name":"b6.hoophall","semantic_version":"v1","content_hash":"ph"}]'::jsonb,
      '[{"label":"Test","url":"https://www.hoophall.com/news/test"}]'::jsonb,
      '["sports.basketball.hoophall.official"]'::jsonb,
      'hall_of_fame_anniversary_or_eligibility',
      'naismith_basketball_hall_of_fame',
      '',
      'basketball',
      null,
      '2027-08-15'::date,
      null,
      'original_artwork_no_formal_partnership',
      'high',
      'medium',
      '[]'::jsonb,
      'none'
    );`
  );

  assert.equal(db.psql(`select count(*) from sports_milestones_v1 where milestone_id='${milestoneId}';`), "1");
  assert.equal(
    db.psql(`select count(*) from sports_milestone_versions_v1 where milestone_id='${milestoneId}';`),
    "1"
  );

  // Idempotent replay: no new rows.
  db.psqlAs(
    "service_role",
    `select * from persist_sports_milestone_v1(
      '${milestoneId}','${milestoneHash1}','sports_milestone_v1',
      '${JSON.stringify(payload1).replaceAll("'", "''")}'::jsonb,
      '[{"policy_name":"b6.hoophall","semantic_version":"v1","content_hash":"ph"}]'::jsonb,
      '[{"label":"Test","url":"https://www.hoophall.com/news/test"}]'::jsonb,
      '["sports.basketball.hoophall.official"]'::jsonb,
      'hall_of_fame_anniversary_or_eligibility',
      'naismith_basketball_hall_of_fame',
      '',
      'basketball',
      null,
      '2027-08-15'::date,
      null,
      'original_artwork_no_formal_partnership',
      'high',
      'medium',
      '[]'::jsonb,
      'none'
    );`
  );
  assert.equal(
    db.psql(`select count(*) from sports_milestone_versions_v1 where milestone_id='${milestoneId}';`),
    "1"
  );

  // Corrected authoritative fact: new content hash + milestone_date change => new version, stable row updated.
  const payload2NoHash = { ...payload1NoHash, milestone_date: "2027-08-16" };
  const milestoneHash2 = computeMilestoneContentHash(payload2NoHash);
  const payload2 = { ...payload2NoHash, content_hash: milestoneHash2 };
  db.psqlAs(
    "service_role",
    `select * from persist_sports_milestone_v1(
      '${milestoneId}','${milestoneHash2}','sports_milestone_v1',
      '${JSON.stringify(payload2).replaceAll("'", "''")}'::jsonb,
      '[{"policy_name":"b6.hoophall","semantic_version":"v1","content_hash":"ph"}]'::jsonb,
      '[{"label":"Test","url":"https://www.hoophall.com/news/test"}]'::jsonb,
      '["sports.basketball.hoophall.official"]'::jsonb,
      'hall_of_fame_anniversary_or_eligibility',
      'naismith_basketball_hall_of_fame',
      '',
      'basketball',
      null,
      '2027-08-16'::date,
      null,
      'original_artwork_no_formal_partnership',
      'high',
      'medium',
      '[]'::jsonb,
      'none'
    );`
  );
  assert.equal(
    db.psql(`select count(*) from sports_milestone_versions_v1 where milestone_id='${milestoneId}';`),
    "2"
  );
  assert.equal(
    db.psql(`select current_content_hash from sports_milestones_v1 where milestone_id='${milestoneId}';`),
    milestoneHash2
  );

  // Horizon engine consumption proof (contract-level): calendar parses and produces alerts when within horizon.
  const policyJson = JSON.parse(
    require("node:fs").readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8")
  );
  const policy = parseAlertLeadTimePolicy(policyJson);
  const calendar = parseSportsMilestoneCalendar({
    schema_version: "sports_milestone_calendar_v1",
    calendar_version: "b6_test",
    fixture_status: "test_only",
    milestones: [payload2],
    calendar_content_hash: computeMilestoneCalendarHash({
      schema_version: "sports_milestone_calendar_v1",
      calendar_version: "b6_test",
      fixture_status: "test_only",
      milestones: [payload2]
    })
  });

  const alerts = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy: policy, now_ymd: "2027-07-01" });
  assert.ok(alerts.length >= 1);
});
