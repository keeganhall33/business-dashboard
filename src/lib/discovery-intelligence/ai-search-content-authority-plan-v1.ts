import {
  AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION,
  type AISearchAuthorityScorecardV1,
  type AISearchObservedAuthorityGapV1
} from "./ai-search-authority-scorecard-v1";

export const AI_SEARCH_CONTENT_AUTHORITY_PLAN_V1_VERSION = "AISearchContentAuthorityPlanV1" as const;

export type ContentAuthorityOrientationV1 = "KEEGAN_FIRST" | "CATEGORY_HISTORY";
export type ContentAuthorityRiskV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type ContentAuthorityRecommendationV1 = "PUBLISH" | "PREPARE" | "SKIP";
export type ContentAuthorityContributionV1 = "OBSERVED_GAP_COVERAGE" | "NOT_ESTABLISHED";

export type ContentAuthorityCandidateV1 = Readonly<{
  candidateId: string;
  title: string;
  orientation: ContentAuthorityOrientationV1;
  targetGapIds: readonly string[];
  audienceValue: string;
  existingKeeganEvidenceRefs: readonly string[];
  outline: readonly string[];
  factualClaimEvidenceRefs: readonly string[];
  claimManifestComplete: boolean;
  internalLinkRefs: readonly string[];
  requiresExternalEvidence: boolean;
  externalEvidenceRefs: readonly string[];
  schemaOpportunities: readonly string[];
  commercialCta: string | null;
  cannibalizationRisk: ContentAuthorityRiskV1;
  competitorLeakageRisk: ContentAuthorityRiskV1;
  competitorStorefrontOutboundLinks: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type ContentAuthorityCandidateIssueV1 =
  | "UNKNOWN_TARGET_GAP"
  | "NO_OBSERVED_AUTHORITY_GAP"
  | "MISSING_KEEGAN_EVIDENCE"
  | "INCOMPLETE_CLAIM_MANIFEST"
  | "INCOMPLETE_BRIEF"
  | "MISSING_REQUIRED_EXTERNAL_EVIDENCE"
  | "HIGH_CANNIBALIZATION_RISK"
  | "UNKNOWN_CANNIBALIZATION_RISK"
  | "HIGH_COMPETITOR_LEAKAGE_RISK"
  | "UNKNOWN_COMPETITOR_LEAKAGE_RISK"
  | "COMPETITOR_STOREFRONT_LINK_PRESENT"
  | "SCORECARD_NOT_DECISION_READY";

export type ContentAuthorityOpportunityV1 = Readonly<{
  candidateId: string;
  title: string;
  orientation: ContentAuthorityOrientationV1;
  recommendation: ContentAuthorityRecommendationV1;
  observedGapCount: number;
  observedGapIds: readonly string[];
  observedGapKinds: readonly AISearchObservedAuthorityGapV1["kind"][];
  targetQueryIds: readonly string[];
  targetQueryTexts: readonly string[];
  targetQueryFamilies: readonly string[];
  targetSystems: readonly string[];
  authorityContribution: ContentAuthorityContributionV1;
  issues: readonly ContentAuthorityCandidateIssueV1[];
  evidenceRefs: readonly string[];
  implementationReadyBrief: boolean;
  publicPublishingRequiresApproval: true;
  publicPublishingAuthorized: false;
  expectedLift: null;
  monetaryValue: null;
  competitorPerformanceClaim: false;
  causalClaim: false;
}>;

export type AISearchContentAuthorityPlanV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_CONTENT_AUTHORITY_PLAN_V1_VERSION;
  generatedAt: string;
  sourceScorecardVersion: typeof AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION;
  sourceScorecardStatus: AISearchAuthorityScorecardV1["status"];
  opportunityMatrix: readonly ContentAuthorityOpportunityV1[];
  implementationReadyTopFive: readonly ContentAuthorityOpportunityV1[];
  omittedCandidateIds: readonly string[];
  counts: Readonly<{
    reviewed: number;
    selected: number;
    keeganFirstSelected: number;
    categoryHistorySelected: number;
    publish: number;
    prepare: number;
    skip: number;
    implementationReadyBriefs: number;
  }>;
  commercialRule: Readonly<{
    minimumKeeganFirstShare: 0.8;
    observedKeeganFirstShare: number | null;
    satisfied: boolean;
  }>;
  deterministicSyntheticScoreProduced: false;
  expectedAuthorityLiftInferred: false;
  publicPublishingPerformed: false;
  publicPublishingAuthorized: false;
  competitorStorefrontPromotionAuthorized: false;
  externalResearchPerformed: false;
  writesPerformed: false;
}>;

