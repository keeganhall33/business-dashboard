import "@/lib/server-only";

import type { RelationshipStateProjectionV1 } from "@/lib/email/ionos-relationship-state-v1";
import {
  projectCanonicalRelationshipFollowUpQueueV1,
  type CanonicalFollowUpEvidenceV1,
  type CanonicalIdentityEvidenceV1,
  type CanonicalRelationshipFollowUpQueueResultV1
} from "@/lib/relationships-crm/canonical-follow-up-queue-v1";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const MAX_RELATIONSHIPS = 5_000;
const MAX_FOLLOW_UPS = 10_000;

type RelationshipStateRowV1 = {
  relationship_state_id: string;
  contact_entity_id: string;
  thread_id: string;
  primary_state: RelationshipStateProjectionV1["primaryState"];
  states: RelationshipStateProjectionV1["states"];
  opportunity_ids: string[];
  mailbox_roles: RelationshipStateProjectionV1["mailboxRoles"];
  last_meaningful_interaction_json: RelationshipStateProjectionV1["lastMeaningfulInteraction"];
  truth_state: RelationshipStateProjectionV1["truthState"];
  freshness_state: RelationshipStateProjectionV1["freshnessState"];
  decision_eligible: boolean;
  next_best_move_json: RelationshipStateProjectionV1["nextBestMove"];
  prior_state_json: RelationshipStateProjectionV1["priorState"];
  evidence_refs: string[];
  evidence_fingerprint: string;
};

type FollowUpRowV1 = {
  follow_up_id: string;
  contact_entity_id: string;
  thread_id: string | null;
  opportunity_id: string | null;
  due_at: string | null;
  status: CanonicalFollowUpEvidenceV1["status"];
  truth_state: CanonicalFollowUpEvidenceV1["truthState"];
  freshness_state: CanonicalFollowUpEvidenceV1["freshnessState"];
  evidence_refs: string[];
  observed_at: string;
};

export type ProductionFollowUpQueueSourceV1 = {
  loadRelationshipStates: () => Promise<readonly unknown[] | null>;
  loadFollowUps: () => Promise<readonly unknown[] | null>;
  loadActivePersonIds: () => Promise<readonly unknown[] | null>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(text);
  if (values.some((item) => item == null)) return null;
  return [...new Set(values as string[])].sort((a, b) => a.localeCompare(b));
}

function relationshipRow(value: unknown): RelationshipStateRowV1 | null {
  const row = object(value);
  const states = stringArray(row?.states);
  const opportunities = stringArray(row?.opportunity_ids);
  const roles = stringArray(row?.mailbox_roles);
  const evidenceRefs = stringArray(row?.evidence_refs);
  const nextBestMove = object(row?.next_best_move_json);
  if (!row || !text(row.relationship_state_id) || !text(row.contact_entity_id) || !text(row.thread_id)
      || !text(row.primary_state) || !states?.length || !opportunities || !roles || !evidenceRefs?.length
      || !text(row.truth_state) || !text(row.freshness_state) || typeof row.decision_eligible !== "boolean"
      || !nextBestMove || !text(row.evidence_fingerprint)) return null;
  return row as unknown as RelationshipStateRowV1;
}

function followUpRow(value: unknown): FollowUpRowV1 | null {
  const row = object(value);
  const evidenceRefs = stringArray(row?.evidence_refs);
  if (!row || !text(row.follow_up_id) || !text(row.contact_entity_id)
      || (row.thread_id != null && !text(row.thread_id))
      || (row.opportunity_id != null && !text(row.opportunity_id))
      || !text(row.status) || !text(row.truth_state) || !text(row.freshness_state)
      || !text(row.observed_at) || !evidenceRefs?.length) return null;
  return row as unknown as FollowUpRowV1;
}

