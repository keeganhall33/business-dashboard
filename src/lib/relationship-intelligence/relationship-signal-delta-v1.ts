export const RELATIONSHIP_SIGNAL_DELTA_VERSION = "RELATIONSHIP_SIGNAL_DELTA_V1" as const;

export type RelationshipSignalTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "PARTIAL";

export type RelationshipSignalTypeV1 =
  | "SPONSORSHIP_ANNOUNCEMENT"
  | "SPONSORSHIP_RENEWAL"
  | "SPONSORSHIP_END"
  | "EXECUTIVE_ROLE_CHANGE"
  | "REPRESENTATION_CHANGE"
  | "AGENCY_CLIENT_ANNOUNCEMENT"
  | "PARTNERSHIP_ANNOUNCEMENT"
  | "LICENSING_DEAL"
  | "TALENT_BRAND_CAMPAIGN"
  | "FOUNDATION_CHARITY_EVENT"
  | "OTHER_RELATIONSHIP_SIGNAL";

export type RelationshipKindV1 =
  | "SPONSOR_OF"
  | "PARTNER_OF"
  | "REPRESENTS"
  | "EMPLOYED_BY"
  | "MANAGES"
  | "CLIENT_OF"
  | "LICENSES"
  | "BOOKS"
  | "PROMOTES"
  | "RIGHTSHOLDER_FOR"
  | "SUPPORTS_FOUNDATION"
  | "CAMPAIGN_WITH"
  | "UNKNOWN";

export type RelationshipStatusV1 = "ACTIVE" | "ENDED" | "UNKNOWN";

export type RelationshipSignalV1 = {
  signalId: string;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string | Date;
  truthState: RelationshipSignalTruthStateV1;
  signalType: RelationshipSignalTypeV1;
  subjectEntityRef: string | null;
  objectEntityRef: string | null;
  relationshipKind: RelationshipKindV1;
  relationshipStatus: RelationshipStatusV1;
  evidenceRefs: readonly string[];
};

export type CanonicalRelationshipSnapshotV1 = {
  relationshipRef: string;
  subjectEntityRef: string;
  objectEntityRef: string;
  relationshipKind: RelationshipKindV1;
  relationshipStatus: RelationshipStatusV1;
  truthState: RelationshipSignalTruthStateV1;
  evidenceRefs: readonly string[];
  lastVerifiedAt: string | Date;
};

export type RelationshipSignalDeltaInputV1 = {
  signals: readonly RelationshipSignalV1[];
  currentRelationships: readonly CanonicalRelationshipSnapshotV1[];
  now: string | Date;
  maximumSignalAgeDays?: number;
  maximumCurrentRelationshipAgeDays?: number;
};

export type RelationshipSignalDeltaDispositionV1 =
  | "NEW_RELATIONSHIP_CANDIDATE"
  | "UPDATE_RELATIONSHIP_CANDIDATE"
  | "NO_MATERIAL_CHANGE"
  | "NEEDS_VERIFICATION"
  | "SUPPRESS";

export type RelationshipSignalChangeClassV1 =
  | "ADD_RELATIONSHIP"
  | "END_RELATIONSHIP"
  | "CONFIRM_EXISTING"
  | "NONE";

export type RelationshipSignalSafeNextStepV1 =
  | "NONE"
  | "RESOLVE_CANONICAL_ENTITIES"
  | "VERIFY_SOURCE_EVIDENCE"
  | "RECONCILE_CONFLICT"
  | "REVIEW_CANONICAL_DUPLICATE"
  | "REVIEW_RELATIONSHIP_CHANGE";

export type RelationshipSignalDeltaDecisionV1 = Readonly<{
  deltaId: string;
  idempotencyKey: string;
  signalId: string;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string;
  signalType: RelationshipSignalTypeV1;
  truthState: RelationshipSignalTruthStateV1;
  subjectEntityRef: string | null;
  objectEntityRef: string | null;
  relationshipKind: RelationshipKindV1;
  relationshipStatus: RelationshipStatusV1;
  evidenceRefs: readonly string[];
  disposition: RelationshipSignalDeltaDispositionV1;
  changeClass: RelationshipSignalChangeClassV1;
  matchedRelationshipRef: string | null;
  matchedRelationshipEvidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  safeNextStep: RelationshipSignalSafeNextStepV1;
}>;

