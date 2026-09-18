import type {
  AISearchAuthorityBaselineV1,
  AISearchQueryFamilyV1,
  AISearchSystemV1,
  CanonicalAISearchObservationV1
} from "./ai-search-authority-baseline-v1";

export const AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION = "AISearchAuthorityScorecardV1" as const;

export type AISearchAuthorityScorecardStatusV1 = "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";

export type AISearchVisibilityMetricsV1 = Readonly<{
  freshObservedCount: number;
  knownMentionDenominator: number;
  mentionPresentCount: number;
  mentionAbsentCount: number;
  mentionUnknownCount: number;
  mentionRate: number | null;
  knownPositionDenominator: number;
  firstMentionCount: number;
  firstOrTop3MentionCount: number;
  firstMentionRate: number | null;
  firstOrTop3MentionRate: number | null;
  knownCitationDenominator: number;
  citedMentionCount: number;
  uncitedMentionCount: number;
  citationUnknownCount: number;
  citationRate: number | null;
  knownEntityAccuracyDenominator: number;
  accurateEntityMentionCount: number;
  entityIssueCount: number;
  entityAccuracyUnknownCount: number;
  accurateEntityRate: number | null;
}>;

export type AISearchAuthoritySegmentV1 = AISearchVisibilityMetricsV1 & Readonly<{
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  coverageState: "DECISION_GRADE" | "PARTIAL" | "NO_FRESH_OBSERVATION";
}>;

export type AISearchObservedAuthorityGapKindV1 =
  | "OBSERVED_ABSENCE"
  | "CITATION_GAP"
  | "ENTITY_ACCURACY_GAP";

export type AISearchObservedAuthorityGapV1 = Readonly<{
  gapId: string;
  kind: AISearchObservedAuthorityGapKindV1;
  observationId: string;
  queryId: string;
  queryText: string;
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  observedAt: string;
  evidenceRefs: readonly string[];
  observedCompetitorNames: readonly string[];
  causalClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
}>;

export type AISearchMeasurementGapKindV1 =
  | "STALE_OBSERVATION"
  | "ACCESS_UNAVAILABLE"
  | "NOT_RUN"
  | "OBSERVED_RESULT_UNKNOWN"
  | "POSITION_UNKNOWN"
  | "CITATION_STATE_UNKNOWN"
  | "ENTITY_ACCURACY_UNKNOWN"
  | "COMPETITOR_CONTEXT_UNKNOWN";

export type AISearchMeasurementGapV1 = Readonly<{
  gapId: string;
  kind: AISearchMeasurementGapKindV1;
  observationId: string;
  queryId: string;
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  observedAt: string;
  evidenceRefs: readonly string[];
  limitations: readonly string[];
}>;

export type AISearchCitationDomainObservationV1 = Readonly<{
  domain: string;
  citedObservationCount: number;
  distinctQueryCount: number;
  systems: readonly AISearchSystemV1[];
  sourceUrls: readonly string[];
  evidenceRefs: readonly string[];
  sourceAuthorityClaim: false;
  sourceIndependenceClaim: false;
  causalClaim: false;
}>;

export type AISearchObservedCompetitorContextV1 = Readonly<{
  name: string;
  observationCount: number;
  distinctQueryCount: number;
  systems: readonly AISearchSystemV1[];
  evidenceRefs: readonly string[];
  performanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  authorityClaim: false;
}>;

export type AISearchAuthorityCoverageV1 = Readonly<{
  baselineGeneratedAt: string;
  evaluatedAt: string;
  baselineObservationCount: number;
  freshObservedCount: number;
  staleObservedCount: number;
  unavailableCount: number;
  notRunCount: number;
  conflictCount: number;
}>;

export type AISearchAuthorityScorecardV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION;
  status: AISearchAuthorityScorecardStatusV1;
  coverage: AISearchAuthorityCoverageV1;
  overall: AISearchVisibilityMetricsV1;
  segments: readonly AISearchAuthoritySegmentV1[];
  observedAuthorityGaps: readonly AISearchObservedAuthorityGapV1[];
  measurementGaps: readonly AISearchMeasurementGapV1[];
  citationDomains: readonly AISearchCitationDomainObservationV1[];
  observedCompetitorContext: readonly AISearchObservedCompetitorContextV1[];
  guardrails: readonly string[];
  syntheticScoreProduced: false;
  deterministicRankProduced: false;
  causalAttributionClaimed: false;
  competitorPerformanceInferred: false;
  endorsementInferred: false;
  relationshipInferred: false;
  monetaryValue: null;
  externalAccessPerformed: false;
  writesPerformed: false;
  publicPublishingPerformed: false;
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function isFreshAt(
  observation: CanonicalAISearchObservationV1,
  evaluatedAtMs: number,
  staleAfterDays: number
): boolean {
  return evaluatedAtMs - Date.parse(observation.observedAt) <= staleAfterDays * 86_400_000;
}

