import type {
  RelationshipNextMoveV1,
  RelationshipStateProjectionV1
} from "@/lib/email/ionos-relationship-state-v1";
import type { CanonicalRelationshipFollowUpQueueItemV1 } from "@/lib/relationships-crm/canonical-follow-up-queue-v1";

export type RelationshipEvidenceAuthorityV2 =
  | "PRIMARY"
  | "VERIFIED_INTERNAL"
  | "SECONDARY"
  | "UNKNOWN";

export type RelationshipNextActionConfidenceV2 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type RelationshipNextActionReasonV2 =
  | "CONFLICTED_EVIDENCE"
  | "STALE_EVIDENCE"
  | "MISSING_EVIDENCE"
  | "INSUFFICIENT_AUTHORITY"
  | "REPLY_REQUIRED"
  | "OVERDUE_FOLLOW_UP"
  | "FOLLOW_UP_DUE"
  | "ACTIVE_OPPORTUNITY"
  | "WAITING_ON_CONTACT"
  | "NO_ACTION_REQUIRED";

export type RelationshipNextActionAssessmentV2 =
  | "SUPPORTED"
  | "STALE"
  | "CONFLICTED"
  | "UNKNOWN"
  | "AUTHORITY_LIMITED";

export type RelationshipNextActionConfidenceInputV2 = {
  relationshipId: string;
  projection: RelationshipStateProjectionV1 | null;
  followUps?: readonly CanonicalRelationshipFollowUpQueueItemV1[];
  evidenceAuthorityByRef?: Readonly<Record<string, RelationshipEvidenceAuthorityV2>>;
};

export type RelationshipNextActionV2 = {
  move: RelationshipNextMoveV1;
  confidence: RelationshipNextActionConfidenceV2;
  reasonCodes: readonly RelationshipNextActionReasonV2[];
  evidenceRefs: readonly string[];
  opportunityIds: readonly string[];
  followUpIds: readonly string[];
};

export type RelationshipNextActionConfidenceResultV2 = {
  relationshipId: string;
  assessment: RelationshipNextActionAssessmentV2;
  action: RelationshipNextActionV2 | null;
  outboundAllowed: false;
  writeAllowed: false;
};

const MAX_EVIDENCE_REFS = 50;
const MAX_CONTEXT_IDS = 20;
const AUTHORITIES = new Set<RelationshipEvidenceAuthorityV2>([
  "PRIMARY",
  "VERIFIED_INTERNAL",
  "SECONDARY",
  "UNKNOWN"
]);

function uniqueSorted(values: readonly string[], cap: number): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, cap);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function matchingFollowUps(
  relationshipId: string,
  projection: RelationshipStateProjectionV1 | null,
  followUps: readonly CanonicalRelationshipFollowUpQueueItemV1[]
): CanonicalRelationshipFollowUpQueueItemV1[] {
  return followUps
    .filter((item) => item.contactId === relationshipId || item.itemId === relationshipId)
    .filter((item) => !projection || item.projectionId === projection.projectionId || item.threadId === projection.threadId)
    .sort((left, right) => right.priority - left.priority || left.itemId.localeCompare(right.itemId));
}

function action(
  move: RelationshipNextMoveV1,
  confidence: RelationshipNextActionConfidenceV2,
  reasonCodes: readonly RelationshipNextActionReasonV2[],
  evidenceRefs: readonly string[],
  opportunityIds: readonly string[],
  followUpIds: readonly string[]
): RelationshipNextActionV2 {
  return {
    move,
    confidence,
    reasonCodes: [...reasonCodes],
    evidenceRefs: [...evidenceRefs],
    opportunityIds: [...opportunityIds],
    followUpIds: [...followUpIds]
  };
}

/**
 * Selects at most one read-only next action from canonical relationship and follow-up projections.
 * The adapter deliberately fails closed when evidence is absent, stale, conflicted, or lacks authority.
 */
