export const RELATIONSHIP_UNIVERSE_COVERAGE_V1_VERSION = "RELATIONSHIP_UNIVERSE_COVERAGE_V1" as const;

export type RelationshipUniverseDomainV1 =
  | "COLLEGE_ATHLETICS"
  | "PRO_SPORTS"
  | "ATHLETE_TALENT"
  | "MUSIC"
  | "FILM_TV"
  | "BRAND_CORPORATE"
  | "AGENCY_INTERMEDIARY"
  | "COLLECTIBLES_LICENSING";

export type RelationshipUniversePriorityTierV1 = "TIER_1" | "TIER_2" | "TIER_3";
export type RelationshipUniverseTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";

export type RelationshipUniverseCoverageDimensionV1 =
  | "DECISION_FUNCTION"
  | "DECISION_AUTHORITY"
  | "SPONSOR_ECOSYSTEM"
  | "ACCESS_PATH"
  | "PROFESSIONAL_CONTACT_ROUTE"
  | "PLANNING_WINDOW"
  | "RELATIONSHIP_HISTORY"
  | "CURRENT_ROLE"
  | "CURRENT_SIGNAL";

export type RelationshipUniverseDimensionEvidenceV1 = {
  state: RelationshipUniverseTruthStateV1;
  evidenceRefs: readonly string[];
};

export type RelationshipUniverseTargetV1 = {
  targetId: string;
  canonicalEntityRef?: string | null;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  observedAt: string | Date;
  evidenceRefs: readonly string[];
  requiredDimensions: readonly RelationshipUniverseCoverageDimensionV1[];
  dimensions: Partial<Record<RelationshipUniverseCoverageDimensionV1, RelationshipUniverseDimensionEvidenceV1>>;
};

export type RelationshipUniverseTargetDispositionV1 = "COMPLETE" | "GAPS" | "NEEDS_VERIFICATION" | "SUPPRESS";

