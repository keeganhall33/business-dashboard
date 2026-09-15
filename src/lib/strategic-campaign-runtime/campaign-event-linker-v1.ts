import { createHash } from "node:crypto";

import type { CampaignSteeringSnapshotV1 } from "@/lib/strategic-campaign-runtime/campaign-steering-v1";

export type CampaignCanonicalEventSourceV1 = "CRM" | "RELATIONSHIP" | "OPPORTUNITY" | "EVIDENCE";
export type CampaignRelationshipStateV1 = "NO_RESPONSE" | "STRATEGIC_WAIT" | "BLOCKED_ACCESS" | "LOST_OPPORTUNITY";
export type CampaignEventLinkDispositionV1 =
  | "UPDATE_EXISTING"
  | "NO_MATERIAL_CHANGE"
  | "DUPLICATE"
  | "UNRELATED"
  | "REVIEW_REQUIRED";

export type CampaignCanonicalEventV1 = {
  eventId: string;
  source: CampaignCanonicalEventSourceV1;
  sourceRecordId: string;
  occurredAt: string;
  campaignId?: string;
  linkKeys?: readonly string[];
  evidenceRefs: readonly string[];
  freshness: "CURRENT" | "STALE" | "UNKNOWN";
  confidence: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  materialChange?: string;
  relationship?: {
    relationshipId: string;
    accessPathId: string;
    isPrimaryPath: boolean;
    state: CampaignRelationshipStateV1;
    authority: readonly string[];
  };
  proposedOutboundAction?: {
    actionId: string;
    approvalClass: "KEEGAN" | "REVIEW";
  };
};

export type CampaignEventLinkInputV1 = {
  snapshot: CampaignSteeringSnapshotV1;
  event: CampaignCanonicalEventV1;
  campaignLinkKeys: readonly string[];
  knownAuthorityByRelationship?: Readonly<Record<string, readonly string[]>>;
  appliedEventIds?: readonly string[];
  lastMaterialEventFingerprint?: string | null;
};

export type CampaignEventLinkResultV1 = {
  contractVersion: "CampaignEventLinkResultV1";
  disposition: CampaignEventLinkDispositionV1;
  campaignId: string;
  eventId: string;
  eventFingerprint: string;
  sourceRef: string;
  evidenceRefs: readonly string[];
  relationship: CampaignCanonicalEventV1["relationship"] | null;
  materialChange: string | null;
  steeringWake: {
    wakeId: string;
    wakeClass: "EVENT";
    triggerValue: string;
    actor: "CAMPAIGN_EVENT_LINKER_V1";
    at: string;
  } | null;
  outboundApproval: {
    actionId: string;
    approvalClass: "KEEGAN" | "REVIEW";
    approvalRequired: true;
  } | null;
  primaryPathPreserved: true;
  authorityExpanded: false;
  duplicateCampaignCreated: false;
  duplicateOutreachCreated: false;
  externalSideEffects: 0;
  writesPerformed: 0;
};

export class CampaignEventLinkError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CampaignEventLinkError";
  }
}

const SOURCES = new Set<CampaignCanonicalEventSourceV1>(["CRM", "RELATIONSHIP", "OPPORTUNITY", "EVIDENCE"]);
const RELATIONSHIP_STATES = new Set<CampaignRelationshipStateV1>([
  "NO_RESPONSE",
  "STRATEGIC_WAIT",
  "BLOCKED_ACCESS",
  "LOST_OPPORTUNITY"
]);
const MAX_LIST = 100;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new CampaignEventLinkError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new CampaignEventLinkError("INVALID_TIMESTAMP", `${label} is invalid`);
  return new Date(Date.parse(normalized)).toISOString();
}

