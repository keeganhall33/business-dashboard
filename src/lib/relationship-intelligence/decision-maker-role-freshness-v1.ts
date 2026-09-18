export const DECISION_MAKER_ROLE_FRESHNESS_VERSION = "DECISION_MAKER_ROLE_FRESHNESS_V1" as const;

export type RoleFreshnessTruthStateV1 = "KNOWN" | "INFERRED" | "PARTIAL" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type RoleEmploymentStateV1 = "CURRENT" | "DEPARTED" | "UNKNOWN";
export type RoleAuthorityClassV1 = "DECISION_MAKER" | "BUDGET_OWNER" | "INFLUENCER" | "GATEKEEPER" | "SALES_OWNER" | "UNKNOWN";

export type RoleEvidenceFieldV1<T> = Readonly<{
  state: RoleFreshnessTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
}>;

export type DecisionMakerRoleObservationV1 = Readonly<{
  observationId: string;
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
  observedAt: string | Date;
  sourceRef: string;
  evidenceRefs: readonly string[];
  truthState: RoleFreshnessTruthStateV1;
  employmentState: RoleEvidenceFieldV1<RoleEmploymentStateV1>;
  title: RoleEvidenceFieldV1<string>;
  decisionFunction: RoleEvidenceFieldV1<string>;
  authorityClass: RoleEvidenceFieldV1<RoleAuthorityClassV1>;
}>;

export type DecisionMakerRoleFreshnessInputV1 = Readonly<{
  observations: readonly DecisionMakerRoleObservationV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
}>;

export type DecisionMakerRoleDispositionV1 =
  | "CURRENT_ROLE_SUPPORTED"
  | "CURRENT_ROLE_NEEDS_RESEARCH"
  | "VERIFY_REQUIRED"
  | "NO_CURRENT_ROLE_SUPPORTED"
  | "CONFLICTED";

export type DecisionMakerRoleProjectionV1 = Readonly<{
  canonicalPersonRef: string;
  disposition: DecisionMakerRoleDispositionV1;
  currentObservationId: string | null;
  canonicalOrganizationRef: string | null;
  title: string | null;
  decisionFunction: string | null;
  authorityClass: RoleAuthorityClassV1 | null;
  observedAt: string | null;
  supersededObservationIds: readonly string[];
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  authorityUsableForGraph: boolean;
  authorityRevalidationRequired: boolean;
  relationshipEdgeInvalidated: false;
}>;

