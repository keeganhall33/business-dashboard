import type {
  SocialMaterialChangeCandidateV1,
  SocialMaterialChangeSignalV1
} from "./social-material-change-signal-v1";

export const SOCIAL_MATERIAL_ALERT_READINESS_V1_VERSION = "SocialMaterialAlertReadinessV1" as const;
export const SOCIAL_MATERIAL_ALERT_MAX_CORROBORATIONS_V1 = 100;
export const SOCIAL_MATERIAL_ALERT_MAX_PRIOR_ALERTS_V1 = 100;

export type SocialMaterialAlertTruthStateV1 =
  | "KNOWN"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "INFERRED";

export type SocialMaterialAlertCorroborationKindV1 =
  | "SECONDARY_SOCIAL_METRIC"
  | "CONTENT_PERFORMANCE"
  | "BUSINESS_OUTCOME"
  | "SOURCE_HEALTH"
  | "EXTERNAL_CONTEXT";

export type SocialMaterialAlertCorroborationRelationV1 =
  | "SUPPORTS_MATERIALITY"
  | "CONTRADICTS_MATERIALITY"
  | "CONTEXT_ONLY";

export type SocialMaterialAlertCorroborationV1 = Readonly<{
  corroborationId: string;
  signalId: string;
  sourceRef: string;
  kind: SocialMaterialAlertCorroborationKindV1;
  relation: SocialMaterialAlertCorroborationRelationV1;
  truthState: SocialMaterialAlertTruthStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type SocialMaterialAlertPriorEmissionV1 = Readonly<{
  emissionId: string;
  signalId: string;
  stateKey: string;
  emittedAt: string;
  evidenceRefs: readonly string[];
}>;

export type SocialMaterialAlertPolicyV1 = Readonly<{
  minIndependentSupportingSources: number;
  maxCorroborationAgeHours: number;
  cooldownHours: number;
}>;

export type SocialMaterialAlertReadinessStateV1 =
  | "READY_FOR_ALERT_REVIEW"
  | "INVESTIGATE"
  | "VERIFY_REQUIRED"
  | "SUPPRESSED_DUPLICATE"
  | "SUPPRESSED_COOLDOWN";

export type SocialMaterialAlertReadinessReasonV1 =
  | "UPSTREAM_SIGNAL_NOT_READY"
  | "CORROBORATION_SIGNAL_MISMATCH"
  | "CORROBORATION_EVIDENCE_MISSING"
  | "CORROBORATION_NOT_KNOWN"
  | "CORROBORATION_FROM_FUTURE"
  | "CORROBORATION_TOO_OLD"
  | "INSUFFICIENT_INDEPENDENT_SUPPORT"
  | "CONTRADICTING_EVIDENCE_PRESENT"
  | "DUPLICATE_PRIOR_EMISSION"
  | "COOLDOWN_ACTIVE";

export type SocialMaterialAlertReadinessItemV1 = Readonly<{
  signalId: string;
  stateKey: string;
  platform: SocialMaterialChangeCandidateV1["platform"];
  accountId: string;
  metric: SocialMaterialChangeCandidateV1["metric"];
  window: SocialMaterialChangeCandidateV1["window"];
  direction: SocialMaterialChangeCandidateV1["direction"];
  state: SocialMaterialAlertReadinessStateV1;
  reasons: readonly SocialMaterialAlertReadinessReasonV1[];
  supportingCorroborationIds: readonly string[];
  contradictingCorroborationIds: readonly string[];
  contextOnlyCorroborationIds: readonly string[];
  independentSupportingSourceCount: number;
  evidenceRefs: readonly string[];
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  relationshipClaim: false;
  endorsementClaim: false;
  eligibleForNotification: false;
}>;

export type SocialMaterialAlertReadinessV1 = Readonly<{
  contractVersion: typeof SOCIAL_MATERIAL_ALERT_READINESS_V1_VERSION;
  evaluatedAt: string;
  status: "READY_FOR_REVIEW" | "INVESTIGATE" | "VERIFY_REQUIRED" | "NO_ALERT_READY";
  items: readonly SocialMaterialAlertReadinessItemV1[];
  guardrails: readonly string[];
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialMaterialAlertReadinessInputV1 = Readonly<{
  signal: SocialMaterialChangeSignalV1;
  corroborations: readonly SocialMaterialAlertCorroborationV1[];
  priorEmissions: readonly SocialMaterialAlertPriorEmissionV1[];
  policy: SocialMaterialAlertPolicyV1;
  evaluatedAt: string;
}>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function assertUniqueIds<T>(rows: readonly T[], id: (row: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = id(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function stateKey(candidate: SocialMaterialChangeCandidateV1): string {
  return [
    "social-material-alert",
    candidate.platform,
    candidate.accountId,
    candidate.metric,
    candidate.window,
    candidate.direction
  ].map((value) => encodeURIComponent(value)).join(":");
}

function normalizedCorroboration(
  row: SocialMaterialAlertCorroborationV1,
  index: number
): SocialMaterialAlertCorroborationV1 {
  const corroborationId = requireNonEmpty(row.corroborationId, `corroborations[${index}].corroborationId`);
  const signalId = requireNonEmpty(row.signalId, `${corroborationId}.signalId`);
  const sourceRef = requireNonEmpty(row.sourceRef, `${corroborationId}.sourceRef`);
  const observedAt = requireIso(row.observedAt, `${corroborationId}.observedAt`);
  const evidenceRefs = unique(row.evidenceRefs);
  return freeze({ ...row, corroborationId, signalId, sourceRef, observedAt, evidenceRefs });
}

function normalizedPriorEmission(
  row: SocialMaterialAlertPriorEmissionV1,
  index: number
): SocialMaterialAlertPriorEmissionV1 {
  const emissionId = requireNonEmpty(row.emissionId, `priorEmissions[${index}].emissionId`);
  const signalId = requireNonEmpty(row.signalId, `${emissionId}.signalId`);
  const normalizedStateKey = requireNonEmpty(row.stateKey, `${emissionId}.stateKey`);
  const emittedAt = requireIso(row.emittedAt, `${emissionId}.emittedAt`);
  const evidenceRefs = unique(row.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${emissionId}.evidenceRefs must contain at least one evidence reference`);
  return freeze({ ...row, emissionId, signalId, stateKey: normalizedStateKey, emittedAt, evidenceRefs });
}

function evaluateCandidate(
  candidate: SocialMaterialChangeCandidateV1,
  signalStatus: SocialMaterialChangeSignalV1["status"],
  corroborations: readonly SocialMaterialAlertCorroborationV1[],
  priorEmissions: readonly SocialMaterialAlertPriorEmissionV1[],
  policy: SocialMaterialAlertPolicyV1,
  evaluatedAtMs: number
): SocialMaterialAlertReadinessItemV1 {
  const reasons: SocialMaterialAlertReadinessReasonV1[] = [];
  const candidateStateKey = stateKey(candidate);

  if (signalStatus !== "READY") reasons.push("UPSTREAM_SIGNAL_NOT_READY");

  const bound = corroborations.filter((row) => row.signalId === candidate.signalId);
  const mismatched = corroborations.filter((row) => row.signalId !== candidate.signalId);
  if (mismatched.length && corroborations.length === 1) reasons.push("CORROBORATION_SIGNAL_MISMATCH");

  const supporting: SocialMaterialAlertCorroborationV1[] = [];
  const contradicting: SocialMaterialAlertCorroborationV1[] = [];
  const contextOnly: SocialMaterialAlertCorroborationV1[] = [];

  for (const row of bound) {
    if (!row.evidenceRefs.length) {
      reasons.push("CORROBORATION_EVIDENCE_MISSING");
      continue;
    }
    if (row.truthState !== "KNOWN") {
      reasons.push("CORROBORATION_NOT_KNOWN");
      continue;
    }
    const observedAtMs = Date.parse(row.observedAt);
    if (observedAtMs > evaluatedAtMs) {
      reasons.push("CORROBORATION_FROM_FUTURE");
      continue;
    }
    if (evaluatedAtMs - observedAtMs > policy.maxCorroborationAgeHours * 3_600_000) {
      reasons.push("CORROBORATION_TOO_OLD");
      continue;
    }

    if (row.relation === "SUPPORTS_MATERIALITY") supporting.push(row);
    else if (row.relation === "CONTRADICTS_MATERIALITY") contradicting.push(row);
    else contextOnly.push(row);
  }

  const supportingSources = new Set(supporting.map((row) => row.sourceRef));
  if (supportingSources.size < policy.minIndependentSupportingSources) {
    reasons.push("INSUFFICIENT_INDEPENDENT_SUPPORT");
  }
  if (contradicting.length) reasons.push("CONTRADICTING_EVIDENCE_PRESENT");

  const exactPrior = priorEmissions.find((row) => row.signalId === candidate.signalId);
  if (exactPrior) reasons.push("DUPLICATE_PRIOR_EMISSION");

  const cooldownPrior = priorEmissions
    .filter((row) => row.stateKey === candidateStateKey)
    .filter((row) => Date.parse(row.emittedAt) <= evaluatedAtMs)
    .sort((left, right) => Date.parse(right.emittedAt) - Date.parse(left.emittedAt))[0];
  if (
    !exactPrior &&
    cooldownPrior &&
    evaluatedAtMs - Date.parse(cooldownPrior.emittedAt) < policy.cooldownHours * 3_600_000
  ) {
    reasons.push("COOLDOWN_ACTIVE");
  }

  let state: SocialMaterialAlertReadinessStateV1;
  if (reasons.includes("DUPLICATE_PRIOR_EMISSION")) state = "SUPPRESSED_DUPLICATE";
  else if (reasons.includes("COOLDOWN_ACTIVE")) state = "SUPPRESSED_COOLDOWN";
  else if (
    reasons.includes("UPSTREAM_SIGNAL_NOT_READY") ||
    reasons.includes("CORROBORATION_EVIDENCE_MISSING") ||
    reasons.includes("CORROBORATION_NOT_KNOWN") ||
    reasons.includes("CORROBORATION_FROM_FUTURE") ||
    reasons.includes("CORROBORATION_TOO_OLD")
  ) state = "VERIFY_REQUIRED";
  else if (
    reasons.includes("INSUFFICIENT_INDEPENDENT_SUPPORT") ||
    reasons.includes("CONTRADICTING_EVIDENCE_PRESENT") ||
    reasons.includes("CORROBORATION_SIGNAL_MISMATCH")
  ) state = "INVESTIGATE";
  else state = "READY_FOR_ALERT_REVIEW";

  const evidenceRefs = unique([
    ...candidate.evidenceRefs,
    ...supporting.flatMap((row) => row.evidenceRefs),
    ...contradicting.flatMap((row) => row.evidenceRefs),
    ...contextOnly.flatMap((row) => row.evidenceRefs),
    ...(exactPrior?.evidenceRefs ?? []),
    ...(cooldownPrior?.evidenceRefs ?? [])
  ]);

  return freeze({
    signalId: candidate.signalId,
    stateKey: candidateStateKey,
    platform: candidate.platform,
    accountId: candidate.accountId,
    metric: candidate.metric,
    window: candidate.window,
    direction: candidate.direction,
    state,
    reasons: unique(reasons),
    supportingCorroborationIds: unique(supporting.map((row) => row.corroborationId)),
    contradictingCorroborationIds: unique(contradicting.map((row) => row.corroborationId)),
    contextOnlyCorroborationIds: unique(contextOnly.map((row) => row.corroborationId)),
    independentSupportingSourceCount: supportingSources.size,
    evidenceRefs,
    causalClaim: false,
    attributionClaim: false,
    competitorPerformanceClaim: false,
    relationshipClaim: false,
    endorsementClaim: false,
    eligibleForNotification: false
  });
}

export function compileSocialMaterialAlertReadinessV1(
  input: SocialMaterialAlertReadinessInputV1
): SocialMaterialAlertReadinessV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.corroborations)) throw new Error("corroborations must be an array");
  if (!Array.isArray(input.priorEmissions)) throw new Error("priorEmissions must be an array");
  if (input.corroborations.length > SOCIAL_MATERIAL_ALERT_MAX_CORROBORATIONS_V1) {
    throw new Error(`at most ${SOCIAL_MATERIAL_ALERT_MAX_CORROBORATIONS_V1} corroborations are allowed`);
  }
  if (input.priorEmissions.length > SOCIAL_MATERIAL_ALERT_MAX_PRIOR_ALERTS_V1) {
    throw new Error(`at most ${SOCIAL_MATERIAL_ALERT_MAX_PRIOR_ALERTS_V1} prior emissions are allowed`);
  }

  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = freeze({
    minIndependentSupportingSources: requirePositiveInteger(
      input.policy.minIndependentSupportingSources,
      "policy.minIndependentSupportingSources"
    ),
    maxCorroborationAgeHours: requireNonNegativeFinite(
      input.policy.maxCorroborationAgeHours,
      "policy.maxCorroborationAgeHours"
    ),
    cooldownHours: requireNonNegativeFinite(input.policy.cooldownHours, "policy.cooldownHours")
  });

  const corroborations = input.corroborations.map(normalizedCorroboration);
  const priorEmissions = input.priorEmissions.map(normalizedPriorEmission);
  assertUniqueIds(corroborations, (row) => row.corroborationId, "corroborationId");
  assertUniqueIds(priorEmissions, (row) => row.emissionId, "emissionId");

  for (const row of priorEmissions) {
    if (Date.parse(row.emittedAt) > evaluatedAtMs) throw new Error(`${row.emissionId}.emittedAt cannot be in the future`);
  }

  const items = freeze(
    input.signal.candidates
      .map((candidate) => evaluateCandidate(candidate, input.signal.status, corroborations, priorEmissions, policy, evaluatedAtMs))
      .sort((left, right) => left.signalId.localeCompare(right.signalId))
  );

  const status: SocialMaterialAlertReadinessV1["status"] = items.some((item) => item.state === "VERIFY_REQUIRED")
    ? "VERIFY_REQUIRED"
    : items.some((item) => item.state === "READY_FOR_ALERT_REVIEW")
      ? "READY_FOR_REVIEW"
      : items.some((item) => item.state === "INVESTIGATE")
        ? "INVESTIGATE"
        : "NO_ALERT_READY";

  return freeze({
    contractVersion: SOCIAL_MATERIAL_ALERT_READINESS_V1_VERSION,
    evaluatedAt,
    status,
    items,
    guardrails: [
      "A social metric movement is never alert-ready by itself; independently sourced, fresh, evidence-backed corroboration is required by caller-supplied policy.",
      "Contradicting evidence routes the signal to investigation rather than being averaged away or converted into confidence.",
      "Duplicate and cooldown behavior only suppresses repeated alert state; it never changes canonical social truth.",
      "Corroboration does not establish causality, attribution, competitor performance, endorsement, relationship, expected monetary value, or business impact.",
      "This compiler only prepares an internal review state and never sends, schedules, or authorizes a notification or external action."
    ],
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