function visibilityMetrics(observations: readonly CanonicalAISearchObservationV1[]): AISearchVisibilityMetricsV1 {
  const mentionPresent = observations.filter((observation) => observation.mentionState === "PRESENT");
  const mentionAbsent = observations.filter((observation) => observation.mentionState === "ABSENT");
  const mentionUnknown = observations.filter((observation) => observation.mentionState === "UNKNOWN");
  const knownPositions = mentionPresent.filter((observation) => observation.positionClass !== "UNKNOWN");
  const firstMentionCount = knownPositions.filter((observation) => observation.positionClass === "FIRST_MENTION").length;
  const firstOrTop3MentionCount = knownPositions.filter(
    (observation) => observation.positionClass === "FIRST_MENTION" || observation.positionClass === "TOP_3_MENTION"
  ).length;
  const knownCitations = mentionPresent.filter((observation) => observation.citationState !== "UNKNOWN");
  const citedMentionCount = knownCitations.filter((observation) => observation.citationState === "CITED").length;
  const uncitedMentionCount = knownCitations.filter((observation) => observation.citationState === "NOT_CITED").length;
  const knownEntityAccuracy = mentionPresent.filter((observation) => observation.entityAccuracy !== "UNKNOWN");
  const accurateEntityMentionCount = knownEntityAccuracy.filter((observation) => observation.entityAccuracy === "ACCURATE").length;
  const entityIssueCount = knownEntityAccuracy.filter(
    (observation) => observation.entityAccuracy === "PARTIAL" || observation.entityAccuracy === "CONFLICTED"
  ).length;

  return freeze({
    freshObservedCount: observations.length,
    knownMentionDenominator: mentionPresent.length + mentionAbsent.length,
    mentionPresentCount: mentionPresent.length,
    mentionAbsentCount: mentionAbsent.length,
    mentionUnknownCount: mentionUnknown.length,
    mentionRate: rate(mentionPresent.length, mentionPresent.length + mentionAbsent.length),
    knownPositionDenominator: knownPositions.length,
    firstMentionCount,
    firstOrTop3MentionCount,
    firstMentionRate: rate(firstMentionCount, knownPositions.length),
    firstOrTop3MentionRate: rate(firstOrTop3MentionCount, knownPositions.length),
    knownCitationDenominator: knownCitations.length,
    citedMentionCount,
    uncitedMentionCount,
    citationUnknownCount: mentionPresent.length - knownCitations.length,
    citationRate: rate(citedMentionCount, knownCitations.length),
    knownEntityAccuracyDenominator: knownEntityAccuracy.length,
    accurateEntityMentionCount,
    entityIssueCount,
    entityAccuracyUnknownCount: mentionPresent.length - knownEntityAccuracy.length,
    accurateEntityRate: rate(accurateEntityMentionCount, knownEntityAccuracy.length)
  });
}

function segmentKey(observation: CanonicalAISearchObservationV1): string {
  return `${observation.queryFamily}|${observation.system}`;
}

