import type {
  CanonicalSocialAccountSnapshotV1,
  SocialHistoryWindowV1,
  SocialMetricDirectionV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";

export const SOCIAL_MATERIAL_CHANGE_SIGNAL_V1_VERSION = "SocialMaterialChangeSignalV1" as const;
export const SOCIAL_MATERIAL_CHANGE_MAX_RULES_V1 = 50;

export type SocialMaterialChangeThresholdV1 = Readonly<
  | { kind: "ABSOLUTE"; atLeast: number }
  | { kind: "PERCENTAGE"; atLeast: number }
>;

export type SocialMaterialChangeRuleV1 = Readonly<{
  ruleId: string;
  window: SocialHistoryWindowV1;
  metric: SocialMetricKeyV1;
  direction: "UP" | "DOWN" | "EITHER";
  threshold: SocialMaterialChangeThresholdV1;
}>;

export type SocialMaterialChangeVerificationReasonV1 =
  | "SOURCE_NOT_FULLY_CONNECTED"
  | "SOURCE_NOT_FRESH"
  | "SNAPSHOT_TOO_OLD"
  | "SNAPSHOT_FROM_FUTURE"
  | "SYNC_TIMESTAMP_MISSING"
  | "SYNC_TIMESTAMP_FROM_FUTURE"
  | "METRIC_NOT_IN_SOURCE_COVERAGE"
  | "COMPARISON_MISSING"
  | "PRIOR_PERIOD_MISSING"
  | "PERIOD_EVIDENCE_MISSING"
  | "PERIOD_WINDOWS_NOT_COMPARABLE"
  | "METRIC_VALUE_UNKNOWN"
  | "PERCENTAGE_CHANGE_UNAVAILABLE";

export type SocialMaterialChangeRuleEvaluationV1 = Readonly<{
  ruleId: string;
  metric: SocialMetricKeyV1;
  window: SocialHistoryWindowV1;
  state: "MATERIAL_CANDIDATE" | "NOT_MATERIAL" | "VERIFY_REQUIRED";
  reasons: readonly SocialMaterialChangeVerificationReasonV1[];
  currentPeriodId: string | null;
  priorPeriodId: string | null;
}>;

export type SocialMaterialChangeCandidateV1 = Readonly<{
  signalId: string;
  ruleId: string;
  platform: SocialPlatformV1;
  accountId: string;
  metric: SocialMetricKeyV1;
  window: SocialHistoryWindowV1;
  currentPeriodId: string;
  priorPeriodId: string;
  currentValue: number;
  priorValue: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  direction: Exclude<SocialMetricDirectionV1, "UNKNOWN" | "FLAT">;
  threshold: SocialMaterialChangeThresholdV1;
  evidenceRefs: readonly string[];
  materialityPolicySource: "CALLER_SUPPLIED_RULE";
  requiresCorroboration: true;
  eligibleForNotification: false;
  causalClaim: false;
  attributionClaim: false;
}>;

export type SocialMaterialChangeSignalV1 = Readonly<{
  contractVersion: typeof SOCIAL_MATERIAL_CHANGE_SIGNAL_V1_VERSION;
  platform: SocialPlatformV1;
  accountId: string;
  snapshotId: string;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED" | "NO_MATERIAL_CHANGE";
  evaluations: readonly SocialMaterialChangeRuleEvaluationV1[];
  candidates: readonly SocialMaterialChangeCandidateV1[];
  verificationReasons: readonly SocialMaterialChangeVerificationReasonV1[];
  guardrails: readonly string[];
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type SocialMaterialChangeSignalInputV1 = Readonly<{
  snapshot: CanonicalSocialAccountSnapshotV1;
  rules: readonly SocialMaterialChangeRuleV1[];
  evaluatedAt: string;
  maxSnapshotAgeHours: number;
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

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueRefs(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizedRule(rule: SocialMaterialChangeRuleV1, index: number): SocialMaterialChangeRuleV1 {
  const ruleId = requireNonEmpty(rule.ruleId, `rules[${index}].ruleId`);
  if (rule.direction !== "UP" && rule.direction !== "DOWN" && rule.direction !== "EITHER") {
    throw new Error(`${ruleId}.direction must be UP, DOWN, or EITHER`);
  }
  if (rule.threshold.kind !== "ABSOLUTE" && rule.threshold.kind !== "PERCENTAGE") {
    throw new Error(`${ruleId}.threshold.kind is unsupported`);
  }
  if (!Number.isFinite(rule.threshold.atLeast) || rule.threshold.atLeast <= 0) {
    throw new Error(`${ruleId}.threshold.atLeast must be a finite positive number`);
  }
  return freeze({
    ruleId,
    window: rule.window,
    metric: rule.metric,
    direction: rule.direction,
    threshold: freeze({ ...rule.threshold })
  });
}

function periodDurationMs(startAt: string, endAt: string): number {
  return Date.parse(endAt) - Date.parse(startAt);
}

function directionMatches(rule: SocialMaterialChangeRuleV1, direction: SocialMetricDirectionV1): boolean {
  if (direction !== "UP" && direction !== "DOWN") return false;
  return rule.direction === "EITHER" || rule.direction === direction;
}

function thresholdMet(
  rule: SocialMaterialChangeRuleV1,
  absoluteDelta: number,
  percentageDelta: number | null
): boolean | null {
  if (rule.threshold.kind === "ABSOLUTE") {
    return Math.abs(absoluteDelta) >= rule.threshold.atLeast;
  }
  if (percentageDelta == null) return null;
  return Math.abs(percentageDelta) >= rule.threshold.atLeast;
}

function signalId(
  platform: SocialPlatformV1,
  accountId: string,
  ruleId: string,
  currentPeriodId: string,
  priorPeriodId: string
): string {
  return ["social-material-change", platform, accountId, ruleId, currentPeriodId, priorPeriodId]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function evaluateRule(
  snapshot: CanonicalSocialAccountSnapshotV1,
  rule: SocialMaterialChangeRuleV1,
  snapshotLevelReasons: readonly SocialMaterialChangeVerificationReasonV1[]
): { evaluation: SocialMaterialChangeRuleEvaluationV1; candidate: SocialMaterialChangeCandidateV1 | null } {
  const comparison = snapshot.comparisons.find((row) => row.window === rule.window);
  const reasons: SocialMaterialChangeVerificationReasonV1[] = [...snapshotLevelReasons];

  if (!snapshot.sourceCoverage.metricCoverage.includes(rule.metric)) {
    reasons.push("METRIC_NOT_IN_SOURCE_COVERAGE");
  }
  if (!comparison) {
    reasons.push("COMPARISON_MISSING");
    return {
      evaluation: freeze({
        ruleId: rule.ruleId,
        metric: rule.metric,
        window: rule.window,
        state: "VERIFY_REQUIRED" as const,
        reasons: unique(reasons),
        currentPeriodId: null,
        priorPeriodId: null
      }),
      candidate: null
    };
  }

  const currentPeriod = snapshot.periods.find((period) => period.periodId === comparison.currentPeriodId);
  const priorPeriod = comparison.priorPeriodId
    ? snapshot.periods.find((period) => period.periodId === comparison.priorPeriodId)
    : undefined;
  if (!currentPeriod) reasons.push("COMPARISON_MISSING");
  if (!priorPeriod) reasons.push("PRIOR_PERIOD_MISSING");

  const metricComparison = comparison.metrics[rule.metric];
  if (
    metricComparison.currentValue == null ||
    metricComparison.priorValue == null ||
    metricComparison.absoluteDelta == null ||
    metricComparison.direction === "UNKNOWN"
  ) {
    reasons.push("METRIC_VALUE_UNKNOWN");
  }

  if (currentPeriod && priorPeriod) {
    const currentEvidence = currentPeriod.metrics[rule.metric].evidenceRefs;
    const priorEvidence = priorPeriod.metrics[rule.metric].evidenceRefs;
    if (!currentEvidence.length || !priorEvidence.length) reasons.push("PERIOD_EVIDENCE_MISSING");

    const sameWindow = currentPeriod.window === rule.window && priorPeriod.window === rule.window;
    const sameDuration = periodDurationMs(currentPeriod.startAt, currentPeriod.endAt) === periodDurationMs(priorPeriod.startAt, priorPeriod.endAt);
    const nonOverlapping = Date.parse(priorPeriod.endAt) <= Date.parse(currentPeriod.startAt);
    if (!sameWindow || !sameDuration || !nonOverlapping) reasons.push("PERIOD_WINDOWS_NOT_COMPARABLE");
  }

  if (rule.threshold.kind === "PERCENTAGE" && metricComparison.percentageDelta == null) {
    reasons.push("PERCENTAGE_CHANGE_UNAVAILABLE");
  }

  const currentPeriodId = currentPeriod?.periodId ?? comparison.currentPeriodId ?? null;
  const priorPeriodId = priorPeriod?.periodId ?? comparison.priorPeriodId ?? null;
  if (reasons.length) {
    return {
      evaluation: freeze({
        ruleId: rule.ruleId,
        metric: rule.metric,
        window: rule.window,
        state: "VERIFY_REQUIRED" as const,
        reasons: unique(reasons),
        currentPeriodId,
        priorPeriodId
      }),
      candidate: null
    };
  }

  const absoluteDelta = metricComparison.absoluteDelta!;
  const percentageDelta = metricComparison.percentageDelta;
  const direction = metricComparison.direction;
  const meetsThreshold = thresholdMet(rule, absoluteDelta, percentageDelta);
  const material = directionMatches(rule, direction) && meetsThreshold === true;

  if (!material) {
    return {
      evaluation: freeze({
        ruleId: rule.ruleId,
        metric: rule.metric,
        window: rule.window,
        state: "NOT_MATERIAL" as const,
        reasons: freeze([]),
        currentPeriodId: currentPeriod!.periodId,
        priorPeriodId: priorPeriod!.periodId
      }),
      candidate: null
    };
  }

  const evidenceRefs = uniqueRefs([
    ...currentPeriod!.metrics[rule.metric].evidenceRefs,
    ...priorPeriod!.metrics[rule.metric].evidenceRefs,
    ...metricComparison.evidenceRefs
  ]);
  const candidate = freeze({
    signalId: signalId(snapshot.platform, snapshot.accountId, rule.ruleId, currentPeriod!.periodId, priorPeriod!.periodId),
    ruleId: rule.ruleId,
    platform: snapshot.platform,
    accountId: snapshot.accountId,
    metric: rule.metric,
    window: rule.window,
    currentPeriodId: currentPeriod!.periodId,
    priorPeriodId: priorPeriod!.periodId,
    currentValue: metricComparison.currentValue!,
    priorValue: metricComparison.priorValue!,
    absoluteDelta,
    percentageDelta,
    direction: direction as "UP" | "DOWN",
    threshold: rule.threshold,
    evidenceRefs,
    materialityPolicySource: "CALLER_SUPPLIED_RULE" as const,
    requiresCorroboration: true as const,
    eligibleForNotification: false as const,
    causalClaim: false as const,
    attributionClaim: false as const
  });

  return {
    evaluation: freeze({
      ruleId: rule.ruleId,
      metric: rule.metric,
      window: rule.window,
      state: "MATERIAL_CANDIDATE" as const,
      reasons: freeze([]),
      currentPeriodId: currentPeriod!.periodId,
      priorPeriodId: priorPeriod!.periodId
    }),
    candidate
  };
}

export function compileSocialMaterialChangeSignalV1(
  input: SocialMaterialChangeSignalInputV1
): SocialMaterialChangeSignalV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.rules) || input.rules.length === 0) throw new Error("at least one material-change rule is required");
  if (input.rules.length > SOCIAL_MATERIAL_CHANGE_MAX_RULES_V1) {
    throw new Error(`at most ${SOCIAL_MATERIAL_CHANGE_MAX_RULES_V1} material-change rules are allowed`);
  }
  if (!Number.isFinite(input.maxSnapshotAgeHours) || input.maxSnapshotAgeHours <= 0) {
    throw new Error("maxSnapshotAgeHours must be a finite positive number");
  }

  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const snapshot = input.snapshot;
  const rules = input.rules.map(normalizedRule);
  const ruleIds = new Set<string>();
  for (const rule of rules) {
    if (ruleIds.has(rule.ruleId)) throw new Error(`duplicate material-change ruleId: ${rule.ruleId}`);
    ruleIds.add(rule.ruleId);
  }

  const snapshotLevelReasons: SocialMaterialChangeVerificationReasonV1[] = [];
  if (snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING") {
    snapshotLevelReasons.push("SOURCE_NOT_FULLY_CONNECTED");
  }
  if (snapshot.sourceCoverage.freshness !== "FRESH") snapshotLevelReasons.push("SOURCE_NOT_FRESH");

  const retrievedAtMs = Date.parse(requireIso(snapshot.retrievedAt, "snapshot.retrievedAt"));
  if (retrievedAtMs > evaluatedAtMs) snapshotLevelReasons.push("SNAPSHOT_FROM_FUTURE");
  if (evaluatedAtMs - retrievedAtMs > input.maxSnapshotAgeHours * 3_600_000) snapshotLevelReasons.push("SNAPSHOT_TOO_OLD");

  const lastSyncAt = snapshot.sourceCoverage.lastSuccessfulSyncAt;
  if (!lastSyncAt) snapshotLevelReasons.push("SYNC_TIMESTAMP_MISSING");
  else if (Date.parse(requireIso(lastSyncAt, "snapshot.sourceCoverage.lastSuccessfulSyncAt")) > evaluatedAtMs) {
    snapshotLevelReasons.push("SYNC_TIMESTAMP_FROM_FUTURE");
  }

  const results = rules.map((rule) => evaluateRule(snapshot, rule, unique(snapshotLevelReasons)));
  const evaluations = freeze(results.map((result) => result.evaluation));
  const candidates = freeze(results.flatMap((result) => result.candidate ? [result.candidate] : []));
  const verificationReasons = unique(
    evaluations.flatMap((evaluation) => evaluation.reasons)
  );

  const status: SocialMaterialChangeSignalV1["status"] = verificationReasons.length
    ? "VERIFY_REQUIRED"
    : candidates.length
      ? "READY"
      : "NO_MATERIAL_CHANGE";

  return freeze({
    contractVersion: SOCIAL_MATERIAL_CHANGE_SIGNAL_V1_VERSION,
    platform: snapshot.platform,
    accountId: snapshot.accountId,
    snapshotId: snapshot.snapshotId,
    evaluatedAt,
    status,
    evaluations,
    candidates,
    verificationReasons,
    guardrails: [
      "A metric movement can only become a corroboration-required signal candidate; this contract never sends or authorizes an alert.",
      "Materiality thresholds come only from caller-supplied policy and are not inferred from the observed data.",
      "Candidates preserve within-platform metric semantics and do not establish causality, attribution, endorsements, relationships, or business impact.",
      "Partial, stale, unsupported, unevidenced, or non-comparable evidence fails closed to VERIFY_REQUIRED."
    ],
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
