import { createHash } from "node:crypto";

import type {
  KnowledgeIntegrityFindingV1,
  KnowledgeIntegritySeverity
} from "@/lib/intelligence/knowledge-compilation/knowledge-integrity-v1";
import type {
  DecisionDispositionV1,
  DecisionPortfolioV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_VERSION_V1 =
  "KnowledgeIntegrityPortfolioReviewV1" as const;
export const KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_POLICY_VERSION_V1 =
  "knowledge_integrity_portfolio_review_v1.0.0" as const;

const MAX_FINDINGS = 128;
const MAX_REFS = 200;
const MAX_FINDING_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export type KnowledgeIntegrityPortfolioReviewStateV1 =
  | "REVALIDATE_BEFORE_ACTION"
  | "REVIEW_REQUIRED"
  | "VERIFY_REQUIRED"
  | "NO_ACTION"
  | "BLOCKED";

export type KnowledgeIntegrityPortfolioReviewReasonV1 =
  | "BLOCKING_KNOWLEDGE_INTEGRITY_FINDING"
  | "IMPORTANT_KNOWLEDGE_INTEGRITY_FINDING"
  | "KNOWLEDGE_INTEGRITY_REVIEW_REQUIRED"
  | "INFORMATIONAL_FINDING_ONLY"
  | "FINDING_NOT_DECISION_RELEVANT"
  | "PORTFOLIO_CONTRACT_INVALID"
  | "PORTFOLIO_TIME_INVALID"
  | "INVALID_REVIEW_TIME"
  | "INVALID_FRESHNESS_POLICY"
  | "FINDING_CONTRACT_INVALID"
  | "FINDING_DUPLICATED"
  | "TARGET_LINK_DUPLICATED"
  | "TARGET_CANDIDATE_MISSING"
  | "TARGET_CANDIDATE_DUPLICATED"
  | "TARGET_NOT_KNOWN"
  | "TARGET_EVIDENCE_MISSING"
  | "TARGET_SOURCE_MISSING"
  | "TARGET_LINK_MISMATCH"
  | "TARGET_LINK_EVIDENCE_MISSING"
  | "TARGET_LINK_EVIDENCE_NOT_SHARED"
  | "FINDING_EVIDENCE_MISSING"
  | "FINDING_SOURCE_LINEAGE_MISSING"
  | "FINDING_OBSERVED_AT_INVALID"
  | "FINDING_FIRST_SEEN_INVALID"
  | "FINDING_TEMPORAL_ORDER_INVALID"
  | "FINDING_IN_FUTURE"
  | "FINDING_STALE"
  | "FINDING_REVIEW_FLAG_INVARIANT_FAILED"
  | "FINDING_DIRECT_EVIDENCE_REQUIRED";

export type KnowledgeIntegrityPortfolioTargetLinkV1 = Readonly<{
  findingId: string;
  candidateId: string;
  evidenceRefs: readonly string[];
}>;

export type KnowledgeIntegrityPortfolioReviewItemV1 = Readonly<{
  findingId: string;
  findingType: KnowledgeIntegrityFindingV1["finding_type"] | null;
  findingSeverity: KnowledgeIntegritySeverity | null;
  candidateId: string;
  previousDisposition: DecisionDispositionV1 | null;
  state: KnowledgeIntegrityPortfolioReviewStateV1;
  reasonCodes: readonly KnowledgeIntegrityPortfolioReviewReasonV1[];
  sourceObservedAt: string | null;
  findingAgeMs: number | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep:
    | "REVALIDATE_CANONICAL_CANDIDATE_BEFORE_ACTION"
    | "REVIEW_KNOWLEDGE_INTEGRITY_IMPACT"
    | "VERIFY_KNOWLEDGE_INTEGRITY_EVIDENCE"
    | null;
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outcomePrediction: null;
  causalInterpretation: "NOT_ESTABLISHED";
}>;

export type KnowledgeIntegrityPortfolioReviewV1 = Readonly<{
  contractVersion: typeof KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_VERSION_V1;
  policyVersion: typeof KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  generatedAt: string;
  sourcePortfolioId: string;
  items: readonly KnowledgeIntegrityPortfolioReviewItemV1[];
  summary: Readonly<{
    linkedFindings: number;
    revalidateBeforeAction: number;
    reviewRequired: number;
    verifyRequired: number;
    noAction: number;
    blocked: number;
  }>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scoreMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  }>;
}>;

export type KnowledgeIntegrityPortfolioReviewInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1;
  findings: readonly KnowledgeIntegrityFindingV1[];
  targetLinks: readonly KnowledgeIntegrityPortfolioTargetLinkV1[];
  reviewedAt: string;
  maximumFindingAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  portfolioMutationAuthorized: false as const,
  allocationChangeAuthorized: false as const,
  scoreMutationAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  persistenceAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const,
  causalAttributionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "A knowledge-integrity finding is a reason to review or revalidate current decision evidence, not evidence that a different decision will perform better.",
  "Severity and business-impact labels are never converted into confidence, causality, monetary value, urgency, or predicted outcomes by this bridge.",
  "Only exact canonical finding-to-candidate links with shared evidence lineage may influence portfolio review; semantic or fuzzy identity matching is prohibited.",
  "This bridge cannot mutate the portfolio, reallocate capacity, execute campaigns or experiments, change pricing or negotiation posture, persist truth, or bypass approval."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function uniqueSorted(values: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze(
    [...new Set(values.map((value) => text(value)).filter((value): value is string => value !== null))]
      .slice(0, MAX_REFS)
      .sort((a, b) => a.localeCompare(b))
  );
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function stableReviewId(values: readonly string[]): string {
  return `knowledge-integrity-portfolio:${createHash("sha256")
    .update(values.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function findingContractValid(finding: KnowledgeIntegrityFindingV1 | undefined): boolean {
  return Boolean(
    finding
      && finding.contract_version === "KNOWLEDGE_INTEGRITY_V1"
      && text(finding.finding_id)
      && text(finding.finding_type)
      && text(finding.severity)
      && Array.isArray(finding.affected_canonical_ids)
      && Array.isArray(finding.evidence_refs)
      && Array.isArray(finding.source_lineage_refs)
  );
}

function item(
  input: KnowledgeIntegrityPortfolioReviewInputV1,
  link: KnowledgeIntegrityPortfolioTargetLinkV1,
  duplicateFindingIds: ReadonlySet<string>,
  duplicateLinkKeys: ReadonlySet<string>,
  reviewedAt: string | null,
  maximumAgeValid: boolean
): KnowledgeIntegrityPortfolioReviewItemV1 {
  const findingId = text(link.findingId) ?? "unknown-finding";
  const candidateId = text(link.candidateId) ?? "unknown-candidate";
  const findingMatches = input.findings.filter((candidate) => candidate.finding_id === findingId);
  const finding = findingMatches.length === 1 ? findingMatches[0] : undefined;
  const candidateMatches = input.portfolio?.contractVersion === "DecisionPortfolioV1"
    ? input.portfolio.items.filter((candidate) => candidate.candidate.id === candidateId)
    : [];
  const candidate = candidateMatches.length === 1 ? candidateMatches[0] : null;

  const blocking = new Set<KnowledgeIntegrityPortfolioReviewReasonV1>();
  const verification = new Set<KnowledgeIntegrityPortfolioReviewReasonV1>();

  if (input.portfolio?.contractVersion !== "DecisionPortfolioV1") blocking.add("PORTFOLIO_CONTRACT_INVALID");
  if (!timestamp(input.portfolio?.generatedAt)) blocking.add("PORTFOLIO_TIME_INVALID");
  if (!reviewedAt) blocking.add("INVALID_REVIEW_TIME");
  if (!maximumAgeValid) blocking.add("INVALID_FRESHNESS_POLICY");
  if (!findingContractValid(finding)) blocking.add("FINDING_CONTRACT_INVALID");
  if (duplicateFindingIds.has(findingId) || findingMatches.length > 1) blocking.add("FINDING_DUPLICATED");
  if (duplicateLinkKeys.has(`${findingId}\u0000${candidateId}`)) blocking.add("TARGET_LINK_DUPLICATED");
  if (candidateMatches.length === 0) blocking.add("TARGET_CANDIDATE_MISSING");
  if (candidateMatches.length > 1) blocking.add("TARGET_CANDIDATE_DUPLICATED");

  if (candidate && candidate.candidate.evidenceState !== "KNOWN") verification.add("TARGET_NOT_KNOWN");
  const candidateEvidence = uniqueSorted(candidate?.candidate.evidenceRefs);
  const candidateSources = uniqueSorted(candidate?.candidate.sourceRefs);
  if (candidate && candidateEvidence.length === 0) verification.add("TARGET_EVIDENCE_MISSING");
  if (candidate && candidateSources.length === 0) verification.add("TARGET_SOURCE_MISSING");

  const linkEvidence = uniqueSorted(link.evidenceRefs);
  if (linkEvidence.length === 0) verification.add("TARGET_LINK_EVIDENCE_MISSING");

  const findingEvidence = uniqueSorted(finding?.evidence_refs);
  const findingSources = uniqueSorted(finding?.source_lineage_refs);
  if (finding && findingEvidence.length === 0) verification.add("FINDING_EVIDENCE_MISSING");
  if (finding && findingSources.length === 0) verification.add("FINDING_SOURCE_LINEAGE_MISSING");

  if (finding && !finding.affected_canonical_ids.includes(candidateId)) {
    verification.add("TARGET_LINK_MISMATCH");
  }
  if (
    finding
      && linkEvidence.length > 0
      && (!intersects(linkEvidence, [...findingEvidence, ...findingSources])
        || !intersects(linkEvidence, [...candidateEvidence, ...candidateSources]))
  ) {
    verification.add("TARGET_LINK_EVIDENCE_NOT_SHARED");
  }

  const sourceObservedAt = timestamp(finding?.observed_at);
  const firstSeen = timestamp(finding?.first_seen);
  if (finding && !sourceObservedAt) blocking.add("FINDING_OBSERVED_AT_INVALID");
  if (finding?.first_seen != null && !firstSeen) blocking.add("FINDING_FIRST_SEEN_INVALID");
  if (firstSeen && sourceObservedAt && Date.parse(firstSeen) > Date.parse(sourceObservedAt)) {
    blocking.add("FINDING_TEMPORAL_ORDER_INVALID");
  }

  let findingAgeMs: number | null = null;
  if (reviewedAt && sourceObservedAt) {
    findingAgeMs = Date.parse(reviewedAt) - Date.parse(sourceObservedAt);
    if (findingAgeMs < 0) blocking.add("FINDING_IN_FUTURE");
    else if (maximumAgeValid && findingAgeMs > input.maximumFindingAgeMs) verification.add("FINDING_STALE");
  }

  if (finding && finding.severity !== "INFO" && finding.review_required !== true) {
    verification.add("FINDING_REVIEW_FLAG_INVARIANT_FAILED");
  }
  if (finding && finding.severity === "BLOCKING" && finding.direct_evidence !== true) {
    verification.add("FINDING_DIRECT_EVIDENCE_REQUIRED");
  }

  let state: KnowledgeIntegrityPortfolioReviewStateV1;
  let reasonCodes: readonly KnowledgeIntegrityPortfolioReviewReasonV1[];

  if (blocking.size > 0) {
    state = "BLOCKED";
    reasonCodes = Object.freeze([...blocking, ...verification].sort((a, b) => a.localeCompare(b)));
  } else if (verification.size > 0) {
    state = "VERIFY_REQUIRED";
    reasonCodes = Object.freeze([...verification].sort((a, b) => a.localeCompare(b)));
  } else if (!finding || finding.business_impact === "NONE") {
    state = "NO_ACTION";
    reasonCodes = Object.freeze(["FINDING_NOT_DECISION_RELEVANT"] as const);
  } else if (finding.severity === "BLOCKING") {
    state = "REVALIDATE_BEFORE_ACTION";
    reasonCodes = Object.freeze(["BLOCKING_KNOWLEDGE_INTEGRITY_FINDING"] as const);
  } else if (finding.severity === "IMPORTANT") {
    state = "REVALIDATE_BEFORE_ACTION";
    reasonCodes = Object.freeze(["IMPORTANT_KNOWLEDGE_INTEGRITY_FINDING"] as const);
  } else if (finding.severity === "REVIEW") {
    state = "REVIEW_REQUIRED";
    reasonCodes = Object.freeze(["KNOWLEDGE_INTEGRITY_REVIEW_REQUIRED"] as const);
  } else {
    state = "NO_ACTION";
    reasonCodes = Object.freeze(["INFORMATIONAL_FINDING_ONLY"] as const);
  }

  const nextInternalStep = state === "REVALIDATE_BEFORE_ACTION"
    ? "REVALIDATE_CANONICAL_CANDIDATE_BEFORE_ACTION"
    : state === "REVIEW_REQUIRED"
      ? "REVIEW_KNOWLEDGE_INTEGRITY_IMPACT"
      : state === "VERIFY_REQUIRED"
        ? "VERIFY_KNOWLEDGE_INTEGRITY_EVIDENCE"
        : null;

  return freezeDeep({
    findingId,
    findingType: finding?.finding_type ?? null,
    findingSeverity: finding?.severity ?? null,
    candidateId,
    previousDisposition: candidate?.disposition ?? null,
    state,
    reasonCodes,
    sourceObservedAt,
    findingAgeMs,
    evidenceRefs: uniqueSorted([...linkEvidence, ...findingEvidence, ...candidateEvidence]),
    sourceRefs: uniqueSorted([...findingSources, ...candidateSources]),
    nextInternalStep,
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    causalInterpretation: "NOT_ESTABLISHED"
  });
}

export function reviewKnowledgeIntegrityForPortfolioV1(
  input: KnowledgeIntegrityPortfolioReviewInputV1
): KnowledgeIntegrityPortfolioReviewV1 {
  const reviewedAt = timestamp(input?.reviewedAt);
  const maximumAgeValid = Number.isFinite(input?.maximumFindingAgeMs)
    && input.maximumFindingAgeMs > 0
    && input.maximumFindingAgeMs <= MAX_FINDING_AGE_MS;

  const findings = Array.isArray(input?.findings) ? input.findings.slice(0, MAX_FINDINGS) : [];
  const targetLinks = Array.isArray(input?.targetLinks) ? input.targetLinks.slice(0, MAX_FINDINGS) : [];
  const findingCounts = new Map<string, number>();
  for (const finding of findings) {
    const id = text(finding?.finding_id) ?? "unknown-finding";
    findingCounts.set(id, (findingCounts.get(id) ?? 0) + 1);
  }
  const duplicateFindingIds = new Set(
    [...findingCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  );

  const linkCounts = new Map<string, number>();
  for (const link of targetLinks) {
    const key = `${text(link?.findingId) ?? "unknown-finding"}\u0000${text(link?.candidateId) ?? "unknown-candidate"}`;
    linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
  }
  const duplicateLinkKeys = new Set(
    [...linkCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key)
  );

  const normalizedInput: KnowledgeIntegrityPortfolioReviewInputV1 = {
    ...input,
    findings,
    targetLinks
  };
  const items = targetLinks
    .map((link) => item(normalizedInput, link, duplicateFindingIds, duplicateLinkKeys, reviewedAt, maximumAgeValid))
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId) || a.findingId.localeCompare(b.findingId));

  const generatedAt = reviewedAt ?? input?.reviewedAt ?? "INVALID";
  const sourcePortfolioId = text(input?.portfolio?.portfolioId) ?? "unknown-portfolio";

  return freezeDeep({
    contractVersion: KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_VERSION_V1,
    policyVersion: KNOWLEDGE_INTEGRITY_PORTFOLIO_REVIEW_POLICY_VERSION_V1,
    reviewId: stableReviewId([
      sourcePortfolioId,
      generatedAt,
      ...items.map((reviewItem) => `${reviewItem.findingId}:${reviewItem.candidateId}:${reviewItem.state}`)
    ]),
    generatedAt,
    sourcePortfolioId,
    items,
    summary: {
      linkedFindings: items.length,
      revalidateBeforeAction: items.filter((reviewItem) => reviewItem.state === "REVALIDATE_BEFORE_ACTION").length,
      reviewRequired: items.filter((reviewItem) => reviewItem.state === "REVIEW_REQUIRED").length,
      verifyRequired: items.filter((reviewItem) => reviewItem.state === "VERIFY_REQUIRED").length,
      noAction: items.filter((reviewItem) => reviewItem.state === "NO_ACTION").length,
      blocked: items.filter((reviewItem) => reviewItem.state === "BLOCKED").length
    },
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
