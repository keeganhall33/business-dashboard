import type {
  CanonicalSocialAccountSnapshotV1,
  CanonicalSocialContentV1,
  SocialMetricKeyV1,
  SocialPlatformV1
} from "./social-canonical-v1";
import type {
  ContentDnaDimensionV1,
  ContentDnaPatternV1,
  SocialContentDnaAnalysisV1
} from "./social-content-dna-v1";
import type { SocialBusinessOutcomeLinkageV1 } from "./social-business-outcome-linkage-v1";
import type {
  SocialPeerObservedPatternV1,
  SocialPeerPublicEvidenceV1
} from "./social-peer-public-evidence-v1";

export const SOCIAL_CONTENT_OPPORTUNITY_QUEUE_V1_VERSION = "SocialContentOpportunityQueueV1" as const;
export const SOCIAL_CONTENT_OPPORTUNITY_MAX_SNAPSHOTS_V1 = 20;
export const SOCIAL_CONTENT_OPPORTUNITY_MAX_ITEMS_V1 = 50;

export type SocialContentOpportunityPriorityV1 =
  | "DIRECT_TRACKED_BUSINESS_SIGNAL"
  | "SUPPORTED_BUSINESS_ASSOCIATION"
  | "HIGH_INTENT_FIRST_PARTY_SIGNAL";

export type SocialContentOpportunitySuppressionReasonV1 =
  | "SOURCE_SNAPSHOT_NOT_DECISION_GRADE"
  | "VANITY_ONLY_SIGNAL"
  | "NO_DECISION_GRADE_TARGET"
  | "TARGET_LACKS_HIGH_INTENT_MEASUREMENT"
  | "TARGET_HAS_CONTRARY_FIRST_PARTY_EVIDENCE"
  | "TARGET_ALREADY_TESTED_WITHOUT_SUPPORT"
  | "TARGET_ALREADY_HAS_FIRST_PARTY_SUPPORT";

export type SocialContentOpportunityPeerContextV1 = Readonly<{
  peerId: string;
  peerDisplayName: string;
  platform: SocialPlatformV1;
  dimension: "FORMAT" | "HOOK";
  value: string;
  distinctContentCount: number;
  statement: string;
  evidenceRefs: readonly string[];
  performanceClaim: false;
  relationshipClaim: false;
  causalClaim: false;
}>;

export type SocialContentOpportunityV1 = Readonly<{
  opportunityId: string;
  rank: number;
  priority: SocialContentOpportunityPriorityV1;
  sourcePlatform: SocialPlatformV1;
  targetPlatform: SocialPlatformV1;
  sourceDimension: ContentDnaDimensionV1;
  observedMechanism: string;
  sourcePatternRelativeToMedian: number | null;
  supportingContentRefs: readonly string[];
  firstPartyEvidenceRefs: readonly string[];
  linkedOutcomeCount: number;
  directTrackedOutcomeCount: number;
  highIntentSupportingContentCount: number;
  targetSuccessMetric: Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES">;
  formatDirection: string | null;
  hookDirection: string | null;
  subjectDirection: string | null;
  experimentPlan: string;
  successMetricPlan: string;
  peerContext: readonly SocialContentOpportunityPeerContextV1[];
  confidence: null;
  confidenceReason: "NOT_ESTIMATED_FROM_THIS_EVIDENCE";
  causalClaim: false;
  revenueAttributionClaim: false;
  competitorPerformanceClaim: false;
  publicPostingRequiresApproval: true;
  executionAuthority: "NONE";
}>;

export type SocialContentOpportunitySuppressionV1 = Readonly<{
  sourcePlatform: SocialPlatformV1;
  targetPlatform: SocialPlatformV1 | null;
  sourceDimension: ContentDnaDimensionV1;
  observedMechanism: string;
  reason: SocialContentOpportunitySuppressionReasonV1;
  evidenceRefs: readonly string[];
}>;

export type SocialContentOpportunityQueueInputV1 = Readonly<{
  generatedAt: string;
  dna: SocialContentDnaAnalysisV1;
  snapshots: readonly CanonicalSocialAccountSnapshotV1[];
  outcomeLinkage: SocialBusinessOutcomeLinkageV1;
  peerEvidence?: SocialPeerPublicEvidenceV1 | null;
  maxSourceAgeHours: number;
  maxPeerEvidenceAgeHours: number;
}>;