export type RelationshipUniverseTargetCoverageV1 = Readonly<{
  targetId: string;
  canonicalEntityRef: string | null;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  disposition: RelationshipUniverseTargetDispositionV1;
  requiredDimensions: readonly RelationshipUniverseCoverageDimensionV1[];
  knownDimensions: readonly RelationshipUniverseCoverageDimensionV1[];
  missingDimensions: readonly RelationshipUniverseCoverageDimensionV1[];
  verificationDimensions: readonly RelationshipUniverseCoverageDimensionV1[];
  reasonCodes: readonly string[];
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type RelationshipUniverseGroupScorecardV1 = Readonly<{
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  targetCount: number;
  completeCount: number;
  gapCount: number;
  needsVerificationCount: number;
  suppressedCount: number;
  requiredDimensionCounts: Readonly<Record<RelationshipUniverseCoverageDimensionV1, number>>;
  knownDimensionCounts: Readonly<Record<RelationshipUniverseCoverageDimensionV1, number>>;
  missingDimensionCounts: Readonly<Record<RelationshipUniverseCoverageDimensionV1, number>>;
  verificationDimensionCounts: Readonly<Record<RelationshipUniverseCoverageDimensionV1, number>>;
}>;

export type RelationshipUniverseResearchPriorityV1 = Readonly<{
  targetId: string;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  dimension: RelationshipUniverseCoverageDimensionV1;
  workType: "RESEARCH_MISSING_FACT" | "VERIFY_EXISTING_FACT";
  reason: string;
}>;

export type RelationshipUniverseCoverageInputV1 = {
  targets: readonly RelationshipUniverseTargetV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
  maximumResearchPriorities?: number;
};

export type RelationshipUniverseCoverageResultV1 = Readonly<{
  version: typeof RELATIONSHIP_UNIVERSE_COVERAGE_V1_VERSION;
  generatedAt: string;
  targets: readonly RelationshipUniverseTargetCoverageV1[];
  groups: readonly RelationshipUniverseGroupScorecardV1[];
  researchPriorities: readonly RelationshipUniverseResearchPriorityV1[];
  counts: Readonly<{
    reviewed: number;
    complete: number;
    gaps: number;
    needsVerification: number;
    suppressed: number;
  }>;
  aggregateCoveragePercentage: null;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const MAX_TARGETS = 1_000;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 180;
const DEFAULT_MAX_RESEARCH_PRIORITIES = 50;

const DOMAINS: readonly RelationshipUniverseDomainV1[] = [
  "COLLEGE_ATHLETICS",
  "PRO_SPORTS",
  "ATHLETE_TALENT",
  "MUSIC",
  "FILM_TV",
  "BRAND_CORPORATE",
  "AGENCY_INTERMEDIARY",
  "COLLECTIBLES_LICENSING"
];

const PRIORITY_TIERS: readonly RelationshipUniversePriorityTierV1[] = ["TIER_1", "TIER_2", "TIER_3"];
const TRUTH_STATES = new Set<RelationshipUniverseTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"]);
const DIMENSIONS: readonly RelationshipUniverseCoverageDimensionV1[] = [
  "DECISION_FUNCTION",
  "DECISION_AUTHORITY",
  "SPONSOR_ECOSYSTEM",
  "ACCESS_PATH",
  "PROFESSIONAL_CONTACT_ROUTE",
  "PLANNING_WINDOW",
  "RELATIONSHIP_HISTORY",
  "CURRENT_ROLE",
  "CURRENT_SIGNAL"
];

const DIMENSION_PRIORITY: Record<RelationshipUniverseCoverageDimensionV1, number> = {
  DECISION_FUNCTION: 0,
  DECISION_AUTHORITY: 1,
  ACCESS_PATH: 2,
  PLANNING_WINDOW: 3,
  SPONSOR_ECOSYSTEM: 4,
  PROFESSIONAL_CONTACT_ROUTE: 5,
  CURRENT_ROLE: 6,
  RELATIONSHIP_HISTORY: 7,
  CURRENT_SIGNAL: 8
};

const TIER_PRIORITY: Record<RelationshipUniversePriorityTierV1, number> = { TIER_1: 0, TIER_2: 1, TIER_3: 2 };
const DOMAIN_PRIORITY = Object.fromEntries(DOMAINS.map((domain, index) => [domain, index])) as Record<RelationshipUniverseDomainV1, number>;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
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

function zeroDimensionRecord(): Record<RelationshipUniverseCoverageDimensionV1, number> {
  return {
    DECISION_FUNCTION: 0,
    DECISION_AUTHORITY: 0,
    SPONSOR_ECOSYSTEM: 0,
    ACCESS_PATH: 0,
    PROFESSIONAL_CONTACT_ROUTE: 0,
    PLANNING_WINDOW: 0,
    RELATIONSHIP_HISTORY: 0,
    CURRENT_ROLE: 0,
    CURRENT_SIGNAL: 0
  };
}

function normalizeTarget(target: RelationshipUniverseTargetV1, index: number, nowMs: number) {
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new Error(`target ${index} must be an object`);
  if (!DOMAINS.includes(target.domain)) throw new Error(`target ${index}.domain is unsupported`);
  if (!PRIORITY_TIERS.includes(target.priorityTier)) throw new Error(`target ${index}.priorityTier is unsupported`);

  const observedAt = timestamp(target.observedAt, `target ${index}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`target ${index}.observedAt must not be future-dated`);
  if (!Array.isArray(target.requiredDimensions) || target.requiredDimensions.length === 0) {
    throw new Error(`target ${index}.requiredDimensions must contain at least one dimension`);
  }

  const requiredDimensions: RelationshipUniverseCoverageDimensionV1[] = [
    ...new Set<RelationshipUniverseCoverageDimensionV1>(target.requiredDimensions)
  ];
  for (const dimension of requiredDimensions) {
    if (!DIMENSIONS.includes(dimension)) throw new Error(`target ${index}.requiredDimensions contains unsupported dimension`);
  }

  const dimensions: Partial<Record<RelationshipUniverseCoverageDimensionV1, Readonly<RelationshipUniverseDimensionEvidenceV1>>> = {};
  for (const dimension of requiredDimensions) {
    const field = target.dimensions?.[dimension];
    if (!field) continue;
    if (!TRUTH_STATES.has(field.state)) throw new Error(`target ${index}.dimensions.${dimension}.state is unsupported`);
    const evidenceRefs = refs(field.evidenceRefs, `target ${index}.dimensions.${dimension}.evidenceRefs`);
    if (field.state === "KNOWN" && evidenceRefs.length === 0) {
      throw new Error(`target ${index}.dimensions.${dimension} KNOWN state requires evidenceRefs`);
    }
    dimensions[dimension] = freezeDeep({ state: field.state, evidenceRefs: [...evidenceRefs] });
  }

  return {
    targetId: requiredText(target.targetId, `target ${index}.targetId`),
    canonicalEntityRef: optionalText(target.canonicalEntityRef, `target ${index}.canonicalEntityRef`),
    domain: target.domain,
    priorityTier: target.priorityTier,
    observedAt,
    observedAtMs,
    evidenceRefs: refs(target.evidenceRefs, `target ${index}.evidenceRefs`),
    requiredDimensions: requiredDimensions.sort((a, b) => DIMENSION_PRIORITY[a] - DIMENSION_PRIORITY[b]),
    dimensions
  };
}

function classifyTarget(
  target: ReturnType<typeof normalizeTarget>,
  nowMs: number,
  maximumEvidenceAgeDays: number
): RelationshipUniverseTargetCoverageV1 {
  const knownDimensions: RelationshipUniverseCoverageDimensionV1[] = [];
  const missingDimensions: RelationshipUniverseCoverageDimensionV1[] = [];
  const verificationDimensions: RelationshipUniverseCoverageDimensionV1[] = [];
  const recordStale = nowMs - target.observedAtMs > maximumEvidenceAgeDays * DAY_MS;

  for (const dimension of target.requiredDimensions) {
    const field = target.dimensions[dimension];
    if (!field || field.state === "UNKNOWN") {
      missingDimensions.push(dimension);
    } else if (field.state === "KNOWN" && !recordStale) {
      knownDimensions.push(dimension);
    } else {
      verificationDimensions.push(dimension);
    }
  }

  let disposition: RelationshipUniverseTargetDispositionV1;
  const reasonCodes: string[] = [];
  if (!target.canonicalEntityRef || target.evidenceRefs.length === 0) {
    disposition = "SUPPRESS";
    if (!target.canonicalEntityRef) reasonCodes.push("MISSING_CANONICAL_ENTITY_ANCHOR");
    if (target.evidenceRefs.length === 0) reasonCodes.push("MISSING_RECORD_PROVENANCE");
  } else if (verificationDimensions.length > 0 || recordStale) {
    disposition = "NEEDS_VERIFICATION";
    if (recordStale) reasonCodes.push("RECORD_EVIDENCE_STALE");
    for (const dimension of verificationDimensions) reasonCodes.push(`VERIFY_${dimension}`);
  } else if (missingDimensions.length > 0) {
    disposition = "GAPS";
    for (const dimension of missingDimensions) reasonCodes.push(`MISSING_${dimension}`);
  } else {
    disposition = "COMPLETE";
    reasonCodes.push("ALL_EXPLICITLY_REQUIRED_DIMENSIONS_KNOWN");
  }

  return freezeDeep({
    targetId: target.targetId,
    canonicalEntityRef: target.canonicalEntityRef,
    domain: target.domain,
    priorityTier: target.priorityTier,
    disposition,
    requiredDimensions: [...target.requiredDimensions],
    knownDimensions,
    missingDimensions,
    verificationDimensions,
    reasonCodes,
    observedAt: target.observedAt,
    evidenceRefs: [...target.evidenceRefs]
  });
}

function buildGroup(
  domain: RelationshipUniverseDomainV1,
  priorityTier: RelationshipUniversePriorityTierV1,
  targets: readonly RelationshipUniverseTargetCoverageV1[]
): RelationshipUniverseGroupScorecardV1 {
  const requiredDimensionCounts = zeroDimensionRecord();
  const knownDimensionCounts = zeroDimensionRecord();
  const missingDimensionCounts = zeroDimensionRecord();
  const verificationDimensionCounts = zeroDimensionRecord();

  for (const target of targets) {
    for (const dimension of target.requiredDimensions) requiredDimensionCounts[dimension] += 1;
    for (const dimension of target.knownDimensions) knownDimensionCounts[dimension] += 1;
    for (const dimension of target.missingDimensions) missingDimensionCounts[dimension] += 1;
    for (const dimension of target.verificationDimensions) verificationDimensionCounts[dimension] += 1;
  }

  return freezeDeep({
    domain,
    priorityTier,
    targetCount: targets.length,
    completeCount: targets.filter((target) => target.disposition === "COMPLETE").length,
    gapCount: targets.filter((target) => target.disposition === "GAPS").length,
    needsVerificationCount: targets.filter((target) => target.disposition === "NEEDS_VERIFICATION").length,
    suppressedCount: targets.filter((target) => target.disposition === "SUPPRESS").length,
    requiredDimensionCounts,
    knownDimensionCounts,
    missingDimensionCounts,
    verificationDimensionCounts
  });
}

function buildResearchPriorities(
  targets: readonly RelationshipUniverseTargetCoverageV1[],
  maximumResearchPriorities: number
): RelationshipUniverseResearchPriorityV1[] {
  const priorities: RelationshipUniverseResearchPriorityV1[] = [];
  for (const target of targets) {
    if (target.disposition === "SUPPRESS") continue;
    for (const dimension of target.missingDimensions) {
      priorities.push({
        targetId: target.targetId,
        domain: target.domain,
        priorityTier: target.priorityTier,
        dimension,
        workType: "RESEARCH_MISSING_FACT",
        reason: `Required ${dimension} is UNKNOWN or absent for this canonical target.`
      });
    }
    for (const dimension of target.verificationDimensions) {
      priorities.push({
        targetId: target.targetId,
        domain: target.domain,
        priorityTier: target.priorityTier,
        dimension,
        workType: "VERIFY_EXISTING_FACT",
        reason: `Required ${dimension} exists but is not current KNOWN evidence.`
      });
    }
  }

  priorities.sort((a, b) =>
    TIER_PRIORITY[a.priorityTier] - TIER_PRIORITY[b.priorityTier] ||
    DOMAIN_PRIORITY[a.domain] - DOMAIN_PRIORITY[b.domain] ||
    DIMENSION_PRIORITY[a.dimension] - DIMENSION_PRIORITY[b.dimension] ||
    a.targetId.localeCompare(b.targetId) ||
    a.workType.localeCompare(b.workType)
  );
  return priorities.slice(0, maximumResearchPriorities).map((priority) => freezeDeep(priority)) as RelationshipUniverseResearchPriorityV1[];
}

export function buildRelationshipUniverseCoverageV1(
  input: RelationshipUniverseCoverageInputV1
): RelationshipUniverseCoverageResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.targets)) throw new Error("targets must be an array");
  if (input.targets.length > MAX_TARGETS) throw new Error(`targets exceeds ${MAX_TARGETS}`);

  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const maximumEvidenceAgeDays = boundedInteger(
    input.maximumEvidenceAgeDays,
    DEFAULT_MAX_EVIDENCE_AGE_DAYS,
    1,
    3650,
    "maximumEvidenceAgeDays"
  );
  const maximumResearchPriorities = boundedInteger(
    input.maximumResearchPriorities,
    DEFAULT_MAX_RESEARCH_PRIORITIES,
    1,
    500,
    "maximumResearchPriorities"
  );

  const ids = new Set<string>();
  const targets = input.targets.map((target, index) => {
    const normalized = normalizeTarget(target, index, nowMs);
    if (ids.has(normalized.targetId)) throw new Error(`duplicate targetId: ${normalized.targetId}`);
    ids.add(normalized.targetId);
    return classifyTarget(normalized, nowMs, maximumEvidenceAgeDays);
  });

  targets.sort((a, b) =>
    TIER_PRIORITY[a.priorityTier] - TIER_PRIORITY[b.priorityTier] ||
    DOMAIN_PRIORITY[a.domain] - DOMAIN_PRIORITY[b.domain] ||
    a.targetId.localeCompare(b.targetId)
  );

  const groups: RelationshipUniverseGroupScorecardV1[] = [];
  for (const priorityTier of PRIORITY_TIERS) {
    for (const domain of DOMAINS) {
      const groupTargets = targets.filter((target) => target.domain === domain && target.priorityTier === priorityTier);
      if (groupTargets.length > 0) groups.push(buildGroup(domain, priorityTier, groupTargets));
    }
  }

  const counts = {
    reviewed: targets.length,
    complete: targets.filter((target) => target.disposition === "COMPLETE").length,
    gaps: targets.filter((target) => target.disposition === "GAPS").length,
    needsVerification: targets.filter((target) => target.disposition === "NEEDS_VERIFICATION").length,
    suppressed: targets.filter((target) => target.disposition === "SUPPRESS").length
  };

  return freezeDeep({
    version: RELATIONSHIP_UNIVERSE_COVERAGE_V1_VERSION,
    generatedAt,
    targets,
    groups,
    researchPriorities: buildResearchPriorities(targets, maximumResearchPriorities),
    counts,
    aggregateCoveragePercentage: null,
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    externalActionPerformed: false
  });
}