export type RelationshipSignalDeltaResultV1 = Readonly<{
  version: typeof RELATIONSHIP_SIGNAL_DELTA_VERSION;
  generatedAt: string;
  decisions: readonly RelationshipSignalDeltaDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    newRelationshipCandidates: number;
    updateRelationshipCandidates: number;
    noMaterialChange: number;
    needsVerification: number;
    suppressed: number;
  }>;
  matchingPolicy: "EXACT_CANONICAL_DIRECTION_AND_RELATIONSHIP_KIND_ONLY";
  relationshipKindInferencePerformed: false;
  opportunityInferencePerformed: false;
  graphMutationPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const MAX_SIGNALS = 500;
const MAX_CURRENT_RELATIONSHIPS = 2_000;
const DEFAULT_SIGNAL_AGE_DAYS = 30;
const DEFAULT_CURRENT_RELATIONSHIP_AGE_DAYS = 180;

const TRUTH_STATES = new Set<RelationshipSignalTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);

const SIGNAL_TYPES = new Set<RelationshipSignalTypeV1>([
  "SPONSORSHIP_ANNOUNCEMENT",
  "SPONSORSHIP_RENEWAL",
  "SPONSORSHIP_END",
  "EXECUTIVE_ROLE_CHANGE",
  "REPRESENTATION_CHANGE",
  "AGENCY_CLIENT_ANNOUNCEMENT",
  "PARTNERSHIP_ANNOUNCEMENT",
  "LICENSING_DEAL",
  "TALENT_BRAND_CAMPAIGN",
  "FOUNDATION_CHARITY_EVENT",
  "OTHER_RELATIONSHIP_SIGNAL"
]);

const RELATIONSHIP_KINDS = new Set<RelationshipKindV1>([
  "SPONSOR_OF",
  "PARTNER_OF",
  "REPRESENTS",
  "EMPLOYED_BY",
  "MANAGES",
  "CLIENT_OF",
  "LICENSES",
  "BOOKS",
  "PROMOTES",
  "RIGHTSHOLDER_FOR",
  "SUPPORTS_FOUNDATION",
  "CAMPAIGN_WITH",
  "UNKNOWN"
]);

const RELATIONSHIP_STATUSES = new Set<RelationshipStatusV1>(["ACTIVE", "ENDED", "UNKNOWN"]);
const INPUT_KEYS = new Set([
  "signals",
  "currentRelationships",
  "now",
  "maximumSignalAgeDays",
  "maximumCurrentRelationshipAgeDays"
]);
const SIGNAL_KEYS = new Set([
  "signalId",
  "sourceEventKey",
  "sourceRef",
  "observedAt",
  "truthState",
  "signalType",
  "subjectEntityRef",
  "objectEntityRef",
  "relationshipKind",
  "relationshipStatus",
  "evidenceRefs"
]);
const CURRENT_KEYS = new Set([
  "relationshipRef",
  "subjectEntityRef",
  "objectEntityRef",
  "relationshipKind",
  "relationshipStatus",
  "truthState",
  "evidenceRefs",
  "lastVerifiedAt"
]);

type NormalizedSignal = Omit<RelationshipSignalV1, "observedAt" | "evidenceRefs"> & {
  observedAt: string;
  observedAtMs: number;
  evidenceRefs: readonly string[];
  relationKey: string | null;
  sourceIdentityKey: string;
};

type NormalizedCurrentRelationship = Omit<CanonicalRelationshipSnapshotV1, "lastVerifiedAt" | "evidenceRefs"> & {
  lastVerifiedAt: string;
  lastVerifiedAtMs: number;
  evidenceRefs: readonly string[];
  relationKey: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value: unknown, allowed: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (/op:\/\//i.test(normalized) || /(?:password|secret|token)\s*=/i.test(normalized)) {
    throw new Error(`${label} must not contain credential material`);
  }
  return normalized;
}

function nullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: unknown, label: string): string {
  if (!(typeof value === "string" || value instanceof Date)) throw new Error(`${label} must be a timestamp`);
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function refs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  return Object.freeze(normalized);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableToken(value: string): string {
  const normalized = value.toLocaleLowerCase("en-US").replace(/[^a-z0-9._:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) throw new Error("stable identity contains no usable characters");
  return normalized;
}

function relationKey(subjectEntityRef: string, relationshipKind: RelationshipKindV1, objectEntityRef: string): string {
  return `${subjectEntityRef}\u0000${relationshipKind}\u0000${objectEntityRef}`;
}

function normalizeSignal(signal: RelationshipSignalV1, index: number, nowMs: number): NormalizedSignal {
  assertKeys(signal, SIGNAL_KEYS, `signal ${index}`);
  const signalId = requiredText(signal.signalId, `signal ${index}.signalId`);
  const sourceEventKey = requiredText(signal.sourceEventKey, `signal ${index}.sourceEventKey`);
  const sourceRef = requiredText(signal.sourceRef, `signal ${index}.sourceRef`);
  const observedAt = timestamp(signal.observedAt, `signal ${index}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`signal ${index}.observedAt must not be future-dated`);

  if (!TRUTH_STATES.has(signal.truthState)) throw new Error(`signal ${index}.truthState is unsupported`);
  if (!SIGNAL_TYPES.has(signal.signalType)) throw new Error(`signal ${index}.signalType is unsupported`);
  if (!RELATIONSHIP_KINDS.has(signal.relationshipKind)) throw new Error(`signal ${index}.relationshipKind is unsupported`);
  if (!RELATIONSHIP_STATUSES.has(signal.relationshipStatus)) throw new Error(`signal ${index}.relationshipStatus is unsupported`);

  const subjectEntityRef = nullableText(signal.subjectEntityRef, `signal ${index}.subjectEntityRef`);
  const objectEntityRef = nullableText(signal.objectEntityRef, `signal ${index}.objectEntityRef`);
  const evidenceRefs = refs(signal.evidenceRefs, `signal ${index}.evidenceRefs`);
  const normalizedRelationKey = subjectEntityRef && objectEntityRef
    ? relationKey(subjectEntityRef, signal.relationshipKind, objectEntityRef)
    : null;

  return {
    signalId,
    sourceEventKey,
    sourceRef,
    observedAt,
    observedAtMs,
    truthState: signal.truthState,
    signalType: signal.signalType,
    subjectEntityRef,
    objectEntityRef,
    relationshipKind: signal.relationshipKind,
    relationshipStatus: signal.relationshipStatus,
    evidenceRefs,
    relationKey: normalizedRelationKey,
    sourceIdentityKey: `${sourceRef}\u0000${sourceEventKey}`
  };
}

function normalizeCurrentRelationship(
  relationship: CanonicalRelationshipSnapshotV1,
  index: number,
  nowMs: number
): NormalizedCurrentRelationship {
  assertKeys(relationship, CURRENT_KEYS, `currentRelationship ${index}`);
  const relationshipRef = requiredText(relationship.relationshipRef, `currentRelationship ${index}.relationshipRef`);
  const subjectEntityRef = requiredText(relationship.subjectEntityRef, `currentRelationship ${index}.subjectEntityRef`);
  const objectEntityRef = requiredText(relationship.objectEntityRef, `currentRelationship ${index}.objectEntityRef`);
  if (!RELATIONSHIP_KINDS.has(relationship.relationshipKind)) {
    throw new Error(`currentRelationship ${index}.relationshipKind is unsupported`);
  }
  if (!RELATIONSHIP_STATUSES.has(relationship.relationshipStatus)) {
    throw new Error(`currentRelationship ${index}.relationshipStatus is unsupported`);
  }
  if (!TRUTH_STATES.has(relationship.truthState)) {
    throw new Error(`currentRelationship ${index}.truthState is unsupported`);
  }
  const lastVerifiedAt = timestamp(relationship.lastVerifiedAt, `currentRelationship ${index}.lastVerifiedAt`);
  const lastVerifiedAtMs = Date.parse(lastVerifiedAt);
  if (lastVerifiedAtMs > nowMs) throw new Error(`currentRelationship ${index}.lastVerifiedAt must not be future-dated`);

  return {
    relationshipRef,
    subjectEntityRef,
    objectEntityRef,
    relationshipKind: relationship.relationshipKind,
    relationshipStatus: relationship.relationshipStatus,
    truthState: relationship.truthState,
    evidenceRefs: refs(relationship.evidenceRefs, `currentRelationship ${index}.evidenceRefs`),
    lastVerifiedAt,
    lastVerifiedAtMs,
    relationKey: relationKey(subjectEntityRef, relationship.relationshipKind, objectEntityRef)
  };
}

function sameSignalPayload(left: NormalizedSignal, right: NormalizedSignal): boolean {
  return left.truthState === right.truthState
    && left.signalType === right.signalType
    && left.subjectEntityRef === right.subjectEntityRef
    && left.objectEntityRef === right.objectEntityRef
    && left.relationshipKind === right.relationshipKind
    && left.relationshipStatus === right.relationshipStatus
    && left.observedAt === right.observedAt
    && JSON.stringify(left.evidenceRefs) === JSON.stringify(right.evidenceRefs);
}

function decisionBase(signal: NormalizedSignal) {
  const sourceToken = stableToken(signal.sourceRef);
  const eventToken = stableToken(signal.sourceEventKey);
  return {
    deltaId: `relationship-signal:${sourceToken}:${eventToken}`,
    idempotencyKey: `${RELATIONSHIP_SIGNAL_DELTA_VERSION}:${sourceToken}:${eventToken}`,
    signalId: signal.signalId,
    sourceEventKey: signal.sourceEventKey,
    sourceRef: signal.sourceRef,
    observedAt: signal.observedAt,
    signalType: signal.signalType,
    truthState: signal.truthState,
    subjectEntityRef: signal.subjectEntityRef,
    objectEntityRef: signal.objectEntityRef,
    relationshipKind: signal.relationshipKind,
    relationshipStatus: signal.relationshipStatus,
    evidenceRefs: [...signal.evidenceRefs]
  };
}

function decision(
  signal: NormalizedSignal,
  disposition: RelationshipSignalDeltaDispositionV1,
  changeClass: RelationshipSignalChangeClassV1,
  matchedRelationship: NormalizedCurrentRelationship | null,
  reasonCodes: readonly string[],
  safeNextStep: RelationshipSignalSafeNextStepV1
): RelationshipSignalDeltaDecisionV1 {
  return freezeDeep({
    ...decisionBase(signal),
    disposition,
    changeClass,
    matchedRelationshipRef: matchedRelationship?.relationshipRef ?? null,
    matchedRelationshipEvidenceRefs: matchedRelationship ? [...matchedRelationship.evidenceRefs] : [],
    reasonCodes: [...reasonCodes],
    safeNextStep
  });
}

function signalTruthReason(state: RelationshipSignalTruthStateV1): string | null {
  if (state === "KNOWN") return null;
  return `SIGNAL_TRUTH_${state}_REQUIRES_VERIFICATION`;
}

export function compileRelationshipSignalDeltasV1(input: RelationshipSignalDeltaInputV1): RelationshipSignalDeltaResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  if (!Array.isArray(input.signals)) throw new Error("signals must be an array");
  if (!Array.isArray(input.currentRelationships)) throw new Error("currentRelationships must be an array");
  if (input.signals.length > MAX_SIGNALS) throw new Error(`signals exceeds ${MAX_SIGNALS}`);
  if (input.currentRelationships.length > MAX_CURRENT_RELATIONSHIPS) {
    throw new Error(`currentRelationships exceeds ${MAX_CURRENT_RELATIONSHIPS}`);
  }

  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const maximumSignalAgeDays = boundedInteger(input.maximumSignalAgeDays, DEFAULT_SIGNAL_AGE_DAYS, 1, 3650, "maximumSignalAgeDays");
  const maximumCurrentRelationshipAgeDays = boundedInteger(
    input.maximumCurrentRelationshipAgeDays,
    DEFAULT_CURRENT_RELATIONSHIP_AGE_DAYS,
    1,
    3650,
    "maximumCurrentRelationshipAgeDays"
  );

  const signals = input.signals.map((signal, index) => normalizeSignal(signal, index, nowMs));
  const currentRelationships = input.currentRelationships.map((relationship, index) =>
    normalizeCurrentRelationship(relationship, index, nowMs)
  );

  const signalIds = new Set<string>();
  for (const signal of signals) {
    if (signalIds.has(signal.signalId)) throw new Error(`duplicate signalId ${signal.signalId}`);
    signalIds.add(signal.signalId);
  }

  const relationshipRefs = new Set<string>();
  for (const relationship of currentRelationships) {
    if (relationshipRefs.has(relationship.relationshipRef)) {
      throw new Error(`duplicate relationshipRef ${relationship.relationshipRef}`);
    }
    relationshipRefs.add(relationship.relationshipRef);
  }

  const sourceIdentityGroups = new Map<string, NormalizedSignal[]>();
  for (const signal of signals) {
    const group = sourceIdentityGroups.get(signal.sourceIdentityKey) ?? [];
    group.push(signal);
    sourceIdentityGroups.set(signal.sourceIdentityKey, group);
  }

  const exactRelationshipGroups = new Map<string, NormalizedCurrentRelationship[]>();
  for (const relationship of currentRelationships) {
    const group = exactRelationshipGroups.get(relationship.relationKey) ?? [];
    group.push(relationship);
    exactRelationshipGroups.set(relationship.relationKey, group);
  }

  const simultaneousKnownStatus = new Map<string, Set<RelationshipStatusV1>>();
  for (const signal of signals) {
    if (signal.relationKey == null || signal.truthState !== "KNOWN") continue;
    const key = `${signal.relationKey}\u0000${signal.observedAt}`;
    const statuses = simultaneousKnownStatus.get(key) ?? new Set<RelationshipStatusV1>();
    statuses.add(signal.relationshipStatus);
    simultaneousKnownStatus.set(key, statuses);
  }

  const canonicalSourceSignalId = new Map<string, string>();
  const conflictingSourceIdentity = new Set<string>();
  for (const [sourceIdentityKey, group] of sourceIdentityGroups) {
    if (group.length === 1) {
      canonicalSourceSignalId.set(sourceIdentityKey, group[0].signalId);
      continue;
    }
    const sorted = [...group].sort((a, b) => a.signalId.localeCompare(b.signalId));
    const first = sorted[0];
    if (sorted.every((item) => sameSignalPayload(first, item))) {
      canonicalSourceSignalId.set(sourceIdentityKey, first.signalId);
    } else {
      conflictingSourceIdentity.add(sourceIdentityKey);
    }
  }

  const decisions = signals
    .map((signal): RelationshipSignalDeltaDecisionV1 => {
      const sourceGroup = sourceIdentityGroups.get(signal.sourceIdentityKey) ?? [];
      if (conflictingSourceIdentity.has(signal.sourceIdentityKey)) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["CONFLICTING_SOURCE_EVENT_DUPLICATES"], "RECONCILE_CONFLICT");
      }
      if (sourceGroup.length > 1 && canonicalSourceSignalId.get(signal.sourceIdentityKey) !== signal.signalId) {
        return decision(signal, "SUPPRESS", "NONE", null, ["DUPLICATE_SOURCE_EVENT"], "NONE");
      }

      if (!signal.subjectEntityRef || !signal.objectEntityRef) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["CANONICAL_ENTITY_RESOLUTION_REQUIRED"], "RESOLVE_CANONICAL_ENTITIES");
      }
      if (signal.relationshipKind === "UNKNOWN") {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["RELATIONSHIP_KIND_UNKNOWN"], "VERIFY_SOURCE_EVIDENCE");
      }
      if (signal.relationshipStatus === "UNKNOWN") {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["RELATIONSHIP_STATUS_UNKNOWN"], "VERIFY_SOURCE_EVIDENCE");
      }
      if (signal.evidenceRefs.length === 0) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["EVIDENCE_REQUIRED"], "VERIFY_SOURCE_EVIDENCE");
      }

      const truthReason = signalTruthReason(signal.truthState);
      if (truthReason) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, [truthReason], signal.truthState === "CONFLICTED" ? "RECONCILE_CONFLICT" : "VERIFY_SOURCE_EVIDENCE");
      }
      if (nowMs - signal.observedAtMs > maximumSignalAgeDays * DAY_MS) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["SIGNAL_STALE_BY_AGE"], "VERIFY_SOURCE_EVIDENCE");
      }

      const simultaneousKey = `${signal.relationKey}\u0000${signal.observedAt}`;
      const simultaneousStatuses = simultaneousKnownStatus.get(simultaneousKey);
      if (simultaneousStatuses && simultaneousStatuses.has("ACTIVE") && simultaneousStatuses.has("ENDED")) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["CONFLICTING_SIMULTANEOUS_RELATIONSHIP_STATUS"], "RECONCILE_CONFLICT");
      }

      const matches = signal.relationKey ? exactRelationshipGroups.get(signal.relationKey) ?? [] : [];
      if (matches.length > 1) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", null, ["MULTIPLE_CANONICAL_RELATIONSHIP_MATCHES"], "REVIEW_CANONICAL_DUPLICATE");
      }
      if (matches.length === 0) {
        return decision(signal, "NEW_RELATIONSHIP_CANDIDATE", "ADD_RELATIONSHIP", null, ["FRESH_KNOWN_SIGNAL_WITH_EXACT_ENTITY_ANCHORS"], "REVIEW_RELATIONSHIP_CHANGE");
      }

      const matched = matches[0];
      if (matched.truthState !== "KNOWN") {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", matched, [`CURRENT_RELATIONSHIP_TRUTH_${matched.truthState}_REQUIRES_VERIFICATION`], matched.truthState === "CONFLICTED" ? "RECONCILE_CONFLICT" : "VERIFY_SOURCE_EVIDENCE");
      }
      if (matched.evidenceRefs.length === 0) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", matched, ["CURRENT_RELATIONSHIP_EVIDENCE_REQUIRED"], "VERIFY_SOURCE_EVIDENCE");
      }
      if (nowMs - matched.lastVerifiedAtMs > maximumCurrentRelationshipAgeDays * DAY_MS) {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", matched, ["CURRENT_RELATIONSHIP_STALE_BY_AGE"], "VERIFY_SOURCE_EVIDENCE");
      }
      if (matched.relationshipStatus === "UNKNOWN") {
        return decision(signal, "NEEDS_VERIFICATION", "NONE", matched, ["CURRENT_RELATIONSHIP_STATUS_UNKNOWN"], "VERIFY_SOURCE_EVIDENCE");
      }
      if (matched.relationshipStatus === signal.relationshipStatus) {
        return decision(signal, "NO_MATERIAL_CHANGE", "CONFIRM_EXISTING", matched, ["EXACT_RELATIONSHIP_ALREADY_CURRENT"], "NONE");
      }
      if (matched.relationshipStatus === "ACTIVE" && signal.relationshipStatus === "ENDED") {
        return decision(signal, "UPDATE_RELATIONSHIP_CANDIDATE", "END_RELATIONSHIP", matched, ["KNOWN_END_SIGNAL_FOR_CURRENT_ACTIVE_RELATIONSHIP"], "REVIEW_RELATIONSHIP_CHANGE");
      }

      return decision(signal, "NEEDS_VERIFICATION", "NONE", matched, ["PREVIOUSLY_ENDED_RELATIONSHIP_RESTART_AMBIGUOUS"], "REVIEW_RELATIONSHIP_CHANGE");
    })
    .sort((a, b) => a.deltaId.localeCompare(b.deltaId) || a.signalId.localeCompare(b.signalId));

  const counts = {
    reviewed: decisions.length,
    newRelationshipCandidates: decisions.filter((item) => item.disposition === "NEW_RELATIONSHIP_CANDIDATE").length,
    updateRelationshipCandidates: decisions.filter((item) => item.disposition === "UPDATE_RELATIONSHIP_CANDIDATE").length,
    noMaterialChange: decisions.filter((item) => item.disposition === "NO_MATERIAL_CHANGE").length,
    needsVerification: decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length,
    suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
  };

  return freezeDeep({
    version: RELATIONSHIP_SIGNAL_DELTA_VERSION,
    generatedAt,
    decisions,
    counts,
    matchingPolicy: "EXACT_CANONICAL_DIRECTION_AND_RELATIONSHIP_KIND_ONLY" as const,
    relationshipKindInferencePerformed: false as const,
    opportunityInferencePerformed: false as const,
    graphMutationPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const
  });
}
