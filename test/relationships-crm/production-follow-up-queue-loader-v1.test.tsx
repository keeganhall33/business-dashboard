import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadProductionFollowUpQueueV1,
  type ProductionFollowUpQueueSourceV1
} from "@/lib/relationships-crm/production-follow-up-queue-loader-v1";

function source(overrides: Partial<ProductionFollowUpQueueSourceV1> = {}): ProductionFollowUpQueueSourceV1 {
  return {
    loadRelationshipStates: async () => [{
      relationship_state_id: "relationship:michelle:masters",
      contact_entity_id: "person:michelle-bevilacqua",
      thread_id: "manual:mercedes-masters",
      primary_state: "WAITING_ON_CONTACT",
      states: ["WAITING_ON_CONTACT", "HIGH_VALUE"],
      opportunity_ids: ["11111111-1111-4111-8111-111111111111"],
      mailbox_roles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP"],
      last_meaningful_interaction_json: {
        activityId: "activity:mercedes-follow-up-20260911",
        canonicalEmailId: "manual:mercedes-follow-up-20260911",
        effectiveTimestamp: "2026-09-11T12:00:00.000Z",
        direction: "OUTBOUND",
        mailboxRole: "KEEGAN",
        expectsReply: true
      },
      truth_state: "KNOWN",
      freshness_state: "CURRENT",
      decision_eligible: true,
      next_best_move_json: {
        move: "WAIT_FOR_CONTACT",
        status: "SUGGESTED_UNVERIFIED",
        evidenceRefs: ["user:mercedes-update-20260911"],
        blockingConditions: [],
        whatWouldChange: ["Direct reply received"]
      },
      prior_state_json: null,
      evidence_refs: ["user:mercedes-update-20260911"],
      evidence_fingerprint: "sha256:mercedes-state-v1"
    }],
    loadFollowUps: async () => [{
      follow_up_id: "follow-up:mercedes-20260922",
      contact_entity_id: "person:michelle-bevilacqua",
      thread_id: "manual:mercedes-masters",
      opportunity_id: "11111111-1111-4111-8111-111111111111",
      due_at: "2026-09-22T16:00:00.000Z",
      status: "OPEN",
      truth_state: "KNOWN",
      freshness_state: "CURRENT",
      evidence_refs: ["user:mercedes-update-20260911"],
      observed_at: "2026-09-11T12:00:00.000Z"
    }],
    loadActivePersonIds: async () => [{ entity_id: "person:michelle-bevilacqua" }],
    ...overrides
  };
}

test("loads canonical relationship and follow-up records into the existing queue", async () => {
  const result = await loadProductionFollowUpQueueV1({
    source: source(), now: "2026-09-14T16:00:00.000Z"
  });
  assert.ok(result);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.contactId, "person:michelle-bevilacqua");
  assert.deepEqual(result.items[0]?.queueClasses, ["WAITING_ON_CONTACT", "HIGH_VALUE"]);
  assert.equal(result.items[0]?.suggestedMove, "WAIT_FOR_CONTACT");
  assert.equal(result.items[0]?.requiresReview, false);
  assert.equal(Object.isFrozen(result.items[0]), true);
});

test("preserves stale conflicted and unknown truth as verification-required", async () => {
  const input = source({
    loadRelationshipStates: async () => [{
      ...(await source().loadRelationshipStates())[0] as object,
      truth_state: "CONFLICTED", freshness_state: "STALE", decision_eligible: false,
      states: ["CONFLICTED", "STALE_OPPORTUNITY"]
    }],
    loadFollowUps: async () => [{
      ...(await source().loadFollowUps())[0] as object,
      due_at: null, truth_state: "UNKNOWN", freshness_state: "UNKNOWN"
    }]
  });
  const result = await loadProductionFollowUpQueueV1({ source: input, now: "2026-09-14T16:00:00.000Z" });
  assert.ok(result);
  assert.equal(result.items[0]?.requiresReview, true);
  assert.equal(result.items[0]?.primaryQueueClass, "REQUIRES_VERIFICATION");
  assert.equal(result.items[0]?.suggestedMove, "VERIFY_EVIDENCE");
});

test("fails closed on unavailable malformed or oversized sources", async () => {
  assert.equal(await loadProductionFollowUpQueueV1({
    source: source({ loadRelationshipStates: async () => { throw new Error("unavailable"); } })
  }), null);
  assert.equal(await loadProductionFollowUpQueueV1({
    source: source({ loadFollowUps: async () => [{ follow_up_id: "partial" }] })
  }), null);
  assert.equal(await loadProductionFollowUpQueueV1({
    source: source({ loadActivePersonIds: async () => Array.from({ length: 5_001 }, (_, index) => ({ entity_id: `person:${index}` })) })
  }), null);
});

test("does not mutate source records and migration keeps CRM tables server-only", async () => {
  const rows = await source().loadRelationshipStates();
  const before = structuredClone(rows);
  await loadProductionFollowUpQueueV1({
    source: source({ loadRelationshipStates: async () => rows }), now: "2026-09-14T16:00:00.000Z"
  });
  assert.deepEqual(rows, before);

  const migration = readFileSync("supabase/migrations/20260914163559_crm_system_of_record_core_v1.sql", "utf8");
  for (const table of ["crm_relationship_states_v1", "crm_activities_v1", "crm_follow_ups_v1", "crm_opportunity_entities_v1"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.doesNotMatch(migration, /create policy|grant all|security definer/i);
});
