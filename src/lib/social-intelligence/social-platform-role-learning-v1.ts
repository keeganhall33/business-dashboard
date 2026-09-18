import type {
  CanonicalSocialAccountSnapshotV1,
  CanonicalSocialContentV1,
  CanonicalSocialPeriodV1,
  SocialMetricKeyV1,
  SocialPlatformV1,
} from "./social-canonical-v1";
import type {
  SocialBusinessOutcomeLinkageRowV1,
  SocialBusinessOutcomeLinkageV1,
} from "./social-business-outcome-linkage-v1";

export const SOCIAL_PLATFORM_ROLE_LEARNING_V1_VERSION = "SocialPlatformRoleLearningV1" as const;
export const SOCIAL_PLATFORM_ROLE_MAX_SNAPSHOTS_V1 = 20;

export const SOCIAL_PLATFORM_ROLES_V1 = [
  "DISCOVERY",
  "TRAFFIC",
  "COMMUNITY",
  "COLLECTOR_INTENT",
  "PARTNERSHIP",
  "MEDIA_PRESTIGE",
  "LONG_FORM_AUTHORITY",
] as const;

export type SocialPlatformRoleV1 = (typeof SOCIAL_PLATFORM_ROLES_V1)[number];

export type SocialPlatformRoleStateV1 =
  | "SUPPORTED_FOR_ROLE_REVIEW"
  | "OBSERVATION_ONLY"
  | "INSUFFICIENT_EVIDENCE"
  | "VERIFY_REQUIRED";

export type SocialPlatformRoleEvidenceBasisV1 =
  | "FIRST_PARTY_ACCOUNT_METRICS"
  | "FIRST_PARTY_CONTENT_METRICS"
  | "DIRECT_TRACKED_BUSINESS_OUTCOMES"
  | "SUPPORTED_BUSINESS_ASSOCIATIONS"
  | "NONE";

export type SocialPlatformRoleEvidenceV1 = Readonly<{
  role: SocialPlatformRoleV1;
  state: SocialPlatformRoleStateV1;
  basis: SocialPlatformRoleEvidenceBasisV1;
  observedContentCount: number;
  directTrackedOutcomeCount: number;
  supportedAssociationCount: number;
  evidenceRefs: readonly string[];
  statement: string;
  confidence: null;
  causalClaim: false;
  revenueAttributionClaim: false;
  bestChannelClaim: false;
}>;

export type SocialPlatformRoleProfileV1 = Readonly<{
  platform: SocialPlatformV1;
  accountId: string;
  sourceTruth: "DECISION_GRADE" | "VERIFY_REQUIRED";
  roles: readonly SocialPlatformRoleEvidenceV1[];
}>;

export type SocialPlatformRoleLearningPolicyV1 = Readonly<{
  maxSnapshotAgeHours: number;
  maxOutcomeLinkageAgeHours: number;
  minIndependentContentItems: number;
  minLinkedBusinessOutcomes: number;
}>;

export type SocialPlatformRoleLearningInputV1 = Readonly<{
  evaluatedAt: string;
  snapshots: readonly CanonicalSocialAccountSnapshotV1[];
  outcomeLinkage: SocialBusinessOutcomeLinkageV1;
  policy: SocialPlatformRoleLearningPolicyV1;
}>;

