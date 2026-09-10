import type {
  EmailActivityProjectionV1,
  EmailEvidenceFreshnessStateV1,
  EmailEvidenceTruthStateV1,
} from "@/lib/email/ionos-crm-linking-v1";
import type { RelationshipActivityClassificationEvidenceV1 } from "@/lib/email/ionos-relationship-state-v1";

export type CrmActivityKindV1 =
  | "DIRECT_EMAIL"
  | "EMAIL_SYSTEM_EVENT"
  | "EMAIL_UNCLASSIFIED"
  | "MEETING"
  | "CALL"
  | "INTRODUCTION"
  | "NOTE"
  | "FOLLOW_UP"
  | "EVENT"
  | "PROJECT"
  | "DECISION"
  | "SYSTEM_EVENT";

export type CrmActivityProvenanceV1 = "DIRECT_HUMAN" | "HUMAN_RECORDED" | "SYSTEM" | "UNKNOWN";

export type CrmSupplementalActivityEvidenceV1 = {
  id: string;
  kind: Exclude<CrmActivityKindV1, "DIRECT_EMAIL" | "EMAIL_SYSTEM_EVENT" | "EMAIL_UNCLASSIFIED">;
  timestamp: string | null;
  actorLabel: string | null;
  entityLabel: string | null;
  summary: string;
  contactId: string | null;
  companyId: string | null;
  opportunityIds: readonly string[];
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  provenance: "HUMAN_RECORDED" | "SYSTEM";
  evidenceRefs: readonly string[];
};

export type CrmActivityTimelineInputV1 = {
  emailActivities: readonly EmailActivityProjectionV1[];
  emailClassifications: readonly RelationshipActivityClassificationEvidenceV1[];
  supplementalActivities?: readonly CrmSupplementalActivityEvidenceV1[];
};

export type CrmActivityTimelineItemV1 = {
  id: string;
  timestamp: string | null;
  kind: CrmActivityKindV1;
  provenance: CrmActivityProvenanceV1;
  direction: "INBOUND" | "OUTBOUND" | "SELF" | null;
  actorLabel: string | null;
  entityLabel: string | null;
  summary: string;
  contactId: string | null;
  companyId: string | null;
  opportunityIds: readonly string[];
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRefs: readonly string[];
};

export type CrmActivityTimelineV1 = {
  contractVersion: "crm_activity_timeline_v1";
  items: readonly CrmActivityTimelineItemV1[];
  coverage: "AVAILABLE" | "EMPTY";
  directHumanCount: number;
  systemEventCount: number;
  unknownProvenanceCount: number;
};

function canonicalTimestamp(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function classifyEmail(
  activity: EmailActivityProjectionV1,
  classifications: readonly RelationshipActivityClassificationEvidenceV1[],
): Pick<CrmActivityTimelineItemV1, "kind" | "provenance" | "direction" | "summary" | "evidenceRefs"> {
  const matches = classifications.filter(
    (classification) =>
      classification.activityId === activity.id && classification.canonicalEmailId === activity.canonicalEmailId,
  );

  if (matches.length !== 1) {
    return {
      kind: "EMAIL_UNCLASSIFIED",
      provenance: "UNKNOWN",
      direction: null,
      summary: "Email activity requires provenance classification before it can be treated as direct correspondence.",
      evidenceRefs: unique(activity.evidenceRefs),
    };
  }

  const classification = matches[0];
  if (classification.classification === "DIRECT_HUMAN") {
    return {
      kind: "DIRECT_EMAIL",
      provenance: "DIRECT_HUMAN",
      direction: classification.direction,
      summary:
        classification.direction === "INBOUND"
          ? "Direct inbound correspondence"
          : classification.direction === "OUTBOUND"
            ? "Direct outbound correspondence"
            : "Direct self correspondence",
      evidenceRefs: unique([...activity.evidenceRefs, classification.evidenceRef]),
    };
  }

  return {
    kind: "EMAIL_SYSTEM_EVENT",
    provenance: "SYSTEM",
    direction: classification.direction,
    summary: `Email system activity: ${classification.classification.replaceAll("_", " ").toLowerCase()}`,
    evidenceRefs: unique([...activity.evidenceRefs, classification.evidenceRef]),
  };
}

function emailItem(
  activity: EmailActivityProjectionV1,
  classifications: readonly RelationshipActivityClassificationEvidenceV1[],
): CrmActivityTimelineItemV1 {
  const classified = classifyEmail(activity, classifications);
  return {
    id: activity.id,
    timestamp: canonicalTimestamp(activity.effectiveTimestamp),
    kind: classified.kind,
    provenance: classified.provenance,
    direction: classified.direction,
    actorLabel: null,
    entityLabel: null,
    summary: classified.summary,
    contactId: activity.contactId || null,
    companyId: activity.companyId,
    opportunityIds: unique(
      activity.linkedEntities
        .filter((entity) => entity.entityType === "OPPORTUNITY")
        .map((entity) => entity.entityId),
    ),
    truthState: activity.truthState,
    freshnessState: activity.freshnessState,
    evidenceRefs: classified.evidenceRefs,
  };
}

function supplementalItem(activity: CrmSupplementalActivityEvidenceV1): CrmActivityTimelineItemV1 {
  return {
    id: activity.id,
    timestamp: canonicalTimestamp(activity.timestamp),
    kind: activity.kind,
    provenance: activity.provenance,
    direction: null,
    actorLabel: activity.actorLabel?.trim() || null,
    entityLabel: activity.entityLabel?.trim() || null,
    summary: activity.summary.trim(),
    contactId: activity.contactId,
    companyId: activity.companyId,
    opportunityIds: unique(activity.opportunityIds),
    truthState: activity.truthState,
    freshnessState: activity.freshnessState,
    evidenceRefs: unique(activity.evidenceRefs),
  };
}

function compareTimelineItems(left: CrmActivityTimelineItemV1, right: CrmActivityTimelineItemV1): number {
  if (left.timestamp && right.timestamp) {
    const byTime = right.timestamp.localeCompare(left.timestamp);
    if (byTime !== 0) return byTime;
  } else if (left.timestamp) {
    return -1;
  } else if (right.timestamp) {
    return 1;
  }
  return left.id.localeCompare(right.id);
}

export function toCrmActivityTimelineV1(input: CrmActivityTimelineInputV1): CrmActivityTimelineV1 {
  const emailItems = input.emailActivities.map((activity) => emailItem(activity, input.emailClassifications));
  const supplementalItems = (input.supplementalActivities ?? []).map(supplementalItem);
  const items = [...emailItems, ...supplementalItems].sort(compareTimelineItems);

  return {
    contractVersion: "crm_activity_timeline_v1",
    items,
    coverage: items.length ? "AVAILABLE" : "EMPTY",
    directHumanCount: items.filter((item) => item.provenance === "DIRECT_HUMAN").length,
    systemEventCount: items.filter((item) => item.provenance === "SYSTEM").length,
    unknownProvenanceCount: items.filter((item) => item.provenance === "UNKNOWN").length,
  };
}
