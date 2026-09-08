import {
  normalizeHistoricalEmailMessagesV1,
  type HistoricalEmailEnvelopeV1,
  type HistoricalEmailHorizonV1,
  type HistoricalEmailNormalizationResultV1
} from "@/lib/email/ionos-email-normalization-v1";
import {
  projectCanonicalEmailToCrmV1,
  type CanonicalEmailCrmLinkInputV1,
  type CanonicalEmailCrmLinkResultV1
} from "@/lib/email/ionos-crm-linking-v1";
import {
  projectIonosRelationshipStateV1,
  type IonosRelationshipStateInputV1,
  type IonosRelationshipStateResultV1,
  type RelationshipActivityClassificationEvidenceV1
} from "@/lib/email/ionos-relationship-state-v1";
import {
  projectIonosIntelligentInboxV1,
  type IonosIntelligentInboxInputV1,
  type IonosIntelligentInboxResultV1
} from "@/lib/email/ionos-intelligent-inbox-v1";

export type IonosReadonlyIntelligencePipelineInputV1 = {
  messages: readonly HistoricalEmailEnvelopeV1[];
  horizon: HistoricalEmailHorizonV1;
  batchSize: number;
  crm: Omit<CanonicalEmailCrmLinkInputV1, "records">;
  classifyActivities: (
    crm: CanonicalEmailCrmLinkResultV1
  ) => readonly RelationshipActivityClassificationEvidenceV1[];
  relationship: Omit<IonosRelationshipStateInputV1, "crm" | "activityClassifications">;
  inbox: Omit<IonosIntelligentInboxInputV1, "relationshipState">;
};

export type IonosReadonlyIntelligencePipelineResultV1 = {
  normalization: HistoricalEmailNormalizationResultV1;
  crm: CanonicalEmailCrmLinkResultV1;
  relationship: IonosRelationshipStateResultV1;
  inbox: IonosIntelligentInboxResultV1;
  verificationRequired: {
    canonicalEmailIds: readonly string[];
    relationshipProjectionIds: readonly string[];
  };
  telemetry: {
    consideredCount: number;
    canonicalRecordCount: number;
    rejectionCount: number;
    crmActivityCount: number;
    relationshipProjectionCount: number;
    inboxAttentionCount: number;
    verificationRequiredCount: number;
  };
};

const INPUT_KEYS = new Set([
  "messages",
  "horizon",
  "batchSize",
  "crm",
  "classifyActivities",
  "relationship",
  "inbox"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPipelineInput(
  input: IonosReadonlyIntelligencePipelineInputV1
): asserts input is IonosReadonlyIntelligencePipelineInputV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.has(key)) throw new Error(`input contains unsupported key ${key}`);
  }
  if (!Array.isArray(input.messages)) throw new Error("messages must be an array");
  if (typeof input.classifyActivities !== "function") {
    throw new Error("classifyActivities must be a deterministic function");
  }
  if (!isPlainObject(input.crm)) throw new Error("crm must be a plain object");
  if (!isPlainObject(input.relationship)) throw new Error("relationship must be a plain object");
  if (!isPlainObject(input.inbox)) throw new Error("inbox must be a plain object");
}

export function projectIonosReadonlyIntelligencePipelineV1(
  input: IonosReadonlyIntelligencePipelineInputV1
): IonosReadonlyIntelligencePipelineResultV1 {
  assertPipelineInput(input);

  const normalization = normalizeHistoricalEmailMessagesV1({
    messages: input.messages,
    horizon: input.horizon,
    batchSize: input.batchSize
  });

  const crm = projectCanonicalEmailToCrmV1({
    ...input.crm,
    records: normalization.records
  });

  const activityClassifications = input.classifyActivities(crm);
  if (!Array.isArray(activityClassifications)) {
    throw new Error("classifyActivities must return an array");
  }

  const relationship = projectIonosRelationshipStateV1({
    ...input.relationship,
    crm,
    activityClassifications
  });

  const inbox = projectIonosIntelligentInboxV1({
    ...input.inbox,
    relationshipState: relationship
  });

  const canonicalEmailIds = crm.records
    .filter((record) => !record.decisionEligible)
    .map((record) => record.canonicalEmailId)
    .sort((left, right) => left.localeCompare(right));
  const relationshipProjectionIds = relationship.projections
    .filter((projection) => !projection.decisionEligible)
    .map((projection) => projection.projectionId)
    .sort((left, right) => left.localeCompare(right));

  return {
    normalization,
    crm,
    relationship,
    inbox,
    verificationRequired: {
      canonicalEmailIds,
      relationshipProjectionIds
    },
    telemetry: {
      consideredCount: normalization.consideredCount,
      canonicalRecordCount: normalization.records.length,
      rejectionCount: normalization.rejections.length,
      crmActivityCount: crm.activities.length,
      relationshipProjectionCount: relationship.projections.length,
      inboxAttentionCount: inbox.executiveAttention.length,
      verificationRequiredCount: canonicalEmailIds.length + relationshipProjectionIds.length
    }
  };
}