export function selectRelationshipNextActionConfidenceV2(
  input: RelationshipNextActionConfidenceInputV2
): RelationshipNextActionConfidenceResultV2 {
  const relationshipId = input.relationshipId?.trim();
  if (!relationshipId) throw new Error("relationshipId must be a non-empty string");
  if (input.followUps != null && !Array.isArray(input.followUps)) throw new Error("followUps must be an array");

  const followUps = matchingFollowUps(relationshipId, input.projection, input.followUps ?? []);
  const evidenceRefs = uniqueSorted(
    [...(input.projection?.evidenceRefs ?? []), ...followUps.flatMap((item) => item.evidenceRefs)],
    MAX_EVIDENCE_REFS
  );
  const opportunityIds = uniqueSorted(
    [...(input.projection?.opportunityIds ?? []), ...followUps.flatMap((item) => item.opportunityIds)],
    MAX_CONTEXT_IDS
  );
  const followUpIds = uniqueSorted(followUps.flatMap((item) => item.followUpIds), MAX_CONTEXT_IDS);
  const context = { evidenceRefs, opportunityIds, followUpIds };

  const result = (
    assessment: RelationshipNextActionAssessmentV2,
    selectedAction: RelationshipNextActionV2 | null
  ): RelationshipNextActionConfidenceResultV2 =>
    deepFreeze({ relationshipId, assessment, action: selectedAction, outboundAllowed: false, writeAllowed: false });

  if (!input.projection || evidenceRefs.length === 0) {
    return result("UNKNOWN", null);
  }

  const isConflicted =
    input.projection.truthState === "CONFLICTED" ||
    input.projection.states.includes("CONFLICTED") ||
    followUps.some((item) => item.truthState === "CONFLICTED");
  if (isConflicted) {
    return result(
      "CONFLICTED",
      action("VERIFY_EVIDENCE", "LOW", ["CONFLICTED_EVIDENCE"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }

  const isStale =
    input.projection.freshnessState === "STALE" ||
    input.projection.states.includes("STALE_THREAD") ||
    input.projection.states.includes("STALE_OPPORTUNITY") ||
    followUps.some((item) => item.freshnessState === "STALE");
  if (isStale) {
    return result(
      "STALE",
      action("VERIFY_EVIDENCE", "LOW", ["STALE_EVIDENCE"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }

  const isUnknown =
    input.projection.truthState === "UNKNOWN" ||
    input.projection.freshnessState === "UNKNOWN" ||
    input.projection.states.includes("UNKNOWN") ||
    followUps.some((item) => item.truthState === "UNKNOWN" || item.freshnessState === "UNKNOWN");
  if (isUnknown) {
    return result(
      "UNKNOWN",
      action("VERIFY_EVIDENCE", "UNKNOWN", ["MISSING_EVIDENCE"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }

  const authorities = evidenceRefs.map((ref) => input.evidenceAuthorityByRef?.[ref] ?? "UNKNOWN");
  if (authorities.some((authority) => !AUTHORITIES.has(authority))) {
    throw new Error("evidenceAuthorityByRef contains an unsupported authority");
  }
  if (authorities.some((authority) => authority === "SECONDARY" || authority === "UNKNOWN")) {
    return result(
      "AUTHORITY_LIMITED",
      action("VERIFY_EVIDENCE", "LOW", ["INSUFFICIENT_AUTHORITY"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }

  const confidence: RelationshipNextActionConfidenceV2 = authorities.every((authority) => authority === "PRIMARY")
    ? "HIGH"
    : "MEDIUM";
  const queueClasses = new Set(followUps.flatMap((item) => item.queueClasses));

  if (input.projection.primaryState === "NEEDS_REPLY" || queueClasses.has("NEEDS_REPLY")) {
    return result(
      "SUPPORTED",
      action("PREPARE_REPLY", confidence, ["REPLY_REQUIRED"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }
  if (queueClasses.has("OVERDUE")) {
    return result(
      "SUPPORTED",
      action("PREPARE_FOLLOW_UP", confidence, ["OVERDUE_FOLLOW_UP"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }
  if (queueClasses.has("FOLLOW_UP_THIS_WEEK") || followUpIds.length > 0) {
    return result(
      "SUPPORTED",
      action("PREPARE_FOLLOW_UP", confidence, ["FOLLOW_UP_DUE"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }
  if (opportunityIds.length > 0) {
    return result(
      "SUPPORTED",
      action("PREPARE_FOLLOW_UP", confidence, ["ACTIVE_OPPORTUNITY"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }
  if (input.projection.primaryState === "WAITING_ON_CONTACT" || queueClasses.has("WAITING_ON_CONTACT")) {
    return result(
      "SUPPORTED",
      action("WAIT_FOR_CONTACT", confidence, ["WAITING_ON_CONTACT"], context.evidenceRefs, context.opportunityIds, context.followUpIds)
    );
  }

  return result("SUPPORTED", null);
}