export type DecisionMakerRoleFreshnessResultV1 = Readonly<{
  version: typeof DECISION_MAKER_ROLE_FRESHNESS_VERSION;
  generatedAt: string;
  roles: readonly DecisionMakerRoleProjectionV1[];
  counts: Readonly<{
    peopleReviewed: number;
    currentSupported: number;
    needsResearch: number;
    verifyRequired: number;
    noCurrentRole: number;
    conflicted: number;
  }>;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  relationshipMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const MAX_OBSERVATIONS = 1_000;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 120;
const TRUTH_STATES = new Set<RoleFreshnessTruthStateV1>(["KNOWN", "INFERRED", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"]);
const EMPLOYMENT_STATES = new Set<RoleEmploymentStateV1>(["CURRENT", "DEPARTED", "UNKNOWN"]);
const AUTHORITY_CLASSES = new Set<RoleAuthorityClassV1>(["DECISION_MAKER", "BUDGET_OWNER", "INFLUENCER", "GATEKEEPER", "SALES_OWNER", "UNKNOWN"]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[], label: string, required = false): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b));
  if (required && normalized.length === 0) throw new Error(`${label} must be a non-empty array`);
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

function normalizeTextField(field: RoleEvidenceFieldV1<string>, label: string): RoleEvidenceFieldV1<string> {
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  return freezeDeep({
    state: field.state,
    value: field.value == null ? null : requiredText(field.value, `${label}.value`),
    evidenceRefs: [...refs(field.evidenceRefs, `${label}.evidenceRefs`)]
  });
}

function normalizeEmploymentField(field: RoleEvidenceFieldV1<RoleEmploymentStateV1>, label: string): RoleEvidenceFieldV1<RoleEmploymentStateV1> {
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  if (field.value != null && !EMPLOYMENT_STATES.has(field.value)) throw new Error(`${label}.value is unsupported`);
  return freezeDeep({ state: field.state, value: field.value, evidenceRefs: [...refs(field.evidenceRefs, `${label}.evidenceRefs`)] });
}

function normalizeAuthorityField(field: RoleEvidenceFieldV1<RoleAuthorityClassV1>, label: string): RoleEvidenceFieldV1<RoleAuthorityClassV1> {
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  if (field.value != null && !AUTHORITY_CLASSES.has(field.value)) throw new Error(`${label}.value is unsupported`);
  return freezeDeep({ state: field.state, value: field.value, evidenceRefs: [...refs(field.evidenceRefs, `${label}.evidenceRefs`)] });
}

type NormalizedObservation = Readonly<{
  observationId: string;
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
  observedAt: string;
  observedAtMs: number;
  sourceRef: string;
  evidenceRefs: readonly string[];
  truthState: RoleFreshnessTruthStateV1;
  employmentState: RoleEvidenceFieldV1<RoleEmploymentStateV1>;
  title: RoleEvidenceFieldV1<string>;
  decisionFunction: RoleEvidenceFieldV1<string>;
  authorityClass: RoleEvidenceFieldV1<RoleAuthorityClassV1>;
}>;

function normalizeObservation(observation: DecisionMakerRoleObservationV1, index: number, nowMs: number): NormalizedObservation {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) throw new Error(`observations[${index}] must be an object`);
  if (!TRUTH_STATES.has(observation.truthState)) throw new Error(`observations[${index}].truthState is unsupported`);
  const observedAt = timestamp(observation.observedAt, `observations[${index}].observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`observations[${index}].observedAt must not be future-dated`);
  return freezeDeep({
    observationId: requiredText(observation.observationId, `observations[${index}].observationId`),
    canonicalPersonRef: requiredText(observation.canonicalPersonRef, `observations[${index}].canonicalPersonRef`),
    canonicalOrganizationRef: requiredText(observation.canonicalOrganizationRef, `observations[${index}].canonicalOrganizationRef`),
    observedAt,
    observedAtMs,
    sourceRef: requiredText(observation.sourceRef, `observations[${index}].sourceRef`),
    evidenceRefs: [...refs(observation.evidenceRefs, `observations[${index}].evidenceRefs`, true)],
    truthState: observation.truthState,
    employmentState: normalizeEmploymentField(observation.employmentState, `observations[${index}].employmentState`),
    title: normalizeTextField(observation.title, `observations[${index}].title`),
    decisionFunction: normalizeTextField(observation.decisionFunction, `observations[${index}].decisionFunction`),
    authorityClass: normalizeAuthorityField(observation.authorityClass, `observations[${index}].authorityClass`)
  });
}

function allEvidence(observation: NormalizedObservation): readonly string[] {
  return Object.freeze([...new Set([
    ...observation.evidenceRefs,
    ...observation.employmentState.evidenceRefs,
    ...observation.title.evidenceRefs,
    ...observation.decisionFunction.evidenceRefs,
    ...observation.authorityClass.evidenceRefs
  ])].sort((a, b) => a.localeCompare(b)));
}

function fieldHasBadTruth(field: RoleEvidenceFieldV1<unknown>): boolean {
  return field.state === "CONFLICTED" || field.state === "STALE" || field.state === "UNKNOWN" || field.state === "INFERRED" || field.state === "PARTIAL";
}

function latestConflict(latest: readonly NormalizedObservation[]): boolean {
  if (latest.length < 2) return false;
  const known = latest.filter((item) => item.truthState === "KNOWN");
  if (known.length < 2) return false;
  const signatures = new Set(known.map((item) => [
    item.canonicalOrganizationRef,
    item.employmentState.value ?? "",
    item.title.value ?? "",
    item.decisionFunction.value ?? "",
    item.authorityClass.value ?? ""
  ].join("|")));
  return signatures.size > 1;
}

function reconcilePerson(observations: readonly NormalizedObservation[], nowMs: number, maxAgeDays: number): DecisionMakerRoleProjectionV1 {
  const ordered = [...observations].sort((a, b) => b.observedAtMs - a.observedAtMs || a.observationId.localeCompare(b.observationId));
  const newestAt = ordered[0].observedAtMs;
  const latest = ordered.filter((item) => item.observedAtMs === newestAt);
  const personRef = ordered[0].canonicalPersonRef;
  const evidenceRefs = Object.freeze([...new Set(ordered.flatMap((item) => allEvidence(item)))].sort((a, b) => a.localeCompare(b)));

  if (latestConflict(latest)) {
    return freezeDeep({
      canonicalPersonRef: personRef,
      disposition: "CONFLICTED" as const,
      currentObservationId: null,
      canonicalOrganizationRef: null,
      title: null,
      decisionFunction: null,
      authorityClass: null,
      observedAt: new Date(newestAt).toISOString(),
      supersededObservationIds: [],
      reasonCodes: ["CONFLICTING_LATEST_KNOWN_ROLE_EVIDENCE"],
      evidenceRefs,
      authorityUsableForGraph: false,
      authorityRevalidationRequired: true,
      relationshipEdgeInvalidated: false as const
    });
  }

  const latestObservation = latest[0];
  const ageDays = Math.floor((nowMs - latestObservation.observedAtMs) / DAY_MS);
  const fields = [latestObservation.employmentState, latestObservation.title, latestObservation.decisionFunction, latestObservation.authorityClass] as const;
  const explicitlyNonCurrent = latestObservation.truthState === "KNOWN"
    && latestObservation.employmentState.state === "KNOWN"
    && latestObservation.employmentState.value === "DEPARTED";

  if (explicitlyNonCurrent) {
    return freezeDeep({
      canonicalPersonRef: personRef,
      disposition: "NO_CURRENT_ROLE_SUPPORTED" as const,
      currentObservationId: null,
      canonicalOrganizationRef: latestObservation.canonicalOrganizationRef,
      title: latestObservation.title.value,
      decisionFunction: latestObservation.decisionFunction.value,
      authorityClass: latestObservation.authorityClass.value,
      observedAt: latestObservation.observedAt,
      supersededObservationIds: ordered.slice(1).map((item) => item.observationId),
      reasonCodes: ["LATEST_KNOWN_EVIDENCE_SAYS_ROLE_DEPARTED"],
      evidenceRefs,
      authorityUsableForGraph: false,
      authorityRevalidationRequired: true,
      relationshipEdgeInvalidated: false as const
    });
  }

  const requiresVerification = latestObservation.truthState !== "KNOWN"
    || ageDays > maxAgeDays
    || fields.some(fieldHasBadTruth)
    || latestObservation.employmentState.value !== "CURRENT";

  if (requiresVerification) {
    const reasons: string[] = [];
    if (latestObservation.truthState !== "KNOWN") reasons.push(`ROLE_TRUTH_${latestObservation.truthState}_REQUIRES_VERIFICATION`);
    if (ageDays > maxAgeDays) reasons.push("LATEST_ROLE_EVIDENCE_STALE_BY_AGE");
    if (fields.some((field) => field.state === "CONFLICTED")) reasons.push("ROLE_FIELD_CONFLICTED");
    if (fields.some((field) => field.state === "STALE")) reasons.push("ROLE_FIELD_STALE");
    if (fields.some((field) => field.state === "INFERRED" || field.state === "PARTIAL")) reasons.push("ROLE_FIELD_INFERRED_OR_PARTIAL");
    if (fields.some((field) => field.state === "UNKNOWN" || field.value == null)) reasons.push("ROLE_FIELD_UNKNOWN");
    if (latestObservation.employmentState.value !== "CURRENT") reasons.push("CURRENT_EMPLOYMENT_NOT_CONFIRMED");
    return freezeDeep({
      canonicalPersonRef: personRef,
      disposition: "VERIFY_REQUIRED" as const,
      currentObservationId: latestObservation.observationId,
      canonicalOrganizationRef: latestObservation.canonicalOrganizationRef,
      title: latestObservation.title.value,
      decisionFunction: latestObservation.decisionFunction.value,
      authorityClass: latestObservation.authorityClass.value,
      observedAt: latestObservation.observedAt,
      supersededObservationIds: [],
      reasonCodes: [...new Set(reasons)],
      evidenceRefs,
      authorityUsableForGraph: false,
      authorityRevalidationRequired: true,
      relationshipEdgeInvalidated: false as const
    });
  }

  const roleKnown = latestObservation.title.state === "KNOWN" && latestObservation.title.value != null;
  const functionKnown = latestObservation.decisionFunction.state === "KNOWN" && latestObservation.decisionFunction.value != null;
  const authorityKnown = latestObservation.authorityClass.state === "KNOWN"
    && latestObservation.authorityClass.value != null
    && latestObservation.authorityClass.value !== "UNKNOWN";
  const usable = roleKnown && functionKnown && authorityKnown;
  const supersededObservationIds = ordered.slice(latest.length).map((item) => item.observationId);
  const changedCanonicalRole = ordered.slice(latest.length).some((item) =>
    item.canonicalOrganizationRef !== latestObservation.canonicalOrganizationRef
    || item.title.value !== latestObservation.title.value
    || item.decisionFunction.value !== latestObservation.decisionFunction.value
    || item.authorityClass.value !== latestObservation.authorityClass.value
  );

  return freezeDeep({
    canonicalPersonRef: personRef,
    disposition: usable ? "CURRENT_ROLE_SUPPORTED" as const : "CURRENT_ROLE_NEEDS_RESEARCH" as const,
    currentObservationId: latestObservation.observationId,
    canonicalOrganizationRef: latestObservation.canonicalOrganizationRef,
    title: latestObservation.title.value,
    decisionFunction: latestObservation.decisionFunction.value,
    authorityClass: latestObservation.authorityClass.value,
    observedAt: latestObservation.observedAt,
    supersededObservationIds,
    reasonCodes: usable
      ? (changedCanonicalRole ? ["NEWER_KNOWN_ROLE_SUPERSEDES_PRIOR_ROLE_AUTHORITY"] : ["CURRENT_ROLE_AND_AUTHORITY_EVIDENCED"])
      : ["CURRENT_ROLE_EVIDENCED_BUT_DECISION_FUNCTION_OR_AUTHORITY_MISSING"],
    evidenceRefs,
    authorityUsableForGraph: usable,
    authorityRevalidationRequired: changedCanonicalRole,
    relationshipEdgeInvalidated: false as const
  });
}

export function reconcileDecisionMakerRoleFreshnessV1(input: DecisionMakerRoleFreshnessInputV1): DecisionMakerRoleFreshnessResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > MAX_OBSERVATIONS) throw new Error(`observations exceeds ${MAX_OBSERVATIONS}`);
  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const maximumEvidenceAgeDays = boundedInteger(input.maximumEvidenceAgeDays, DEFAULT_MAX_EVIDENCE_AGE_DAYS, 1, 3650, "maximumEvidenceAgeDays");
  const normalized = input.observations.map((observation, index) => normalizeObservation(observation, index, nowMs));
  const ids = new Set<string>();
  for (const observation of normalized) {
    if (ids.has(observation.observationId)) throw new Error(`duplicate observationId ${observation.observationId}`);
    ids.add(observation.observationId);
  }

  const byPerson = new Map<string, NormalizedObservation[]>();
  for (const observation of normalized) {
    byPerson.set(observation.canonicalPersonRef, [...(byPerson.get(observation.canonicalPersonRef) ?? []), observation]);
  }
  const roles = [...byPerson.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, observations]) => reconcilePerson(observations, nowMs, maximumEvidenceAgeDays));
  const count = (disposition: DecisionMakerRoleDispositionV1) => roles.filter((role) => role.disposition === disposition).length;

  return freezeDeep({
    version: DECISION_MAKER_ROLE_FRESHNESS_VERSION,
    generatedAt,
    roles,
    counts: {
      peopleReviewed: roles.length,
      currentSupported: count("CURRENT_ROLE_SUPPORTED"),
      needsResearch: count("CURRENT_ROLE_NEEDS_RESEARCH"),
      verifyRequired: count("VERIFY_REQUIRED"),
      noCurrentRole: count("NO_CURRENT_ROLE_SUPPORTED"),
      conflicted: count("CONFLICTED")
    },
    externalResearchPerformed: false as const,
    crmMutationPerformed: false as const,
    relationshipMutationPerformed: false as const,
    externalActionPerformed: false as const
  });
}
