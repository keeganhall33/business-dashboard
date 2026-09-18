import { createHash } from "node:crypto";

import {
  ExternalEventV1Schema,
  type ExternalEventV1
} from "@/lib/external-intelligence/contracts/external-event-v1";
import { computeEventFingerprintV1 } from "@/lib/external-intelligence/events/event-fingerprint-v1";

export const AUTONOMOUS_GROWTH_EVENT_PROPAGATION_POLICY_VERSION_V1 =
  "autonomous_growth_event_propagation_v1.0.0" as const;

export type EventPropagationTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type EventSourceAuthorityV1 =
  | "AUTHORITATIVE"
  | "PRIMARY"
  | "REPUTABLE"
  | "WEAK"
  | "UNKNOWN";

export type EventFreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";
export type EventMaterialityV1 = "MATERIAL" | "IMMATERIAL" | "UNKNOWN";
export type AffectedObjectTypeV1 =
  | "ENTITY"
  | "OPPORTUNITY"
  | "CAMPAIGN"
  | "DECISION"
  | "EXPERIMENT"
  | "RECOMMENDATION";

export type AffectedObjectChangeClassV1 =
  | "REFRESH"
  | "REVIEW"
  | "INVALIDATE"
  | "LINK";

export type EventInvestigationImpactV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type CanonicalAffectedObjectV1 = {
  objectType: AffectedObjectTypeV1;
  canonicalId: string;
  canonicalRef: string;
  currentVersion: string | null;
  changeClass: AffectedObjectChangeClassV1;
  materialChange: boolean;
  truthState: EventPropagationTruthStateV1;
  evidenceRefs: readonly string[];
  reasonCode: string;
};

export type EventInvestigationCandidateV1 = {
  branchId: string;
  domain: string;
  question: string;
  decisionImpact: EventInvestigationImpactV1;
  evidenceRefs: readonly string[];
  rationale: string;
};

export type EventContradictionV1 = {
  claimKey: string;
  supportingEvidenceRefs: readonly string[];
  contradictingEvidenceRefs: readonly string[];
};

export type AutonomousGrowthEventPropagationInputV1 = {
  event: ExternalEventV1;
  evaluatedAt: string;
  sourceAuthority: EventSourceAuthorityV1;
  freshness: EventFreshnessV1;
  materiality: EventMaterialityV1;
  evidenceRefs: readonly string[];
  affectedObjects: readonly CanonicalAffectedObjectV1[];
  investigationCandidates: readonly EventInvestigationCandidateV1[];
  contradictions: readonly EventContradictionV1[];
  priorAppliedEventIds: readonly string[];
  priorAppliedEventFingerprints: readonly string[];
};

export type EventPropagationStatusV1 =
  | "PROPAGATION_READY"
  | "REVIEW_REQUIRED"
  | "SUPPRESSED_DUPLICATE"
  | "SUPPRESSED_NO_CHANGE"
  | "SUPPRESSED_IMMATERIAL";

export type EventPropagationDispositionV1 = "PROJECT_CANONICAL_UPDATE" | "REVIEW_ONLY";

export type EventObjectUpdateIntentV1 = {
  objectType: AffectedObjectTypeV1;
  canonicalId: string;
  canonicalRef: string;
  currentVersion: string | null;
  changeClass: AffectedObjectChangeClassV1;
  truthState: EventPropagationTruthStateV1;
  reasonCode: string;
  evidenceRefs: readonly string[];
  disposition: EventPropagationDispositionV1;
  lineage: {
    eventId: string;
    eventFingerprint: string;
    eventPolicyVersion: string;
  };
};

export type SelectedEventInvestigationV1 = EventInvestigationCandidateV1 & {
  rank: number;
};

export type AutonomousGrowthEventPropagationResultV1 = {
  contractVersion: "AutonomousGrowthEventPropagationV1";
  policyVersion: typeof AUTONOMOUS_GROWTH_EVENT_PROPAGATION_POLICY_VERSION_V1;
  propagationId: string;
  evaluatedAt: string;
  eventId: string;
  eventFingerprint: string;
  status: EventPropagationStatusV1;
  sourceAuthority: EventSourceAuthorityV1;
  freshness: EventFreshnessV1;
  materiality: EventMaterialityV1;
  temporalState: "CURRENT" | "EXPIRED" | "UNKNOWN";
  evidenceRefs: readonly string[];
  updateIntents: readonly EventObjectUpdateIntentV1[];
  investigations: readonly SelectedEventInvestigationV1[];
  contradictions: readonly EventContradictionV1[];
  suppressionReasons: readonly string[];
  reviewReasons: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    canonicalPersistenceAuthorized: false;
    externalActionAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    publishAuthorized: false;
  };
};

export class AutonomousGrowthEventPropagationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AutonomousGrowthEventPropagationError";
  }
}

const MAX_AFFECTED_OBJECTS = 100;
const MAX_INVESTIGATION_CANDIDATES = 50;
const MAX_SELECTED_INVESTIGATIONS = 4;
const MAX_CONTRADICTIONS = 50;
const MAX_REFS = 100;
const MAX_TEXT = 512;

function required(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AutonomousGrowthEventPropagationError("REQUIRED_FIELD", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new AutonomousGrowthEventPropagationError("BOUNDS_EXCEEDED", `${label} exceeds ${max} characters`);
  }
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label, 128);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new AutonomousGrowthEventPropagationError("INVALID_TIMESTAMP", `${label} must be a valid ISO timestamp`);
  }
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new AutonomousGrowthEventPropagationError("BOUNDS_EXCEEDED", `${label} exceeds supported bounds`);
  }
  return [...new Set(values.map((value) => required(value, label, 256)))].sort((a, b) => a.localeCompare(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeEvent(event: ExternalEventV1): ExternalEventV1 {
  const parsed = ExternalEventV1Schema.safeParse(event);
  if (!parsed.success) {
    throw new AutonomousGrowthEventPropagationError("INVALID_EVENT", "event does not satisfy ExternalEventV1");
  }
  return parsed.data;
}

function normalizeAffectedObjects(
  affectedObjects: readonly CanonicalAffectedObjectV1[]
): CanonicalAffectedObjectV1[] {
  if (!Array.isArray(affectedObjects) || affectedObjects.length > MAX_AFFECTED_OBJECTS) {
    throw new AutonomousGrowthEventPropagationError(
      "BOUNDS_EXCEEDED",
      "affectedObjects exceeds supported bounds"
    );
  }

  const byKey = new Map<string, CanonicalAffectedObjectV1>();
  for (const object of affectedObjects) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      throw new AutonomousGrowthEventPropagationError("INVALID_AFFECTED_OBJECT", "affected object must be an object");
    }
    const normalized: CanonicalAffectedObjectV1 = {
      objectType: object.objectType,
      canonicalId: required(object.canonicalId, "affectedObject.canonicalId", 256),
      canonicalRef: required(object.canonicalRef, "affectedObject.canonicalRef", 512),
      currentVersion:
        object.currentVersion == null
          ? null
          : required(object.currentVersion, "affectedObject.currentVersion", 256),
      changeClass: object.changeClass,
      materialChange: object.materialChange === true,
      truthState: object.truthState,
      evidenceRefs: refs(object.evidenceRefs, "affectedObject.evidenceRefs"),
      reasonCode: required(object.reasonCode, "affectedObject.reasonCode", 128)
    };
    const key = `${normalized.objectType}:${normalized.canonicalId}`;
    const prior = byKey.get(key);
    if (prior && JSON.stringify(canonical(prior)) !== JSON.stringify(canonical(normalized))) {
      throw new AutonomousGrowthEventPropagationError(
        "CONFLICTING_AFFECTED_OBJECT",
        `conflicting projections supplied for ${key}`
      );
    }
    byKey.set(key, normalized);
  }

  return [...byKey.values()].sort(
    (a, b) => a.objectType.localeCompare(b.objectType) || a.canonicalId.localeCompare(b.canonicalId)
  );
}

function normalizeContradictions(
  contradictions: readonly EventContradictionV1[]
): EventContradictionV1[] {
  if (!Array.isArray(contradictions) || contradictions.length > MAX_CONTRADICTIONS) {
    throw new AutonomousGrowthEventPropagationError(
      "BOUNDS_EXCEEDED",
      "contradictions exceeds supported bounds"
    );
  }
  const normalized = contradictions.map((item) => {
    const supportingEvidenceRefs = refs(
      item.supportingEvidenceRefs,
      "contradiction.supportingEvidenceRefs"
    );
    const contradictingEvidenceRefs = refs(
      item.contradictingEvidenceRefs,
      "contradiction.contradictingEvidenceRefs"
    );
    if (supportingEvidenceRefs.length === 0 || contradictingEvidenceRefs.length === 0) {
      throw new AutonomousGrowthEventPropagationError(
        "INVALID_CONTRADICTION",
        "contradictions require both supporting and contradicting evidence"
      );
    }
    return {
      claimKey: required(item.claimKey, "contradiction.claimKey", 256),
      supportingEvidenceRefs,
      contradictingEvidenceRefs
    };
  });
  return normalized.sort((a, b) => a.claimKey.localeCompare(b.claimKey));
}