function sortedUnique(values: readonly string[] | undefined, label: string): string[] {
  if (!Array.isArray(values)) throw new CampaignEventLinkError("INVALID_LIST", `${label} must be an array`);
  const result = [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
  if (result.length > MAX_LIST) throw new CampaignEventLinkError("BOUND_EXCEEDED", `${label} exceeds ${MAX_LIST}`);
  return result;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeRelationship(
  relationship: CampaignCanonicalEventV1["relationship"],
  knownAuthorityByRelationship: CampaignEventLinkInputV1["knownAuthorityByRelationship"]
): CampaignCanonicalEventV1["relationship"] | null {
  if (!relationship) return null;
  const relationshipId = required(relationship.relationshipId, "relationshipId");
  const authority = sortedUnique(relationship.authority, "relationship authority");
  const known = knownAuthorityByRelationship?.[relationshipId];
  if (known) {
    const allowed = new Set(sortedUnique(known, "known authority"));
    if (authority.some((item) => !allowed.has(item))) {
      throw new CampaignEventLinkError("ACCESS_PATH_AUTHORITY_INFLATION", "Event cannot expand known relationship authority");
    }
  }
  if (!RELATIONSHIP_STATES.has(relationship.state)) {
    throw new CampaignEventLinkError("UNSUPPORTED_RELATIONSHIP_STATE", "Relationship state is unsupported");
  }
  return {
    relationshipId,
    accessPathId: required(relationship.accessPathId, "accessPathId"),
    isPrimaryPath: relationship.isPrimaryPath === true,
    state: relationship.state,
    authority
  };
}

export function linkCampaignCanonicalEventV1(input: CampaignEventLinkInputV1): CampaignEventLinkResultV1 {
  if (!input?.snapshot?.run || !input.event) throw new CampaignEventLinkError("INVALID_INPUT", "Campaign snapshot and event are required");
  const campaignId = required(input.snapshot.run.id, "campaignId");
  const eventId = required(input.event.eventId, "eventId");
  const source = input.event.source;
  if (!SOURCES.has(source)) throw new CampaignEventLinkError("UNSUPPORTED_SOURCE", "Canonical event source is unsupported");
  const sourceRecordId = required(input.event.sourceRecordId, "sourceRecordId");
  const occurredAt = timestamp(input.event.occurredAt, "occurredAt");
  const evidenceRefs = sortedUnique(input.event.evidenceRefs, "evidenceRefs");
  if (!evidenceRefs.length) throw new CampaignEventLinkError("EVIDENCE_REQUIRED", "Canonical event requires evidence references");
  const campaignKeys = new Set(sortedUnique(input.campaignLinkKeys, "campaignLinkKeys"));
  const eventKeys = sortedUnique(input.event.linkKeys ?? [], "event linkKeys");
  const explicitCampaignMatch = input.event.campaignId?.trim() === campaignId;
  const keyMatch = eventKeys.some((key) => campaignKeys.has(key));
  const related = explicitCampaignMatch || keyMatch;
  const relationship = normalizeRelationship(input.event.relationship, input.knownAuthorityByRelationship);
  const materialChange = input.event.materialChange?.trim() || null;
  const outbound = input.event.proposedOutboundAction
    ? {
        actionId: required(input.event.proposedOutboundAction.actionId, "outbound actionId"),
        approvalClass: input.event.proposedOutboundAction.approvalClass,
        approvalRequired: true as const
      }
    : null;
  if (outbound && !new Set(["KEEGAN", "REVIEW"]).has(outbound.approvalClass)) {
    throw new CampaignEventLinkError("INVALID_APPROVAL_CLASS", "Outbound action must remain approval gated");
  }

  const identity = {
    campaignId,
    eventId,
    source,
    sourceRecordId,
    occurredAt,
    evidenceRefs,
    freshness: input.event.freshness,
    confidence: input.event.confidence,
    materialChange,
    relationship,
    outbound
  };
  const eventFingerprint = fingerprint(identity);
  const applied = new Set(sortedUnique(input.appliedEventIds ?? [], "appliedEventIds"));
  let disposition: CampaignEventLinkDispositionV1;
  if (applied.has(eventId)) disposition = "DUPLICATE";
  else if (!related) disposition = "UNRELATED";
  else if (input.event.freshness !== "CURRENT" || input.event.confidence === "LOW" || input.event.confidence === "UNKNOWN") {
    disposition = "REVIEW_REQUIRED";
  } else if (!materialChange || eventFingerprint === input.lastMaterialEventFingerprint) disposition = "NO_MATERIAL_CHANGE";
  else disposition = "UPDATE_EXISTING";

  const shouldWake = disposition === "UPDATE_EXISTING" && input.snapshot.run.state === "WAITING";
  return freeze({
    contractVersion: "CampaignEventLinkResultV1",
    disposition,
    campaignId,
    eventId,
    eventFingerprint,
    sourceRef: `${source.toLowerCase()}:${sourceRecordId}`,
    evidenceRefs,
    relationship,
    materialChange,
    steeringWake: shouldWake
      ? { wakeId: `campaign_event_${eventFingerprint.slice(0, 20)}`, wakeClass: "EVENT", triggerValue: `event:${eventId}`, actor: "CAMPAIGN_EVENT_LINKER_V1", at: occurredAt }
      : null,
    outboundApproval: outbound,
    primaryPathPreserved: true,
    authorityExpanded: false,
    duplicateCampaignCreated: false,
    duplicateOutreachCreated: false,
    externalSideEffects: 0,
    writesPerformed: 0
  });
}