function projection(row: RelationshipStateRowV1): RelationshipStateProjectionV1 {
  return {
    projectionId: row.relationship_state_id,
    contactId: row.contact_entity_id,
    threadId: row.thread_id,
    primaryState: row.primary_state,
    states: row.states,
    opportunityIds: row.opportunity_ids,
    mailboxRoles: row.mailbox_roles,
    lastMeaningfulInteraction: row.last_meaningful_interaction_json,
    truthState: row.truth_state,
    freshnessState: row.freshness_state,
    activeAskIds: [],
    commitmentSuggestionIds: [],
    evidenceRefs: row.evidence_refs,
    evidenceFingerprint: row.evidence_fingerprint,
    decisionEligible: row.decision_eligible,
    nextBestMove: row.next_best_move_json,
    supersedesProjectionId: null,
    priorState: row.prior_state_json
  };
}

function followUp(row: FollowUpRowV1): CanonicalFollowUpEvidenceV1 {
  return {
    followUpId: row.follow_up_id,
    contactId: row.contact_entity_id,
    threadId: row.thread_id,
    opportunityId: row.opportunity_id,
    dueAt: row.due_at,
    status: row.status,
    truthState: row.truth_state,
    freshnessState: row.freshness_state,
    evidenceRefs: row.evidence_refs,
    observedAt: row.observed_at
  };
}

function defaultSource(): ProductionFollowUpQueueSourceV1 {
  const client = getSupabaseServerClient();
  return {
    async loadRelationshipStates() {
      const { data, error } = await client.from("crm_relationship_states_v1")
        .select("relationship_state_id,contact_entity_id,thread_id,primary_state,states,opportunity_ids,mailbox_roles,last_meaningful_interaction_json,truth_state,freshness_state,decision_eligible,next_best_move_json,prior_state_json,evidence_refs,evidence_fingerprint")
        .order("relationship_state_id").limit(MAX_RELATIONSHIPS);
      if (error) throw error;
      return data;
    },
    async loadFollowUps() {
      const { data, error } = await client.from("crm_follow_ups_v1")
        .select("follow_up_id,contact_entity_id,thread_id,opportunity_id,due_at,status,truth_state,freshness_state,evidence_refs,observed_at")
        .order("follow_up_id").limit(MAX_FOLLOW_UPS);
      if (error) throw error;
      return data;
    },
    async loadActivePersonIds() {
      const { data, error } = await client.from("entities_v1")
        .select("entity_id").eq("entity_type", "person").eq("resolution_status", "active")
        .order("entity_id").limit(MAX_RELATIONSHIPS);
      if (error) throw error;
      return data;
    }
  };
}

export async function loadProductionFollowUpQueueV1(input: {
  now?: string | Date;
  source?: ProductionFollowUpQueueSourceV1;
} = {}): Promise<CanonicalRelationshipFollowUpQueueResultV1 | null> {
  try {
    const source = input.source ?? defaultSource();
    const [rawStates, rawFollowUps, rawPeople] = await Promise.all([
      source.loadRelationshipStates(), source.loadFollowUps(), source.loadActivePersonIds()
    ]);
    if (!Array.isArray(rawStates) || !Array.isArray(rawFollowUps) || !Array.isArray(rawPeople)
        || rawStates.length > MAX_RELATIONSHIPS || rawFollowUps.length > MAX_FOLLOW_UPS
        || rawPeople.length > MAX_RELATIONSHIPS) return null;
    const states = rawStates.map(relationshipRow);
    const followUps = rawFollowUps.map(followUpRow);
    const personIds = rawPeople.map((value) => text(object(value)?.entity_id));
    if (states.some((value) => value == null) || followUps.some((value) => value == null)
        || personIds.some((value) => value == null)) return null;
    const identities: CanonicalIdentityEvidenceV1[] = [...new Set(personIds as string[])]
      .sort((a, b) => a.localeCompare(b))
      .map((contactId) => ({ contactId, state: "RESOLVED", evidenceRefs: [`entity:${contactId}`] }));
    return projectCanonicalRelationshipFollowUpQueueV1({
      projections: (states as RelationshipStateRowV1[]).map(projection),
      followUps: (followUps as FollowUpRowV1[]).map(followUp),
      identities,
      now: input.now ?? new Date()
    });
  } catch {
    return null;
  }
}