function compileSegments(
  allObservations: readonly CanonicalAISearchObservationV1[],
  freshObserved: readonly CanonicalAISearchObservationV1[]
): AISearchAuthoritySegmentV1[] {
  const keys = unique(allObservations.map(segmentKey));
  return keys.map((key) => {
    const [queryFamily, system] = key.split("|") as [AISearchQueryFamilyV1, AISearchSystemV1];
    const fresh = freshObserved.filter(
      (observation) => observation.queryFamily === queryFamily && observation.system === system
    );
    const all = allObservations.filter(
      (observation) => observation.queryFamily === queryFamily && observation.system === system
    );
    const metrics = visibilityMetrics(fresh);
    const hasMeasurementGap =
      fresh.some(
        (observation) =>
          observation.mentionState === "UNKNOWN" ||
          (observation.mentionState === "PRESENT" &&
            (observation.positionClass === "UNKNOWN" ||
              observation.citationState === "UNKNOWN" ||
              observation.entityAccuracy === "UNKNOWN" ||
              observation.competitorContextState === "UNKNOWN"))
      ) ||
      all.some((observation) => observation.accessState !== "OBSERVED" || observation.freshness === "STALE");
    const coverageState: AISearchAuthoritySegmentV1["coverageState"] = !fresh.length
      ? "NO_FRESH_OBSERVATION"
      : hasMeasurementGap
        ? "PARTIAL"
        : "DECISION_GRADE";
    return freeze({ queryFamily, system, coverageState, ...metrics });
  });
}