function impactRank(value: EventInvestigationImpactV1): number {
  if (value === "HIGH") return 0;
  if (value === "MEDIUM") return 1;
  if (value === "LOW") return 2;
  return 3;
}

function selectInvestigations(
  candidates: readonly EventInvestigationCandidateV1[]
): SelectedEventInvestigationV1[] {
  if (!Array.isArray(candidates) || candidates.length > MAX_INVESTIGATION_CANDIDATES) {
    throw new AutonomousGrowthEventPropagationError(
      "BOUNDS_EXCEEDED",
      "investigationCandidates exceeds supported bounds"
    );
  }
  const seen = new Set<string>();
  const normalized = candidates
    .map((candidate) => ({
      branchId: required(candidate.branchId, "investigation.branchId", 256),
      domain: required(candidate.domain, "investigation.domain", 128),
      question: required(candidate.question, "investigation.question", 512),
      decisionImpact: candidate.decisionImpact,
      evidenceRefs: refs(candidate.evidenceRefs, "investigation.evidenceRefs"),
      rationale: required(candidate.rationale, "investigation.rationale", 512)
    }))
    .filter((candidate) => {
      if (seen.has(candidate.branchId)) return false;
      seen.add(candidate.branchId);
      return true;
    })
    .sort(
      (a, b) =>
        impactRank(a.decisionImpact) - impactRank(b.decisionImpact) ||
        a.branchId.localeCompare(b.branchId)
    )
    .slice(0, MAX_SELECTED_INVESTIGATIONS);

  return normalized.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function temporalState(
  event: ExternalEventV1,
  evaluatedAt: string
): AutonomousGrowthEventPropagationResultV1["temporalState"] {
  if (event.times.effective_until == null) return "UNKNOWN";
  return Date.parse(event.times.effective_until) < Date.parse(evaluatedAt) ? "EXPIRED" : "CURRENT";
}

function eventNeedsReview(event: ExternalEventV1): boolean {
  return !["corroborated", "corrected"].includes(event.verification_state);
}

function makeResult(
  input: AutonomousGrowthEventPropagationInputV1,
  event: ExternalEventV1,
  eventFingerprint: string,
  evaluatedAt: string,
  evidenceRefs: readonly string[],
  affectedObjects: readonly CanonicalAffectedObjectV1[],
  contradictions: readonly EventContradictionV1[],
  status: EventPropagationStatusV1,
  suppressionReasons: readonly string[],
  reviewReasons: readonly string[]
): AutonomousGrowthEventPropagationResultV1 {
  const reviewOnly = status !== "PROPAGATION_READY";
  const updateIntents = status.startsWith("SUPPRESSED_")
    ? []
    : affectedObjects
        .filter((object) => object.materialChange)
        .map<EventObjectUpdateIntentV1>((object) => ({
          objectType: object.objectType,
          canonicalId: object.canonicalId,
          canonicalRef: object.canonicalRef,
          currentVersion: object.currentVersion,
          changeClass: object.changeClass,
          truthState: object.truthState,
          reasonCode: object.reasonCode,
          evidenceRefs: object.evidenceRefs,
          disposition: reviewOnly ? "REVIEW_ONLY" : "PROJECT_CANONICAL_UPDATE",
          lineage: {
            eventId: event.event_id,
            eventFingerprint,
            eventPolicyVersion: event.policy_version
          }
        }));

  const investigations =
    status === "SUPPRESSED_DUPLICATE" ||
    status === "SUPPRESSED_NO_CHANGE" ||
    status === "SUPPRESSED_IMMATERIAL"
      ? []
      : selectInvestigations(input.investigationCandidates);

  const result: AutonomousGrowthEventPropagationResultV1 = {
    contractVersion: "AutonomousGrowthEventPropagationV1",
    policyVersion: AUTONOMOUS_GROWTH_EVENT_PROPAGATION_POLICY_VERSION_V1,
    propagationId: stableId({
      eventId: event.event_id,
      eventFingerprint,
      status,
      affectedObjects: updateIntents.map((intent) => `${intent.objectType}:${intent.canonicalId}`),
      evaluatedAt
    }),
    evaluatedAt,
    eventId: event.event_id,
    eventFingerprint,
    status,
    sourceAuthority: input.sourceAuthority,
    freshness: input.freshness,
    materiality: input.materiality,
    temporalState: temporalState(event, evaluatedAt),
    evidenceRefs,
    updateIntents,
    investigations,
    contradictions,
    suppressionReasons: [...suppressionReasons],
    reviewReasons: [...reviewReasons],
    actionAuthority: {
      analysisOnly: true,
      canonicalPersistenceAuthorized: false,
      externalActionAuthorized: false,
      outreachAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false
    }
  };
  return freeze(result);
}

export function propagateAutonomousGrowthEventV1(
  input: AutonomousGrowthEventPropagationInputV1
): AutonomousGrowthEventPropagationResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AutonomousGrowthEventPropagationError("INVALID_INPUT", "input must be an object");
  }

  const event = normalizeEvent(input.event);
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const eventFingerprint = computeEventFingerprintV1(event);
  const evidenceRefs = refs(input.evidenceRefs, "evidenceRefs");
  const affectedObjects = normalizeAffectedObjects(input.affectedObjects);
  const contradictions = normalizeContradictions(input.contradictions);
  const priorIds = new Set(refs(input.priorAppliedEventIds, "priorAppliedEventIds"));
  const priorFingerprints = new Set(
    refs(input.priorAppliedEventFingerprints, "priorAppliedEventFingerprints")
  );

  if (priorIds.has(event.event_id) || priorFingerprints.has(eventFingerprint)) {
    return makeResult(
      input,
      event,
      eventFingerprint,
      evaluatedAt,
      evidenceRefs,
      affectedObjects,
      contradictions,
      "SUPPRESSED_DUPLICATE",
      ["EVENT_ALREADY_APPLIED"],
      []
    );
  }

  const materialChanges = affectedObjects.filter((object) => object.materialChange);
  if (materialChanges.length === 0 && contradictions.length === 0) {
    return makeResult(
      input,
      event,
      eventFingerprint,
      evaluatedAt,
      evidenceRefs,
      affectedObjects,
      contradictions,
      "SUPPRESSED_NO_CHANGE",
      ["NO_MATERIAL_OBJECT_CHANGE"],
      []
    );
  }

  if (input.materiality === "IMMATERIAL") {
    return makeResult(
      input,
      event,
      eventFingerprint,
      evaluatedAt,
      evidenceRefs,
      affectedObjects,
      contradictions,
      "SUPPRESSED_IMMATERIAL",
      ["EVENT_MARKED_IMMATERIAL"],
      []
    );
  }

  const reviewReasons: string[] = [];
  if (input.materiality === "UNKNOWN") reviewReasons.push("MATERIALITY_UNKNOWN");
  if (input.freshness !== "FRESH") reviewReasons.push(`FRESHNESS_${input.freshness}`);
  if (["WEAK", "UNKNOWN"].includes(input.sourceAuthority)) {
    reviewReasons.push(`SOURCE_AUTHORITY_${input.sourceAuthority}`);
  }
  if (eventNeedsReview(event)) {
    reviewReasons.push(`EVENT_VERIFICATION_${event.verification_state.toUpperCase()}`);
  }
  if (temporalState(event, evaluatedAt) === "EXPIRED") {
    reviewReasons.push("EVENT_EFFECTIVE_WINDOW_EXPIRED");
  }
  if (contradictions.length > 0 || materialChanges.some((object) => object.truthState === "CONFLICTED")) {
    reviewReasons.push("CONTRADICTION_REQUIRES_REVIEW");
  }
  if (evidenceRefs.length === 0) reviewReasons.push("EVENT_EVIDENCE_MISSING");

  return makeResult(
    input,
    event,
    eventFingerprint,
    evaluatedAt,
    evidenceRefs,
    affectedObjects,
    contradictions,
    reviewReasons.length === 0 ? "PROPAGATION_READY" : "REVIEW_REQUIRED",
    [],
    [...new Set(reviewReasons)].sort((a, b) => a.localeCompare(b))
  );
}