export type SocialPlatformRoleLearningV1 = Readonly<{
  contractVersion: typeof SOCIAL_PLATFORM_ROLE_LEARNING_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE" | "VERIFY_REQUIRED";
  profiles: readonly SocialPlatformRoleProfileV1[];
  limitations: readonly string[];
  authority: Readonly<{
    crossPlatformWinnerSelectionAllowed: false;
    strategyMutationAllowed: false;
    contentExecutionAllowed: false;
    paidAmplificationAllowed: false;
    publicPostingAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
  }>;
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

type PositiveMetricObservation = Readonly<{
  value: number;
  evidenceRefs: readonly string[];
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function requirePositiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function safeRef(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain a secret reference`);
  if (/(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|bearer)=/i.test(normalized)) {
    throw new Error(`${field} must not contain credential material`);
  }
  return normalized;
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  return [...new Set(values.map((value, index) => safeRef(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function contentRef(platform: SocialPlatformV1, contentId: string): string {
  return `${platform}:${contentId}`;
}

function positiveMetric(content: CanonicalSocialContentV1, key: SocialMetricKeyV1): PositiveMetricObservation | null {
  const metric = content.metrics[key];
  if (metric.truthState !== "KNOWN" || metric.value == null || metric.value <= 0 || metric.evidenceRefs.length === 0) return null;
  return {
    value: metric.value,
    evidenceRefs: metric.evidenceRefs,
  };
}

function positivePeriodMetric(period: CanonicalSocialPeriodV1, key: SocialMetricKeyV1): PositiveMetricObservation | null {
  const metric = period.metrics[key];
  if (metric.truthState !== "KNOWN" || metric.value == null || metric.value <= 0 || metric.evidenceRefs.length === 0) return null;
  return {
    value: metric.value,
    evidenceRefs: metric.evidenceRefs,
  };
}

function sourceDecisionGrade(
  snapshot: CanonicalSocialAccountSnapshotV1,
  evaluatedAtMs: number,
  maxSnapshotAgeHours: number,
): boolean {
  if (snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING") return false;
  if (snapshot.sourceCoverage.freshness !== "FRESH") return false;

  const retrievedAtMs = Date.parse(snapshot.retrievedAt);
  if (!Number.isFinite(retrievedAtMs) || retrievedAtMs > evaluatedAtMs) return false;
  if (evaluatedAtMs - retrievedAtMs > maxSnapshotAgeHours * 3_600_000) return false;

  const lastSyncAt = snapshot.sourceCoverage.lastSuccessfulSyncAt;
  if (!lastSyncAt) return false;
  const lastSyncMs = Date.parse(lastSyncAt);
  if (!Number.isFinite(lastSyncMs) || lastSyncMs > evaluatedAtMs) return false;
  if (evaluatedAtMs - lastSyncMs > maxSnapshotAgeHours * 3_600_000) return false;

  return true;
}

function outcomeLinkageDecisionGrade(
  linkage: SocialBusinessOutcomeLinkageV1,
  evaluatedAtMs: number,
  maxOutcomeLinkageAgeHours: number,
): boolean {
  const generatedAtMs = Date.parse(linkage.generatedAt);
  return Number.isFinite(generatedAtMs)
    && generatedAtMs <= evaluatedAtMs
    && evaluatedAtMs - generatedAtMs <= maxOutcomeLinkageAgeHours * 3_600_000
    && linkage.externalAccessPerformed === false
    && linkage.writesPerformed === false;
}

function latestCurrent30dPeriod(
  snapshot: CanonicalSocialAccountSnapshotV1,
  evaluatedAtMs: number,
): CanonicalSocialPeriodV1 | null {
  return [...snapshot.periods]
    .filter((period) => period.window === "30D" && Date.parse(period.endAt) <= evaluatedAtMs)
    .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt) || right.periodId.localeCompare(left.periodId))[0] ?? null;
}

function rowsForSnapshot(
  snapshot: CanonicalSocialAccountSnapshotV1,
  linkage: SocialBusinessOutcomeLinkageV1,
  evaluatedAtMs: number,
): SocialBusinessOutcomeLinkageRowV1[] {
  const contentRefs = new Set(snapshot.content.map((content) => contentRef(snapshot.platform, content.contentId)));
  return linkage.rows.filter((row) => {
    if (!row.socialContentRef || !contentRefs.has(row.socialContentRef)) return false;
    if (row.platform !== snapshot.platform || !row.contentId) return false;
    if (row.truthState !== "KNOWN") return false;
    if (row.disposition !== "DIRECT_LINK" && row.disposition !== "ASSOCIATED_LINK") return false;
    if (row.attributionClass !== "DIRECT_TRACKED" && row.attributionClass !== "SUPPORTED_ASSOCIATION") return false;
    const observedAtMs = Date.parse(row.observedAt);
    return Number.isFinite(observedAtMs) && observedAtMs <= evaluatedAtMs;
  });
}

function role(
  roleName: SocialPlatformRoleV1,
  state: SocialPlatformRoleStateV1,
  basis: SocialPlatformRoleEvidenceBasisV1,
  observedContentCount: number,
  directTrackedOutcomeCount: number,
  supportedAssociationCount: number,
  evidenceRefs: readonly string[],
  statement: string,
): SocialPlatformRoleEvidenceV1 {
  return deepFreeze({
    role: roleName,
    state,
    basis,
    observedContentCount,
    directTrackedOutcomeCount,
    supportedAssociationCount,
    evidenceRefs: uniqueRefs(evidenceRefs, `${roleName}.evidenceRefs`),
    statement,
    confidence: null,
    causalClaim: false,
    revenueAttributionClaim: false,
    bestChannelClaim: false,
  });
}

function metricContentRole(
  snapshot: CanonicalSocialAccountSnapshotV1,
  roleName: Extract<SocialPlatformRoleV1, "TRAFFIC" | "COMMUNITY" | "LONG_FORM_AUTHORITY">,
  minIndependentContentItems: number,
): SocialPlatformRoleEvidenceV1 {
  const observed: Array<{ contentId: string; evidenceRefs: readonly string[] }> = [];

  for (const content of snapshot.content) {
    let refs: readonly string[] | null = null;
    if (roleName === "TRAFFIC") {
      refs = positiveMetric(content, "LINK_CLICKS")?.evidenceRefs ?? null;
    } else if (roleName === "COMMUNITY") {
      const positive = ["COMMENTS", "SHARES", "SAVES"] as const;
      const observations = positive.map((metric) => positiveMetric(content, metric)).filter((item): item is PositiveMetricObservation => item !== null);
      refs = observations.length ? observations.flatMap((item) => item.evidenceRefs) : null;
    } else {
      const watch = positiveMetric(content, "WATCH_TIME_SECONDS");
      const average = positiveMetric(content, "AVERAGE_VIEW_DURATION_SECONDS");
      refs = watch && average ? [...watch.evidenceRefs, ...average.evidenceRefs] : null;
    }
    if (refs?.length) observed.push({ contentId: content.contentId, evidenceRefs: refs });
  }

  if (!observed.length) {
    return role(
      roleName,
      "INSUFFICIENT_EVIDENCE",
      "NONE",
      0,
      0,
      0,
      [],
      `No positive, evidence-backed first-party ${roleName.toLocaleLowerCase().replaceAll("_", " ")} observation is available for this account.`,
    );
  }

  const supported = observed.length >= minIndependentContentItems;
  return role(
    roleName,
    supported ? "SUPPORTED_FOR_ROLE_REVIEW" : "OBSERVATION_ONLY",
    "FIRST_PARTY_CONTENT_METRICS",
    observed.length,
    0,
    0,
    observed.flatMap((item) => item.evidenceRefs),
    supported
      ? `${observed.length} distinct content items contain positive, evidence-backed first-party observations relevant to ${roleName.toLocaleLowerCase().replaceAll("_", " ")}. This supports reviewing the channel for that role, not declaring it the best channel or a causal driver.`
      : `Positive first-party evidence exists for ${roleName.toLocaleLowerCase().replaceAll("_", " ")}, but only ${observed.length} distinct content item(s) are observed versus the caller-required ${minIndependentContentItems}.`,
  );
}

function discoveryRole(
  snapshot: CanonicalSocialAccountSnapshotV1,
  evaluatedAtMs: number,
): SocialPlatformRoleEvidenceV1 {
  const period = latestCurrent30dPeriod(snapshot, evaluatedAtMs);
  if (!period) {
    return role("DISCOVERY", "INSUFFICIENT_EVIDENCE", "NONE", 0, 0, 0, [], "No current completed 30-day period is available for discovery-role review.");
  }

  const netNewAudience = positivePeriodMetric(period, "NET_NEW_AUDIENCE");
  const exposure = positivePeriodMetric(period, "REACH")
    ?? positivePeriodMetric(period, "VIEWS")
    ?? positivePeriodMetric(period, "IMPRESSIONS");
  if (!netNewAudience || !exposure) {
    return role(
      "DISCOVERY",
      "INSUFFICIENT_EVIDENCE",
      "NONE",
      0,
      0,
      0,
      [],
      "Discovery-role review requires a completed 30-day period with both positive evidenced exposure and positive evidenced net-new audience; missing or zero values are not promoted.",
    );
  }

  return role(
    "DISCOVERY",
    "SUPPORTED_FOR_ROLE_REVIEW",
    "FIRST_PARTY_ACCOUNT_METRICS",
    0,
    0,
    0,
    [...netNewAudience.evidenceRefs, ...exposure.evidenceRefs],
    "The current completed 30-day period contains positive evidenced exposure and positive net-new audience. This supports reviewing the channel for a discovery role, but does not establish that exposure caused audience growth or that this is the best discovery channel.",
  );
}

function businessRole(
  roleName: Extract<SocialPlatformRoleV1, "COLLECTOR_INTENT" | "PARTNERSHIP" | "MEDIA_PRESTIGE">,
  rows: readonly SocialBusinessOutcomeLinkageRowV1[],
  minLinkedBusinessOutcomes: number,
): SocialPlatformRoleEvidenceV1 {
  const acceptedKinds = roleName === "COLLECTOR_INTENT"
    ? new Set(["INQUIRY", "PURCHASE"] as const)
    : roleName === "PARTNERSHIP"
      ? new Set(["OPPORTUNITY"] as const)
      : new Set(["MEDIA_OUTCOME"] as const);

  const matched = rows.filter((row) => acceptedKinds.has(row.kind as never));
  const direct = matched.filter((row) => row.attributionClass === "DIRECT_TRACKED");
  const associated = matched.filter((row) => row.attributionClass === "SUPPORTED_ASSOCIATION");
  const distinctContent = new Set(matched.map((row) => row.socialContentRef).filter((value): value is string => Boolean(value))).size;
  const evidenceRefs = matched.flatMap((row) => row.evidenceRefs);

  if (!matched.length) {
    return role(roleName, "INSUFFICIENT_EVIDENCE", "NONE", 0, 0, 0, [], `No known linked ${roleName.toLocaleLowerCase().replaceAll("_", " ")} business outcomes are present for this account.`);
  }

  if (direct.length >= minLinkedBusinessOutcomes) {
    return role(
      roleName,
      "SUPPORTED_FOR_ROLE_REVIEW",
      "DIRECT_TRACKED_BUSINESS_OUTCOMES",
      distinctContent,
      direct.length,
      associated.length,
      evidenceRefs,
      `${direct.length} direct-tracked outcome(s) across ${distinctContent} linked content item(s) support reviewing this channel for ${roleName.toLocaleLowerCase().replaceAll("_", " ")}. This is tracked linkage evidence, not proof that the channel caused the business outcome or that it is the best channel for the role.`,
    );
  }

  return role(
    roleName,
    "OBSERVATION_ONLY",
    associated.length ? "SUPPORTED_BUSINESS_ASSOCIATIONS" : "DIRECT_TRACKED_BUSINESS_OUTCOMES",
    distinctContent,
    direct.length,
    associated.length,
    evidenceRefs,
    `${matched.length} linked outcome(s) are observed, but fewer than the caller-required ${minLinkedBusinessOutcomes} are direct-tracked. Keep this as observational role evidence rather than a durable channel-role conclusion.`,
  );
}

function verifyRequiredRoles(reason: string): SocialPlatformRoleEvidenceV1[] {
  return SOCIAL_PLATFORM_ROLES_V1.map((roleName) => role(
    roleName,
    "VERIFY_REQUIRED",
    "NONE",
    0,
    0,
    0,
    [],
    reason,
  ));
}

/**
 * Compiles evidence-backed platform-role observations without ranking channels
 * against one another. Platform metric definitions remain within-platform only,
 * while linked business outcomes preserve their upstream attribution class.
 */
export function compileSocialPlatformRoleLearningV1(
  input: SocialPlatformRoleLearningInputV1,
): SocialPlatformRoleLearningV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.snapshots)) throw new Error("snapshots must be an array");
  if (input.snapshots.length > SOCIAL_PLATFORM_ROLE_MAX_SNAPSHOTS_V1) {
    throw new Error(`at most ${SOCIAL_PLATFORM_ROLE_MAX_SNAPSHOTS_V1} social snapshots are allowed`);
  }

  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = deepFreeze({
    maxSnapshotAgeHours: requirePositiveFinite(input.policy.maxSnapshotAgeHours, "policy.maxSnapshotAgeHours"),
    maxOutcomeLinkageAgeHours: requirePositiveFinite(input.policy.maxOutcomeLinkageAgeHours, "policy.maxOutcomeLinkageAgeHours"),
    minIndependentContentItems: requirePositiveInteger(input.policy.minIndependentContentItems, "policy.minIndependentContentItems"),
    minLinkedBusinessOutcomes: requirePositiveInteger(input.policy.minLinkedBusinessOutcomes, "policy.minLinkedBusinessOutcomes"),
  });

  const identityKeys = new Set<string>();
  for (const snapshot of input.snapshots) {
    const key = `${snapshot.platform}:${snapshot.accountId}`;
    if (identityKeys.has(key)) throw new Error(`duplicate social account snapshot: ${key}`);
    identityKeys.add(key);
  }

  const outcomeCurrent = outcomeLinkageDecisionGrade(input.outcomeLinkage, evaluatedAtMs, policy.maxOutcomeLinkageAgeHours);
  const profiles: SocialPlatformRoleProfileV1[] = input.snapshots.map((snapshot) => {
    const sourceCurrent = sourceDecisionGrade(snapshot, evaluatedAtMs, policy.maxSnapshotAgeHours);
    if (!sourceCurrent) {
      return deepFreeze({
        platform: snapshot.platform,
        accountId: snapshot.accountId,
        sourceTruth: "VERIFY_REQUIRED" as const,
        roles: verifyRequiredRoles("The canonical social snapshot is not fully connected, fresh, current, and recently synced under the caller-owned freshness policy."),
      });
    }

    const metricRoles: SocialPlatformRoleEvidenceV1[] = [
      discoveryRole(snapshot, evaluatedAtMs),
      metricContentRole(snapshot, "TRAFFIC", policy.minIndependentContentItems),
      metricContentRole(snapshot, "COMMUNITY", policy.minIndependentContentItems),
      metricContentRole(snapshot, "LONG_FORM_AUTHORITY", policy.minIndependentContentItems),
    ];

    const businessRoles = outcomeCurrent
      ? [
          businessRole("COLLECTOR_INTENT", rowsForSnapshot(snapshot, input.outcomeLinkage, evaluatedAtMs), policy.minLinkedBusinessOutcomes),
          businessRole("PARTNERSHIP", rowsForSnapshot(snapshot, input.outcomeLinkage, evaluatedAtMs), policy.minLinkedBusinessOutcomes),
          businessRole("MEDIA_PRESTIGE", rowsForSnapshot(snapshot, input.outcomeLinkage, evaluatedAtMs), policy.minLinkedBusinessOutcomes),
        ]
      : ["COLLECTOR_INTENT", "PARTNERSHIP", "MEDIA_PRESTIGE"].map((roleName) => role(
          roleName as Extract<SocialPlatformRoleV1, "COLLECTOR_INTENT" | "PARTNERSHIP" | "MEDIA_PRESTIGE">,
          "VERIFY_REQUIRED",
          "NONE",
          0,
          0,
          0,
          [],
          "Business-role review is withheld because the canonical social-to-business linkage is stale, future-dated, or otherwise outside the caller-owned freshness policy.",
        ));

    const roles = [...metricRoles, ...businessRoles]
      .sort((left, right) => SOCIAL_PLATFORM_ROLES_V1.indexOf(left.role) - SOCIAL_PLATFORM_ROLES_V1.indexOf(right.role));

    return deepFreeze({
      platform: snapshot.platform,
      accountId: snapshot.accountId,
      sourceTruth: "DECISION_GRADE" as const,
      roles,
    });
  }).sort((left, right) => left.platform.localeCompare(right.platform) || left.accountId.localeCompare(right.accountId));

  const roleRows = profiles.flatMap((profile) => profile.roles);
  const hasVerify = roleRows.some((item) => item.state === "VERIFY_REQUIRED");
  const hasSupported = roleRows.some((item) => item.state === "SUPPORTED_FOR_ROLE_REVIEW");
  const hasObservation = roleRows.some((item) => item.state === "OBSERVATION_ONLY");
  const status: SocialPlatformRoleLearningV1["status"] = hasVerify
    ? hasSupported || hasObservation ? "PARTIAL" : "VERIFY_REQUIRED"
    : hasSupported
      ? hasObservation ? "PARTIAL" : "READY"
      : hasObservation
        ? "PARTIAL"
        : "INSUFFICIENT_EVIDENCE";

  return deepFreeze({
    contractVersion: SOCIAL_PLATFORM_ROLE_LEARNING_V1_VERSION,
    evaluatedAt,
    status,
    profiles,
    limitations: [
      "Platform-role output is a review aid built from observed first-party metrics and explicit linked outcomes; it is not a channel ranking or a statement that one platform is best.",
      "Cross-platform metric definitions remain non-comparable unless a separate governed normalization contract explicitly permits a comparison.",
      "Positive platform metrics and linked business outcomes do not establish causality, revenue attribution, endorsement, relationship strength, or future performance.",
      "Supported business associations remain weaker than direct tracked linkage and cannot be promoted to direct attribution.",
      "LONG_FORM_AUTHORITY is a role-review candidate based only on observed watch behavior; it is not proof of authority or reputation.",
      "This compiler grants no posting, paid amplification, strategy mutation, external action, or approval-bypass authority.",
    ],
    authority: {
      crossPlatformWinnerSelectionAllowed: false,
      strategyMutationAllowed: false,
      contentExecutionAllowed: false,
      paidAmplificationAllowed: false,
      publicPostingAllowed: false,
      externalActionAllowed: false,
      approvalBypassAllowed: false,
    },
    externalAccessPerformed: false,
    writesPerformed: false,
  });
}