const MAX_CANDIDATES = 100;
const MAX_MATRIX = 20;
const MAX_TOP_BRIEFS = 5;
const MIN_KEEGAN_FIRST_SHARE = 0.8 as const;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function text(value: unknown, field: string, max = 1_000): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized;
}

function nullableText(value: string | null, field: string): string | null {
  if (value == null) return null;
  return text(value, field);
}

function list(values: readonly string[], field: string, maxItems = 100): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  if (values.length > maxItems) throw new Error(`${field} exceeds ${maxItems} items`);
  return [...new Set(values.map((value, index) => text(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
}

function iso(value: string | Date, field: string): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function hasCompleteBrief(candidate: ContentAuthorityCandidateV1): boolean {
  return (
    candidate.outline.length > 0 &&
    candidate.internalLinkRefs.length > 0 &&
    candidate.schemaOpportunities.length > 0 &&
    Boolean(candidate.commercialCta?.trim())
  );
}

function assessCandidate(
  candidate: ContentAuthorityCandidateV1,
  index: number,
  scorecard: AISearchAuthorityScorecardV1,
  gapsById: ReadonlyMap<string, AISearchObservedAuthorityGapV1>
): ContentAuthorityOpportunityV1 {
  const candidateId = text(candidate.candidateId, `candidates[${index}].candidateId`, 160);
  const title = text(candidate.title, `candidates[${index}].title`, 300);
  if (candidate.orientation !== "KEEGAN_FIRST" && candidate.orientation !== "CATEGORY_HISTORY") {
    throw new Error(`candidates[${index}].orientation is unsupported`);
  }
  text(candidate.audienceValue, `candidates[${index}].audienceValue`, 2_000);

  const targetGapIds = list(candidate.targetGapIds, `candidates[${index}].targetGapIds`, 100);
  const existingKeeganEvidenceRefs = list(
    candidate.existingKeeganEvidenceRefs,
    `candidates[${index}].existingKeeganEvidenceRefs`,
    100
  );
  list(candidate.outline, `candidates[${index}].outline`, 30);
  const factualClaimEvidenceRefs = list(
    candidate.factualClaimEvidenceRefs,
    `candidates[${index}].factualClaimEvidenceRefs`,
    100
  );
  list(candidate.internalLinkRefs, `candidates[${index}].internalLinkRefs`, 50);
  const externalEvidenceRefs = list(candidate.externalEvidenceRefs, `candidates[${index}].externalEvidenceRefs`, 100);
  list(candidate.schemaOpportunities, `candidates[${index}].schemaOpportunities`, 30);
  nullableText(candidate.commercialCta, `candidates[${index}].commercialCta`);
  const competitorLinks = list(
    candidate.competitorStorefrontOutboundLinks,
    `candidates[${index}].competitorStorefrontOutboundLinks`,
    20
  );
  const ownEvidenceRefs = list(candidate.evidenceRefs, `candidates[${index}].evidenceRefs`, 100);

  const issues: ContentAuthorityCandidateIssueV1[] = [];
  const observedGaps: AISearchObservedAuthorityGapV1[] = [];
  let unknownTargetGap = false;
  for (const gapId of targetGapIds) {
    const gap = gapsById.get(gapId);
    if (!gap) {
      unknownTargetGap = true;
      continue;
    }
    observedGaps.push(gap);
  }
  if (unknownTargetGap) issues.push("UNKNOWN_TARGET_GAP");
  if (observedGaps.length === 0) issues.push("NO_OBSERVED_AUTHORITY_GAP");
  if (existingKeeganEvidenceRefs.length === 0) issues.push("MISSING_KEEGAN_EVIDENCE");
  if (!candidate.claimManifestComplete || factualClaimEvidenceRefs.length === 0) issues.push("INCOMPLETE_CLAIM_MANIFEST");
  if (!hasCompleteBrief(candidate)) issues.push("INCOMPLETE_BRIEF");
  if (candidate.requiresExternalEvidence && externalEvidenceRefs.length === 0) issues.push("MISSING_REQUIRED_EXTERNAL_EVIDENCE");
  if (candidate.cannibalizationRisk === "HIGH") issues.push("HIGH_CANNIBALIZATION_RISK");
  if (candidate.cannibalizationRisk === "UNKNOWN") issues.push("UNKNOWN_CANNIBALIZATION_RISK");
  if (candidate.competitorLeakageRisk === "HIGH") issues.push("HIGH_COMPETITOR_LEAKAGE_RISK");
  if (candidate.competitorLeakageRisk === "UNKNOWN") issues.push("UNKNOWN_COMPETITOR_LEAKAGE_RISK");
  if (competitorLinks.length > 0) issues.push("COMPETITOR_STOREFRONT_LINK_PRESENT");
  if (scorecard.status === "INSUFFICIENT_EVIDENCE") issues.push("SCORECARD_NOT_DECISION_READY");

  const skipIssues = new Set<ContentAuthorityCandidateIssueV1>([
    "MISSING_KEEGAN_EVIDENCE",
    "HIGH_COMPETITOR_LEAKAGE_RISK",
    "COMPETITOR_STOREFRONT_LINK_PRESENT"
  ]);
  const prepareIssues = new Set<ContentAuthorityCandidateIssueV1>([
    "UNKNOWN_TARGET_GAP",
    "NO_OBSERVED_AUTHORITY_GAP",
    "INCOMPLETE_CLAIM_MANIFEST",
    "INCOMPLETE_BRIEF",
    "MISSING_REQUIRED_EXTERNAL_EVIDENCE",
    "HIGH_CANNIBALIZATION_RISK",
    "UNKNOWN_CANNIBALIZATION_RISK",
    "UNKNOWN_COMPETITOR_LEAKAGE_RISK",
    "SCORECARD_NOT_DECISION_READY"
  ]);

  let recommendation: ContentAuthorityRecommendationV1 = "PUBLISH";
  if (issues.some((issue) => skipIssues.has(issue))) recommendation = "SKIP";
  else if (issues.some((issue) => prepareIssues.has(issue))) recommendation = "PREPARE";

  const gapEvidence = observedGaps.flatMap((gap) => gap.evidenceRefs);
  const evidenceRefs = unique([...ownEvidenceRefs, ...existingKeeganEvidenceRefs, ...factualClaimEvidenceRefs, ...externalEvidenceRefs, ...gapEvidence]);
  const implementationReadyBrief = recommendation === "PUBLISH";

  return freeze({
    candidateId,
    title,
    orientation: candidate.orientation,
    recommendation,
    observedGapCount: observedGaps.length,
    observedGapIds: unique(observedGaps.map((gap) => gap.gapId)),
    observedGapKinds: unique(observedGaps.map((gap) => gap.kind)),
    targetQueryIds: unique(observedGaps.map((gap) => gap.queryId)),
    targetQueryTexts: unique(observedGaps.map((gap) => gap.queryText)),
    targetQueryFamilies: unique(observedGaps.map((gap) => gap.queryFamily)),
    targetSystems: unique(observedGaps.map((gap) => gap.system)),
    authorityContribution: observedGaps.length > 0 ? "OBSERVED_GAP_COVERAGE" : "NOT_ESTABLISHED",
    issues: unique(issues),
    evidenceRefs,
    implementationReadyBrief,
    publicPublishingRequiresApproval: true,
    publicPublishingAuthorized: false,
    expectedLift: null,
    monetaryValue: null,
    competitorPerformanceClaim: false,
    causalClaim: false
  });
}

function recommendationOrder(value: ContentAuthorityRecommendationV1): number {
  if (value === "PUBLISH") return 0;
  if (value === "PREPARE") return 1;
  return 2;
}

function compareOpportunity(a: ContentAuthorityOpportunityV1, b: ContentAuthorityOpportunityV1): number {
  return (
    recommendationOrder(a.recommendation) - recommendationOrder(b.recommendation) ||
    b.observedGapCount - a.observedGapCount ||
    b.evidenceRefs.length - a.evidenceRefs.length ||
    a.title.localeCompare(b.title) ||
    a.candidateId.localeCompare(b.candidateId)
  );
}

function selectCommercialMix(opportunities: readonly ContentAuthorityOpportunityV1[]): ContentAuthorityOpportunityV1[] {
  const ranked = [...opportunities].sort(compareOpportunity);
  const keeganFirst = ranked.filter((item) => item.orientation === "KEEGAN_FIRST");
  const category = ranked.filter((item) => item.orientation === "CATEGORY_HISTORY");

  const selected: ContentAuthorityOpportunityV1[] = keeganFirst.slice(0, 16);
  const categoryCapacity = Math.min(4, category.length, Math.floor(selected.length / 4), MAX_MATRIX - selected.length);
  selected.push(...category.slice(0, categoryCapacity));
  if (selected.length < MAX_MATRIX) {
    selected.push(...keeganFirst.slice(16, 16 + (MAX_MATRIX - selected.length)));
  }
  return selected.sort(compareOpportunity);
}

export function buildAISearchContentAuthorityPlanV1(input: Readonly<{
  scorecard: AISearchAuthorityScorecardV1;
  candidates: readonly ContentAuthorityCandidateV1[];
  now: string | Date;
}>): AISearchContentAuthorityPlanV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.scorecard || input.scorecard.contractVersion !== AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION) {
    throw new Error("scorecard must use AISearchAuthorityScorecardV1");
  }
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > MAX_CANDIDATES) throw new Error(`candidates must contain at most ${MAX_CANDIDATES} items`);
  const generatedAt = iso(input.now, "now");
  if (Date.parse(input.scorecard.coverage.evaluatedAt) > Date.parse(generatedAt)) {
    throw new Error("scorecard cannot be evaluated in the future relative to now");
  }

  const gapsById = new Map(input.scorecard.observedAuthorityGaps.map((gap) => [gap.gapId, gap] as const));
  const seenCandidateIds = new Set<string>();
  const assessed = input.candidates.map((candidate, index) => {
    const id = text(candidate.candidateId, `candidates[${index}].candidateId`, 160);
    if (seenCandidateIds.has(id)) throw new Error(`duplicate candidateId: ${id}`);
    seenCandidateIds.add(id);
    return assessCandidate(candidate, index, input.scorecard, gapsById);
  });

  const selected = selectCommercialMix(assessed);
  const selectedIds = new Set(selected.map((item) => item.candidateId));
  const omittedCandidateIds = assessed.map((item) => item.candidateId).filter((id) => !selectedIds.has(id)).sort((a, b) => a.localeCompare(b));
  const implementationReadyTopFive = selected.filter((item) => item.implementationReadyBrief).slice(0, MAX_TOP_BRIEFS);
  const keeganFirstSelected = selected.filter((item) => item.orientation === "KEEGAN_FIRST").length;
  const categoryHistorySelected = selected.length - keeganFirstSelected;
  const observedKeeganFirstShare = selected.length ? Math.round((keeganFirstSelected / selected.length) * 10_000) / 10_000 : null;

  return freeze({
    contractVersion: AI_SEARCH_CONTENT_AUTHORITY_PLAN_V1_VERSION,
    generatedAt,
    sourceScorecardVersion: AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION,
    sourceScorecardStatus: input.scorecard.status,
    opportunityMatrix: selected,
    implementationReadyTopFive,
    omittedCandidateIds,
    counts: {
      reviewed: assessed.length,
      selected: selected.length,
      keeganFirstSelected,
      categoryHistorySelected,
      publish: selected.filter((item) => item.recommendation === "PUBLISH").length,
      prepare: selected.filter((item) => item.recommendation === "PREPARE").length,
      skip: selected.filter((item) => item.recommendation === "SKIP").length,
      implementationReadyBriefs: implementationReadyTopFive.length
    },
    commercialRule: {
      minimumKeeganFirstShare: MIN_KEEGAN_FIRST_SHARE,
      observedKeeganFirstShare,
      satisfied: observedKeeganFirstShare == null || observedKeeganFirstShare >= MIN_KEEGAN_FIRST_SHARE
    },
    deterministicSyntheticScoreProduced: false,
    expectedAuthorityLiftInferred: false,
    publicPublishingPerformed: false,
    publicPublishingAuthorized: false,
    competitorStorefrontPromotionAuthorized: false,
    externalResearchPerformed: false,
    writesPerformed: false
  });
}
