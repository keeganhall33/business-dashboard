import type {
  CrossEngineExpectedImpactV1,
  CrossEngineSynthesisItemV1,
  CrossEngineSynthesisV1,
} from "@/lib/intelligence/cross-engine-synthesis-v1";
import type {
  DecisionEvidenceStateV1,
  DecisionPortfolioItemV1,
  DecisionPortfolioV1,
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const CROSS_ENGINE_PORTFOLIO_OVERLAY_VERSION_V1 =
  "CrossEnginePortfolioOverlayV1" as const;

export type CrossEnginePortfolioConnectionV1 = Readonly<{
  hypothesisId: string;
  classification: CrossEngineSynthesisItemV1["classification"];
  candidateId: string;
  candidateTitle: string;
  candidateDisposition: DecisionPortfolioItemV1["disposition"];
  candidateRank: number;
  candidateEvidenceState: DecisionEvidenceStateV1;
  supportMode: CrossEngineSynthesisItemV1["supportMode"];
  domains: CrossEngineSynthesisItemV1["domains"];
  connection: string;
  whyItMatters: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  expectedImpact: CrossEngineExpectedImpactV1;
  decisiveUnknowns: readonly string[];
  timingWindow: CrossEngineSynthesisItemV1["timingWindow"];
  nextSafeAction: CrossEngineSynthesisItemV1["nextSafeAction"];
  causalAttribution: "NOT_ESTABLISHED";
  allocationEffect: "NONE_REVIEW_ONLY";
}>;

export type CrossEnginePortfolioOverlayStatusV1 =
  | "LIVE"
  | "NO_MATCHES"
  | "STALE"
  | "UNAVAILABLE";

export type CrossEnginePortfolioOverlayV1 = Readonly<{
  contractVersion: typeof CROSS_ENGINE_PORTFOLIO_OVERLAY_VERSION_V1;
  status: CrossEnginePortfolioOverlayStatusV1;
  evaluatedAt: string;
  portfolioId: string | null;
  portfolioGeneratedAt: string | null;
  synthesisGeneratedAt: string | null;
  connections: readonly CrossEnginePortfolioConnectionV1[];
  unmatchedReadyHypothesisIds: readonly string[];
  withheldHypothesisIds: readonly string[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    portfolioMutationAllowed: false;
    allocationMutationAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
    causalClaimAllowed: false;
    monetaryValueCreationAllowed: false;
  }>;
}>;

export type CrossEnginePortfolioOverlayInputV1 = Readonly<{
  portfolio: DecisionPortfolioV1 | null;
  synthesis: CrossEngineSynthesisV1 | null;
  evaluatedAt: string;
  maxAgeMs?: number;
  maxConnections?: number;
}>;

const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1_000;
const MAX_CONNECTIONS = 20;

const AUTHORITY = Object.freeze({
  portfolioMutationAllowed: false,
  allocationMutationAllowed: false,
  externalActionAllowed: false,
  approvalBypassAllowed: false,
  causalClaimAllowed: false,
  monetaryValueCreationAllowed: false,
} as const);

const LIMITATIONS = Object.freeze([
  "Connected signals are an exact-reference review overlay and do not change portfolio rank, selection, allocation, or ownership.",
  "Cross-domain support does not establish causality; causal attribution remains NOT_ESTABLISHED.",
  "The overlay never invents confidence, monetary value, relationships, access, timing, outcomes, or execution state.",
  "Only READY synthesis items tied to an exact canonical decision reference and a KNOWN portfolio candidate are surfaced.",
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positiveBound(value: number | undefined, fallback: number, max: number, field: string): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function ageBound(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > 30 * 24 * 60 * 60 * 1_000) {
    throw new Error("maxAgeMs must be finite, positive, and no greater than 30 days");
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function emptyOverlay(
  status: Exclude<CrossEnginePortfolioOverlayStatusV1, "LIVE">,
  evaluatedAt: string,
  issues: readonly string[],
  portfolio: DecisionPortfolioV1 | null,
  synthesis: CrossEngineSynthesisV1 | null,
): CrossEnginePortfolioOverlayV1 {
  return deepFreeze({
    contractVersion: CROSS_ENGINE_PORTFOLIO_OVERLAY_VERSION_V1,
    status,
    evaluatedAt,
    portfolioId: portfolio?.portfolioId ?? null,
    portfolioGeneratedAt: portfolio?.generatedAt ?? null,
    synthesisGeneratedAt: synthesis?.generatedAt ?? null,
    connections: [],
    unmatchedReadyHypothesisIds: [],
    withheldHypothesisIds: [],
    issues: unique(issues),
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}

function staleAt(sourceTimestamp: string, evaluatedAtMs: number, maxAgeMs: number): boolean {
  const timestampMs = Date.parse(sourceTimestamp);
  return !Number.isFinite(timestampMs) || timestampMs > evaluatedAtMs || evaluatedAtMs - timestampMs > maxAgeMs;
}

function toConnection(
  item: CrossEngineSynthesisItemV1,
  candidate: DecisionPortfolioItemV1,
): CrossEnginePortfolioConnectionV1 {
  return {
    hypothesisId: item.hypothesisId,
    classification: item.classification,
    candidateId: candidate.candidate.id,
    candidateTitle: candidate.candidate.title,
    candidateDisposition: candidate.disposition,
    candidateRank: candidate.rank,
    candidateEvidenceState: candidate.candidate.evidenceState,
    supportMode: item.supportMode,
    domains: [...item.domains],
    connection: item.connection,
    whyItMatters: item.whyItMatters,
    evidenceRefs: [...item.evidenceRefs],
    sourceRefs: [...item.sourceRefs],
    expectedImpact:
      item.expectedImpact.state === "SUPPORTED"
        ? { ...item.expectedImpact, evidenceRefs: [...item.expectedImpact.evidenceRefs] }
        : {
            state: "UNKNOWN",
            unit: null,
            low: null,
            high: null,
            evidenceRefs: [],
          },
    decisiveUnknowns: [...item.decisiveUnknowns],
    timingWindow: item.timingWindow ? { ...item.timingWindow } : null,
    nextSafeAction: { ...item.nextSafeAction },
    causalAttribution: "NOT_ESTABLISHED",
    allocationEffect: "NONE_REVIEW_ONLY",
  };
}

/**
 * Joins already-qualified cross-engine synthesis to an already-allocated
 * DecisionPortfolioV1 through exact canonical decision references only.
 *
 * The result is deliberately an overlay. It can make a chief-of-staff review
 * more useful, but it cannot change rank, selection, resource allocation,
 * authority, or causal/monetary truth.
 */
export function buildCrossEnginePortfolioOverlayV1(
  input: CrossEnginePortfolioOverlayInputV1,
): CrossEnginePortfolioOverlayV1 {
  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxAgeMs = ageBound(input.maxAgeMs);
  const maxConnections = positiveBound(input.maxConnections, 8, MAX_CONNECTIONS, "maxConnections");
  const { portfolio, synthesis } = input;

  if (!portfolio || !synthesis) {
    const missing = [
      !portfolio ? "DECISION_PORTFOLIO_UNAVAILABLE" : null,
      !synthesis ? "CROSS_ENGINE_SYNTHESIS_UNAVAILABLE" : null,
    ].filter((value): value is string => Boolean(value));
    return emptyOverlay("UNAVAILABLE", evaluatedAt, missing, portfolio, synthesis);
  }

  iso(portfolio.generatedAt, "portfolio.generatedAt");
  iso(synthesis.generatedAt, "synthesis.generatedAt");

  if (
    staleAt(portfolio.generatedAt, evaluatedAtMs, maxAgeMs) ||
    staleAt(synthesis.generatedAt, evaluatedAtMs, maxAgeMs)
  ) {
    return emptyOverlay("STALE", evaluatedAt, ["PORTFOLIO_OR_SYNTHESIS_OUTSIDE_FRESHNESS_BOUND"], portfolio, synthesis);
  }

  if (synthesis.status !== "READY" || synthesis.readyCount === 0) {
    return emptyOverlay("NO_MATCHES", evaluatedAt, ["NO_READY_CROSS_ENGINE_SYNTHESIS"], portfolio, synthesis);
  }

  const portfolioById = new Map(portfolio.items.map((item) => [item.candidate.id, item]));
  const connections: CrossEnginePortfolioConnectionV1[] = [];
  const unmatchedReady = new Set<string>();
  const withheld = new Set<string>();
  const seen = new Set<string>();

  const readyItems = synthesis.items
    .filter((item) => item.status === "READY")
    .sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId));

  for (const item of readyItems) {
    const exactDecisionRefs = unique(item.affectedDecisionRefs);
    if (exactDecisionRefs.length === 0) {
      unmatchedReady.add(item.hypothesisId);
      continue;
    }

    let matchedAny = false;
    for (const decisionRef of exactDecisionRefs) {
      const candidate = portfolioById.get(decisionRef);
      if (!candidate) continue;
      matchedAny = true;

      if (candidate.candidate.evidenceState !== "KNOWN") {
        withheld.add(item.hypothesisId);
        continue;
      }

      const key = `${item.hypothesisId}:${candidate.candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (connections.length < maxConnections) connections.push(toConnection(item, candidate));
    }

    if (!matchedAny) unmatchedReady.add(item.hypothesisId);
  }

  connections.sort(
    (left, right) =>
      left.candidateRank - right.candidateRank ||
      left.candidateId.localeCompare(right.candidateId) ||
      left.hypothesisId.localeCompare(right.hypothesisId),
  );

  return deepFreeze({
    contractVersion: CROSS_ENGINE_PORTFOLIO_OVERLAY_VERSION_V1,
    status: connections.length > 0 ? "LIVE" : "NO_MATCHES",
    evaluatedAt,
    portfolioId: portfolio.portfolioId,
    portfolioGeneratedAt: portfolio.generatedAt,
    synthesisGeneratedAt: synthesis.generatedAt,
    connections,
    unmatchedReadyHypothesisIds: [...unmatchedReady].sort((a, b) => a.localeCompare(b)),
    withheldHypothesisIds: [...withheld].sort((a, b) => a.localeCompare(b)),
    issues: connections.length > 0 ? [] : ["NO_EXACT_DECISION_GRADE_PORTFOLIO_MATCH"],
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}