function gapId(prefix: string, observation: CanonicalAISearchObservationV1, kind: string): string {
  return [prefix, observation.system, observation.queryId, observation.observationId, kind]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function competitorNames(observation: CanonicalAISearchObservationV1): string[] {
  if (observation.competitorContextState !== "OBSERVED") return [];
  return unique(observation.competitorEntities.map((competitor) => competitor.name));
}

function authorityGap(
  observation: CanonicalAISearchObservationV1,
  kind: AISearchObservedAuthorityGapKindV1
): AISearchObservedAuthorityGapV1 {
  return freeze({
    gapId: gapId("ai-search-authority-gap", observation, kind),
    kind,
    observationId: observation.observationId,
    queryId: observation.queryId,
    queryText: observation.queryText,
    queryFamily: observation.queryFamily,
    system: observation.system,
    observedAt: observation.observedAt,
    evidenceRefs: unique(observation.evidenceRefs),
    observedCompetitorNames: competitorNames(observation),
    causalClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const
  });
}

function measurementGap(
  observation: CanonicalAISearchObservationV1,
  kind: AISearchMeasurementGapKindV1
): AISearchMeasurementGapV1 {
  return freeze({
    gapId: gapId("ai-search-measurement-gap", observation, kind),
    kind,
    observationId: observation.observationId,
    queryId: observation.queryId,
    queryFamily: observation.queryFamily,
    system: observation.system,
    observedAt: observation.observedAt,
    evidenceRefs: unique(observation.evidenceRefs),
    limitations: unique(observation.limitations)
  });
}

function compileObservedAuthorityGaps(
  freshObserved: readonly CanonicalAISearchObservationV1[]
): AISearchObservedAuthorityGapV1[] {
  const gaps: AISearchObservedAuthorityGapV1[] = [];
  for (const observation of freshObserved) {
    if (observation.mentionState === "ABSENT") gaps.push(authorityGap(observation, "OBSERVED_ABSENCE"));
    if (observation.mentionState === "PRESENT" && observation.citationState === "NOT_CITED") {
      gaps.push(authorityGap(observation, "CITATION_GAP"));
    }
    if (
      observation.mentionState === "PRESENT" &&
      (observation.entityAccuracy === "PARTIAL" || observation.entityAccuracy === "CONFLICTED")
    ) {
      gaps.push(authorityGap(observation, "ENTITY_ACCURACY_GAP"));
    }
  }
  return gaps.sort((left, right) =>
    left.queryFamily.localeCompare(right.queryFamily) ||
    left.system.localeCompare(right.system) ||
    left.queryId.localeCompare(right.queryId) ||
    left.kind.localeCompare(right.kind)
  );
}

function compileMeasurementGaps(
  observations: readonly CanonicalAISearchObservationV1[],
  evaluatedAtMs: number,
  staleAfterDays: number
): AISearchMeasurementGapV1[] {
  const gaps: AISearchMeasurementGapV1[] = [];
  for (const observation of observations) {
    if (observation.accessState === "OBSERVED" && !isFreshAt(observation, evaluatedAtMs, staleAfterDays)) {
      gaps.push(measurementGap(observation, "STALE_OBSERVATION"));
      continue;
    }
    if (observation.accessState === "UNAVAILABLE") {
      gaps.push(measurementGap(observation, "ACCESS_UNAVAILABLE"));
      continue;
    }
    if (observation.accessState === "NOT_RUN") {
      gaps.push(measurementGap(observation, "NOT_RUN"));
      continue;
    }
    if (observation.mentionState === "UNKNOWN") {
      gaps.push(measurementGap(observation, "OBSERVED_RESULT_UNKNOWN"));
      continue;
    }
    if (observation.mentionState !== "PRESENT") continue;
    if (observation.positionClass === "UNKNOWN") gaps.push(measurementGap(observation, "POSITION_UNKNOWN"));
    if (observation.citationState === "UNKNOWN") gaps.push(measurementGap(observation, "CITATION_STATE_UNKNOWN"));
    if (observation.entityAccuracy === "UNKNOWN") gaps.push(measurementGap(observation, "ENTITY_ACCURACY_UNKNOWN"));
    if (observation.competitorContextState === "UNKNOWN") gaps.push(measurementGap(observation, "COMPETITOR_CONTEXT_UNKNOWN"));
  }
  return gaps.sort((left, right) =>
    left.queryFamily.localeCompare(right.queryFamily) ||
    left.system.localeCompare(right.system) ||
    left.queryId.localeCompare(right.queryId) ||
    left.kind.localeCompare(right.kind)
  );
}

function citationDomain(value: string): string {
  const hostname = new URL(value).hostname.toLocaleLowerCase("en-US");
  return hostname.replace(/^www\./, "");
}

function compileCitationDomains(
  freshObserved: readonly CanonicalAISearchObservationV1[]
): AISearchCitationDomainObservationV1[] {
  const groups = new Map<
    string,
    {
      observations: Map<string, CanonicalAISearchObservationV1>;
      queryIds: Set<string>;
      systems: Set<AISearchSystemV1>;
      urls: Set<string>;
      evidenceRefs: Set<string>;
    }
  >();

  for (const observation of freshObserved) {
    if (observation.mentionState !== "PRESENT" || observation.citationState !== "CITED") continue;
    for (const url of observation.citationUrls) {
      const domain = citationDomain(url);
      const group = groups.get(domain) ?? {
        observations: new Map(),
        queryIds: new Set(),
        systems: new Set(),
        urls: new Set(),
        evidenceRefs: new Set()
      };
      group.observations.set(observation.observationId, observation);
      group.queryIds.add(observation.queryId);
      group.systems.add(observation.system);
      group.urls.add(url);
      observation.evidenceRefs.forEach((ref) => group.evidenceRefs.add(ref));
      groups.set(domain, group);
    }
  }

  return [...groups.entries()]
    .map(([domain, group]) => freeze({
      domain,
      citedObservationCount: group.observations.size,
      distinctQueryCount: group.queryIds.size,
      systems: [...group.systems].sort((left, right) => left.localeCompare(right)),
      sourceUrls: [...group.urls].sort((left, right) => left.localeCompare(right)),
      evidenceRefs: [...group.evidenceRefs].sort((left, right) => left.localeCompare(right)),
      sourceAuthorityClaim: false as const,
      sourceIndependenceClaim: false as const,
      causalClaim: false as const
    }))
    .sort((left, right) =>
      right.citedObservationCount - left.citedObservationCount || left.domain.localeCompare(right.domain)
    );
}

function compileObservedCompetitorContext(
  freshObserved: readonly CanonicalAISearchObservationV1[]
): AISearchObservedCompetitorContextV1[] {
  const groups = new Map<
    string,
    {
      name: string;
      observationIds: Set<string>;
      queryIds: Set<string>;
      systems: Set<AISearchSystemV1>;
      evidenceRefs: Set<string>;
    }
  >();

  for (const observation of freshObserved) {
    if (observation.competitorContextState !== "OBSERVED") continue;
    for (const competitor of observation.competitorEntities) {
      const key = competitor.name.toLocaleLowerCase("en-US");
      const group = groups.get(key) ?? {
        name: competitor.name,
        observationIds: new Set(),
        queryIds: new Set(),
        systems: new Set(),
        evidenceRefs: new Set()
      };
      if (competitor.name.localeCompare(group.name) < 0) group.name = competitor.name;
      group.observationIds.add(observation.observationId);
      group.queryIds.add(observation.queryId);
      group.systems.add(observation.system);
      competitor.evidenceRefs.forEach((ref) => group.evidenceRefs.add(ref));
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group) => freeze({
      name: group.name,
      observationCount: group.observationIds.size,
      distinctQueryCount: group.queryIds.size,
      systems: [...group.systems].sort((left, right) => left.localeCompare(right)),
      evidenceRefs: [...group.evidenceRefs].sort((left, right) => left.localeCompare(right)),
      performanceClaim: false as const,
      endorsementClaim: false as const,
      relationshipClaim: false as const,
      authorityClaim: false as const
    }))
    .sort((left, right) =>
      right.observationCount - left.observationCount || left.name.localeCompare(right.name)
    );
}

export function compileAISearchAuthorityScorecardV1(
  baseline: AISearchAuthorityBaselineV1,
  evaluatedAtInput: string
): AISearchAuthorityScorecardV1 {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) throw new Error("baseline must be an object");
  if (baseline.contractVersion !== "AISearchAuthorityBaselineV1") {
    throw new Error("baseline must be AISearchAuthorityBaselineV1");
  }
  const evaluatedAt = requireIso(evaluatedAtInput, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const baselineGeneratedAt = requireIso(baseline.generatedAt, "baseline.generatedAt");
  if (evaluatedAtMs < Date.parse(baselineGeneratedAt)) {
    throw new Error("evaluatedAt cannot precede baseline.generatedAt");
  }
  if (!Number.isFinite(baseline.staleAfterDays) || baseline.staleAfterDays <= 0) {
    throw new Error("baseline.staleAfterDays must be a finite positive number");
  }

  const freshObserved = baseline.observations.filter(
    (observation) =>
      observation.accessState === "OBSERVED" && isFreshAt(observation, evaluatedAtMs, baseline.staleAfterDays)
  );
  const staleObservedCount = baseline.observations.filter(
    (observation) =>
      observation.accessState === "OBSERVED" && !isFreshAt(observation, evaluatedAtMs, baseline.staleAfterDays)
  ).length;
  const unavailableCount = baseline.observations.filter((observation) => observation.accessState === "UNAVAILABLE").length;
  const notRunCount = baseline.observations.filter((observation) => observation.accessState === "NOT_RUN").length;

  const measurementGaps = freeze(
    compileMeasurementGaps(baseline.observations, evaluatedAtMs, baseline.staleAfterDays)
  );
  const observedAuthorityGaps = freeze(compileObservedAuthorityGaps(freshObserved));
  const overall = visibilityMetrics(freshObserved);
  const segments = freeze(compileSegments(baseline.observations, freshObserved));
  const citationDomains = freeze(compileCitationDomains(freshObserved));
  const observedCompetitorContext = freeze(compileObservedCompetitorContext(freshObserved));

  const status: AISearchAuthorityScorecardStatusV1 = !freshObserved.length
    ? "INSUFFICIENT_EVIDENCE"
    : measurementGaps.length || baseline.conflicts.length
      ? "PARTIAL"
      : "READY";

  return freeze({
    contractVersion: AI_SEARCH_AUTHORITY_SCORECARD_V1_VERSION,
    status,
    coverage: freeze({
      baselineGeneratedAt,
      evaluatedAt,
      baselineObservationCount: baseline.observations.length,
      freshObservedCount: freshObserved.length,
      staleObservedCount,
      unavailableCount,
      notRunCount,
      conflictCount: baseline.conflicts.length
    }),
    overall,
    segments,
    observedAuthorityGaps,
    measurementGaps,
    citationDomains,
    observedCompetitorContext,
    guardrails: freeze([
      "Rates use only fresh observed runs and always expose their known-result denominator; unavailable, not-run, stale, and UNKNOWN results never become observed absence.",
      "Observed competitor names and citation domains describe only what appeared in bounded evidence. They do not establish competitor performance, authority, endorsement, relationship, source independence, or causality.",
      "The scorecard produces no synthetic authority score or deterministic cross-engine rank. AI answers are variable observations, not a stable leaderboard.",
      "Observed absence, missing citation, and entity-accuracy issues are evidence-backed gaps; unresolved measurement states remain measurement gaps instead of being converted into negative evidence.",
      "This contract performs no external queries, writes, publishing, outreach, spend, or account mutation."
    ]),
    syntheticScoreProduced: false,
    deterministicRankProduced: false,
    causalAttributionClaimed: false,
    competitorPerformanceInferred: false,
    endorsementInferred: false,
    relationshipInferred: false,
    monetaryValue: null,
    externalAccessPerformed: false,
    writesPerformed: false,
    publicPublishingPerformed: false
  });
}