export type SocialContentOpportunityQueueV1 = Readonly<{
  contractVersion: typeof SOCIAL_CONTENT_OPPORTUNITY_QUEUE_V1_VERSION;
  generatedAt: string;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
  opportunities: readonly SocialContentOpportunityV1[];
  suppressions: readonly SocialContentOpportunitySuppressionV1[];
  limitations: readonly string[];
  rankingPolicy: readonly string[];
  postingAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

type HighIntentMetric = Extract<SocialMetricKeyV1, "LINK_CLICKS" | "PROFILE_VISITS" | "SAVES">;

const HIGH_INTENT_METRICS: readonly HighIntentMetric[] = ["LINK_CLICKS", "PROFILE_VISITS", "SAVES"];
const PRIORITY_ORDER: Readonly<Record<SocialContentOpportunityPriorityV1, number>> = Object.freeze({
  DIRECT_TRACKED_BUSINESS_SIGNAL: 0,
  SUPPORTED_BUSINESS_ASSOCIATION: 1,
  HIGH_INTENT_FIRST_PARTY_SIGNAL: 2
});

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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function contentRef(platform: SocialPlatformV1, contentId: string): string {
  return `${platform}:${contentId}`;
}

function contentDimensionValue(content: CanonicalSocialContentV1, dimension: ContentDnaDimensionV1): string | null {
  switch (dimension) {
    case "FORMAT": return content.format;
    case "SUBJECT": return content.subject;
    case "PROJECT": return content.project;
    case "THEME": return content.theme;
    case "HOOK": return content.hook;
    case "COLLABORATION": return content.collaborationContext;
    case "AMPLIFICATION": return content.amplificationType === "UNKNOWN" ? null : content.amplificationType;
  }
}

function sameText(left: string | null | undefined, right: string): boolean {
  return left?.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function isSnapshotDecisionGrade(
  snapshot: CanonicalSocialAccountSnapshotV1,
  generatedAtMs: number,
  maxSourceAgeHours: number
): boolean {
  if (snapshot.sourceCoverage.effectiveState !== "CONNECTED_AND_INGESTING") return false;
  if (snapshot.sourceCoverage.freshness !== "FRESH") return false;
  const retrievedAtMs = Date.parse(snapshot.retrievedAt);
  const lastSync = snapshot.sourceCoverage.lastSuccessfulSyncAt;
  if (!Number.isFinite(retrievedAtMs) || retrievedAtMs > generatedAtMs || !lastSync) return false;
  const syncMs = Date.parse(lastSync);
  if (!Number.isFinite(syncMs) || syncMs > generatedAtMs) return false;
  return generatedAtMs - syncMs <= maxSourceAgeHours * 3_600_000;
}

function targetSuccessMetric(snapshot: CanonicalSocialAccountSnapshotV1): HighIntentMetric | null {
  for (const metric of HIGH_INTENT_METRICS) {
    if (!snapshot.sourceCoverage.metricCoverage.includes(metric)) continue;
    const evidencedAtContentLevel = snapshot.content.some((content) => {
      const observation = content.metrics[metric];
      return observation.truthState === "KNOWN" && observation.value !== null && observation.evidenceRefs.length > 0;
    });
    if (evidencedAtContentLevel) return metric;
  }
  return null;
}

function priorityFor(
  linkedOutcomeCount: number,
  directTrackedOutcomeCount: number,
  highIntentSupportingContentCount: number
): SocialContentOpportunityPriorityV1 | null {
  if (directTrackedOutcomeCount > 0) return "DIRECT_TRACKED_BUSINESS_SIGNAL";
  if (linkedOutcomeCount > 0) return "SUPPORTED_BUSINESS_ASSOCIATION";
  if (highIntentSupportingContentCount > 0) return "HIGH_INTENT_FIRST_PARTY_SIGNAL";
  return null;
}

function currentPeerContext(
  peerEvidence: SocialPeerPublicEvidenceV1 | null | undefined,
  generatedAtMs: number,
  maxPeerEvidenceAgeHours: number,
  targetPlatform: SocialPlatformV1,
  sourcePattern: ContentDnaPatternV1
): SocialContentOpportunityPeerContextV1[] {
  if (!peerEvidence) return [];
  const asOfMs = Date.parse(peerEvidence.asOf);
  if (!Number.isFinite(asOfMs) || asOfMs > generatedAtMs) return [];
  if (generatedAtMs - asOfMs > maxPeerEvidenceAgeHours * 3_600_000) return [];
  const peerDimension: SocialContentOpportunityPeerContextV1["dimension"] | null = sourcePattern.dimension === "FORMAT"
    ? "FORMAT"
    : sourcePattern.dimension === "HOOK"
      ? "HOOK"
      : null;
  if (!peerDimension) return [];

  return peerEvidence.patterns
    .filter((pattern) =>
      pattern.platform === targetPlatform &&
      pattern.dimension === peerDimension &&
      sameText(pattern.value, sourcePattern.value)
    )
    .map((pattern: SocialPeerObservedPatternV1): SocialContentOpportunityPeerContextV1 => freeze({
      peerId: pattern.peerId,
      peerDisplayName: pattern.peerDisplayName,
      platform: pattern.platform,
      dimension: peerDimension,
      value: pattern.value,
      distinctContentCount: pattern.distinctContentCount,
      statement: pattern.statement,
      evidenceRefs: unique(pattern.evidenceRefs),
      performanceClaim: false as const,
      relationshipClaim: false as const,
      causalClaim: false as const
    }))
    .sort((a, b) => a.peerDisplayName.localeCompare(b.peerDisplayName) || a.value.localeCompare(b.value));
}

function opportunityId(
  sourcePlatform: SocialPlatformV1,
  targetPlatform: SocialPlatformV1,
  dimension: ContentDnaDimensionV1,
  value: string
): string {
  return ["social-content-opportunity", sourcePlatform, targetPlatform, dimension, value]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function targetPatternDisposition(
  dna: SocialContentDnaAnalysisV1,
  targetPlatform: SocialPlatformV1,
  sourcePattern: ContentDnaPatternV1
): "ABSENT" | "SUPPORTED" | "NEUTRAL" | "CONTRARY" {
  const targetPattern = dna.patterns.find((pattern) =>
    pattern.platform === targetPlatform &&
    pattern.dimension === sourcePattern.dimension &&
    sameText(pattern.value, sourcePattern.value)
  );
  if (!targetPattern) return "ABSENT";
  if (targetPattern.association === "ABOVE_PLATFORM_BASELINE") return "SUPPORTED";
  if (targetPattern.association === "BELOW_PLATFORM_BASELINE") return "CONTRARY";
  return "NEUTRAL";
}

function successMetricLabel(metric: HighIntentMetric): string {
  switch (metric) {
    case "LINK_CLICKS": return "link clicks";
    case "PROFILE_VISITS": return "profile visits";
    case "SAVES": return "saves";
  }
}

function sourceSupport(
  pattern: ContentDnaPatternV1,
  snapshot: CanonicalSocialAccountSnapshotV1,
  dna: SocialContentDnaAnalysisV1,
  outcomeLinkage: SocialBusinessOutcomeLinkageV1
): {
  contentRefs: string[];
  evidenceRefs: string[];
  linkedOutcomeCount: number;
  directTrackedOutcomeCount: number;
  highIntentSupportingContentCount: number;
} {
  const matchingContent = snapshot.content.filter((content) => sameText(contentDimensionValue(content, pattern.dimension), pattern.value));
  const dnaRows = new Map(
    dna.content
      .filter((row) => row.platform === snapshot.platform)
      .map((row) => [row.content_id, row])
  );
  const outcomeRows = new Map(outcomeLinkage.byContent.map((row) => [row.socialContentRef, row]));

  let linkedOutcomeCount = 0;
  let directTrackedOutcomeCount = 0;
  let highIntentSupportingContentCount = 0;
  const evidenceRefs = [...pattern.evidence_refs];
  const contentRefs: string[] = [];

  for (const content of matchingContent) {
    const ref = contentRef(snapshot.platform, content.contentId);
    const dnaRow = dnaRows.get(content.contentId);
    if (!dnaRow || dnaRow.engagement_per_1000_exposure === null) continue;
    contentRefs.push(ref);
    evidenceRefs.push(...dnaRow.evidence_refs);
    if ((dnaRow.high_intent_per_1000_exposure ?? 0) > 0) highIntentSupportingContentCount += 1;

    const outcome = outcomeRows.get(ref);
    if (outcome) {
      linkedOutcomeCount += outcome.linkedOutcomeCount;
      directTrackedOutcomeCount += outcome.directTrackedOutcomeCount;
      evidenceRefs.push(...outcome.evidenceRefs);
    }
  }

  return {
    contentRefs: unique(contentRefs),
    evidenceRefs: unique(evidenceRefs),
    linkedOutcomeCount,
    directTrackedOutcomeCount,
    highIntentSupportingContentCount
  };
}

export function compileSocialContentOpportunityQueueV1(
  input: SocialContentOpportunityQueueInputV1
): SocialContentOpportunityQueueV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.snapshots)) throw new Error("snapshots must be an array");
  if (input.snapshots.length > SOCIAL_CONTENT_OPPORTUNITY_MAX_SNAPSHOTS_V1) {
    throw new Error(`at most ${SOCIAL_CONTENT_OPPORTUNITY_MAX_SNAPSHOTS_V1} social snapshots are allowed`);
  }
  if (!Number.isFinite(input.maxSourceAgeHours) || input.maxSourceAgeHours <= 0) {
    throw new Error("maxSourceAgeHours must be a finite positive number");
  }
  if (!Number.isFinite(input.maxPeerEvidenceAgeHours) || input.maxPeerEvidenceAgeHours <= 0) {
    throw new Error("maxPeerEvidenceAgeHours must be a finite positive number");
  }

  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  if (Date.parse(input.outcomeLinkage.generatedAt) > generatedAtMs) {
    throw new Error("outcomeLinkage.generatedAt cannot be after generatedAt");
  }

  const snapshotsByPlatform = new Map<SocialPlatformV1, CanonicalSocialAccountSnapshotV1>();
  for (const snapshot of input.snapshots) {
    if (snapshotsByPlatform.has(snapshot.platform)) {
      throw new Error(`duplicate platform snapshot requires explicit account selection: ${snapshot.platform}`);
    }
    snapshotsByPlatform.set(snapshot.platform, snapshot);
  }

  const decisionGradePlatforms = [...snapshotsByPlatform.entries()]
    .filter(([, snapshot]) => isSnapshotDecisionGrade(snapshot, generatedAtMs, input.maxSourceAgeHours))
    .map(([platform]) => platform)
    .sort();

  const opportunities: Omit<SocialContentOpportunityV1, "rank">[] = [];
  const suppressions: SocialContentOpportunitySuppressionV1[] = [];

  const sourcePatterns = input.dna.patterns
    .filter((pattern) => pattern.association === "ABOVE_PLATFORM_BASELINE")
    .sort((a, b) =>
      a.platform.localeCompare(b.platform) ||
      a.dimension.localeCompare(b.dimension) ||
      a.value.localeCompare(b.value)
    );

  for (const pattern of sourcePatterns) {
    const sourceSnapshot = snapshotsByPlatform.get(pattern.platform);
    if (!sourceSnapshot || !isSnapshotDecisionGrade(sourceSnapshot, generatedAtMs, input.maxSourceAgeHours)) {
      suppressions.push(freeze({
        sourcePlatform: pattern.platform,
        targetPlatform: null,
        sourceDimension: pattern.dimension,
        observedMechanism: pattern.value,
        reason: "SOURCE_SNAPSHOT_NOT_DECISION_GRADE" as const,
        evidenceRefs: unique(pattern.evidence_refs)
      }));
      continue;
    }

    const support = sourceSupport(pattern, sourceSnapshot, input.dna, input.outcomeLinkage);
    const priority = priorityFor(
      support.linkedOutcomeCount,
      support.directTrackedOutcomeCount,
      support.highIntentSupportingContentCount
    );
    if (!priority) {
      suppressions.push(freeze({
        sourcePlatform: pattern.platform,
        targetPlatform: null,
        sourceDimension: pattern.dimension,
        observedMechanism: pattern.value,
        reason: "VANITY_ONLY_SIGNAL" as const,
        evidenceRefs: support.evidenceRefs
      }));
      continue;
    }

    const targets = decisionGradePlatforms.filter((platform) => platform !== pattern.platform);
    if (!targets.length) {
      suppressions.push(freeze({
        sourcePlatform: pattern.platform,
        targetPlatform: null,
        sourceDimension: pattern.dimension,
        observedMechanism: pattern.value,
        reason: "NO_DECISION_GRADE_TARGET" as const,
        evidenceRefs: support.evidenceRefs
      }));
      continue;
    }

    for (const targetPlatform of targets) {
      const targetSnapshot = snapshotsByPlatform.get(targetPlatform)!;
      const successMetric = targetSuccessMetric(targetSnapshot);
      if (!successMetric) {
        suppressions.push(freeze({
          sourcePlatform: pattern.platform,
          targetPlatform,
          sourceDimension: pattern.dimension,
          observedMechanism: pattern.value,
          reason: "TARGET_LACKS_HIGH_INTENT_MEASUREMENT" as const,
          evidenceRefs: support.evidenceRefs
        }));
        continue;
      }

      const targetDisposition = targetPatternDisposition(input.dna, targetPlatform, pattern);
      if (targetDisposition === "SUPPORTED") {
        suppressions.push(freeze({
          sourcePlatform: pattern.platform,
          targetPlatform,
          sourceDimension: pattern.dimension,
          observedMechanism: pattern.value,
          reason: "TARGET_ALREADY_HAS_FIRST_PARTY_SUPPORT" as const,
          evidenceRefs: support.evidenceRefs
        }));
        continue;
      }
      if (targetDisposition === "NEUTRAL") {
        suppressions.push(freeze({
          sourcePlatform: pattern.platform,
          targetPlatform,
          sourceDimension: pattern.dimension,
          observedMechanism: pattern.value,
          reason: "TARGET_ALREADY_TESTED_WITHOUT_SUPPORT" as const,
          evidenceRefs: support.evidenceRefs
        }));
        continue;
      }
      if (targetDisposition === "CONTRARY") {
        suppressions.push(freeze({
          sourcePlatform: pattern.platform,
          targetPlatform,
          sourceDimension: pattern.dimension,
          observedMechanism: pattern.value,
          reason: "TARGET_HAS_CONTRARY_FIRST_PARTY_EVIDENCE" as const,
          evidenceRefs: support.evidenceRefs
        }));
        continue;
      }

      const peerContext = currentPeerContext(
        input.peerEvidence,
        generatedAtMs,
        input.maxPeerEvidenceAgeHours,
        targetPlatform,
        pattern
      );
      const metricLabel = successMetricLabel(successMetric);
      const mechanism = `${pattern.dimension.toLowerCase()} “${pattern.value}”`;
      const targetPlan = `Run one approval-gated ${targetPlatform} test that adapts the first-party ${mechanism} observed on ${pattern.platform} into a native ${targetPlatform} execution. Preserve the evidenced mechanism, but do not copy peer creative or infer that the mechanism will transfer.`;
      const metricPlan = `Use ${metricLabel} (${successMetric}) as the predeclared high-intent success metric and compare only against a matched ${targetPlatform} baseline. This queue does not invent a threshold; set the threshold before the test and evaluate the observed result separately.`;

      opportunities.push(freeze({
        opportunityId: opportunityId(pattern.platform, targetPlatform, pattern.dimension, pattern.value),
        priority,
        sourcePlatform: pattern.platform,
        targetPlatform,
        sourceDimension: pattern.dimension,
        observedMechanism: pattern.value,
        sourcePatternRelativeToMedian: pattern.relative_to_platform_median,
        supportingContentRefs: support.contentRefs,
        firstPartyEvidenceRefs: support.evidenceRefs,
        linkedOutcomeCount: support.linkedOutcomeCount,
        directTrackedOutcomeCount: support.directTrackedOutcomeCount,
        highIntentSupportingContentCount: support.highIntentSupportingContentCount,
        targetSuccessMetric: successMetric,
        formatDirection: pattern.dimension === "FORMAT" ? pattern.value : null,
        hookDirection: pattern.dimension === "HOOK" ? pattern.value : null,
        subjectDirection: pattern.dimension === "SUBJECT" ? pattern.value : null,
        experimentPlan: targetPlan,
        successMetricPlan: metricPlan,
        peerContext,
        confidence: null,
        confidenceReason: "NOT_ESTIMATED_FROM_THIS_EVIDENCE" as const,
        causalClaim: false as const,
        revenueAttributionClaim: false as const,
        competitorPerformanceClaim: false as const,
        publicPostingRequiresApproval: true as const,
        executionAuthority: "NONE" as const
      }));
    }
  }

  opportunities.sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    b.directTrackedOutcomeCount - a.directTrackedOutcomeCount ||
    b.linkedOutcomeCount - a.linkedOutcomeCount ||
    b.highIntentSupportingContentCount - a.highIntentSupportingContentCount ||
    (b.sourcePatternRelativeToMedian ?? -1) - (a.sourcePatternRelativeToMedian ?? -1) ||
    a.opportunityId.localeCompare(b.opportunityId)
  );

  const bounded = opportunities.slice(0, SOCIAL_CONTENT_OPPORTUNITY_MAX_ITEMS_V1).map((item, index) => freeze({
    ...item,
    rank: index + 1
  }));

  const peerCurrent = input.peerEvidence
    ? Date.parse(input.peerEvidence.asOf) <= generatedAtMs && generatedAtMs - Date.parse(input.peerEvidence.asOf) <= input.maxPeerEvidenceAgeHours * 3_600_000
    : false;
  const limitations = [
    "Ranking uses only evidence class and observed counts; it is not a confidence estimate, forecast, expected value, or causal ranking.",
    "High first-party engagement without a linked business signal or positive high-intent signal is suppressed as vanity-only evidence.",
    "Cross-platform adaptation is always an experiment because platform mechanics and audience behavior differ.",
    "Peer public evidence is observation-only context and never changes rank or establishes competitor performance, endorsement, relationship, or causality.",
    "Public posting remains approval-gated; this queue grants no execution authority."
  ];
  if (input.peerEvidence && !peerCurrent) {
    limitations.push("Peer evidence is outside the configured freshness window and is excluded from opportunity context.");
  }
  if (opportunities.length > bounded.length) {
    limitations.push(`Opportunity output is bounded to the top ${SOCIAL_CONTENT_OPPORTUNITY_MAX_ITEMS_V1} deterministic items.`);
  }

  const status: SocialContentOpportunityQueueV1["status"] = bounded.length
    ? suppressions.length ? "PARTIAL" : "READY"
    : sourcePatterns.length ? "PARTIAL" : "INSUFFICIENT_EVIDENCE";

  return freeze({
    contractVersion: SOCIAL_CONTENT_OPPORTUNITY_QUEUE_V1_VERSION,
    generatedAt,
    status,
    opportunities: bounded,
    suppressions: suppressions.sort((a, b) =>
      a.sourcePlatform.localeCompare(b.sourcePlatform) ||
      (a.targetPlatform ?? "").localeCompare(b.targetPlatform ?? "") ||
      a.sourceDimension.localeCompare(b.sourceDimension) ||
      a.observedMechanism.localeCompare(b.observedMechanism) ||
      a.reason.localeCompare(b.reason)
    ),
    limitations,
    rankingPolicy: [
      "DIRECT_TRACKED_BUSINESS_SIGNAL precedes SUPPORTED_BUSINESS_ASSOCIATION, which precedes HIGH_INTENT_FIRST_PARTY_SIGNAL.",
      "Within the same evidence class, observed direct-linked counts, linked counts, high-intent supporting-content counts, then the source within-platform association magnitude are used only as deterministic tie-breakers.",
      "Peer observations never increase rank."
    ],
    postingAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
