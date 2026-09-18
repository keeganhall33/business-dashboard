export const AI_SEARCH_SYSTEMS_V1 = ["CHATGPT", "GEMINI", "PERPLEXITY", "COPILOT"] as const;
export type AISearchSystemV1 = (typeof AI_SEARCH_SYSTEMS_V1)[number];

export const AI_SEARCH_QUERY_FAMILIES_V1 = [
  "CATEGORY_BEST_OF",
  "DISCOVERY_WHO",
  "TECHNIQUE_HOW",
  "HISTORY_AUTHORITY",
  "COLLECTING_VALUE",
  "SUBJECT_SPECIFIC",
  "COMPARISON",
  "LOCAL_REGIONAL"
] as const;
export type AISearchQueryFamilyV1 = (typeof AI_SEARCH_QUERY_FAMILIES_V1)[number];

export type AISearchAccessStateV1 = "OBSERVED" | "UNAVAILABLE" | "NOT_RUN";
export type AISearchMentionStateV1 = "PRESENT" | "ABSENT" | "UNKNOWN";
export type AISearchPositionClassV1 = "FIRST_MENTION" | "TOP_3_MENTION" | "OTHER_MENTION" | "NOT_APPLICABLE" | "UNKNOWN";
export type AISearchCitationStateV1 = "CITED" | "NOT_CITED" | "NOT_APPLICABLE" | "UNKNOWN";
export type AISearchEntityAccuracyV1 = "ACCURATE" | "PARTIAL" | "CONFLICTED" | "NOT_APPLICABLE" | "UNKNOWN";
export type AISearchCompetitorContextStateV1 = "OBSERVED" | "NONE_OBSERVED" | "UNKNOWN";
export type AISearchFreshnessV1 = "FRESH" | "STALE";

export type AISearchCompetitorEntityInputV1 = {
  name: string;
  evidenceRefs?: readonly string[];
};

export type AISearchObservationInputV1 = {
  observationId: string;
  queryId: string;
  queryText: string;
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  observedAt: string;
  accessState: AISearchAccessStateV1;
  mentionState?: AISearchMentionStateV1;
  positionClass?: AISearchPositionClassV1;
  citationState?: AISearchCitationStateV1;
  entityAccuracy?: AISearchEntityAccuracyV1;
  citationUrls?: readonly string[];
  competitorContextState?: AISearchCompetitorContextStateV1;
  competitorEntities?: readonly AISearchCompetitorEntityInputV1[];
  evidenceRefs?: readonly string[];
  limitations?: readonly string[];
};

export type CanonicalAISearchCompetitorEntityV1 = {
  name: string;
  evidenceRefs: readonly string[];
};

export type CanonicalAISearchObservationV1 = {
  observationId: string;
  queryId: string;
  queryText: string;
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  observedAt: string;
  accessState: AISearchAccessStateV1;
  mentionState: AISearchMentionStateV1;
  positionClass: AISearchPositionClassV1;
  citationState: AISearchCitationStateV1;
  entityAccuracy: AISearchEntityAccuracyV1;
  citationUrls: readonly string[];
  competitorContextState: AISearchCompetitorContextStateV1;
  competitorEntities: readonly CanonicalAISearchCompetitorEntityV1[];
  freshness: AISearchFreshnessV1;
  evidenceRefs: readonly string[];
  limitations: readonly string[];
};

export type AISearchObservationConflictV1 = {
  kind: "OBSERVATION_ID_CONFLICT" | "RUN_CONFLICT";
  conflictKey: string;
  observationIds: readonly string[];
  evidenceRefs: readonly string[];
  reason: string;
};

export type AISearchVerificationReasonV1 =
  | "STALE_OBSERVATION"
  | "ACCESS_UNAVAILABLE"
  | "OBSERVED_RESULT_UNKNOWN"
  | "CITATION_STATE_UNKNOWN"
  | "ENTITY_ACCURACY_PARTIAL"
  | "ENTITY_ACCURACY_CONFLICTED"
  | "COMPETITOR_CONTEXT_UNKNOWN";

export type AISearchVerificationItemV1 = {
  observationId: string;
  reasons: readonly AISearchVerificationReasonV1[];
};

export type AISearchSegmentSummaryV1 = {
  queryFamily: AISearchQueryFamilyV1;
  system: AISearchSystemV1;
  observationCount: number;
  freshObservedCount: number;
  staleObservedCount: number;
  accessUnavailableCount: number;
  notRunCount: number;
  mentionPresentCount: number;
  mentionAbsentCount: number;
  mentionUnknownCount: number;
  citedMentionCount: number;
  uncitedMentionCount: number;
  citationUnknownCount: number;
  accurateEntityMentionCount: number;
  entityIssueCount: number;
  competitorEntitiesObserved: readonly CanonicalAISearchCompetitorEntityV1[];
};

export type AISearchAuthorityBaselineV1 = {
  contractVersion: "AISearchAuthorityBaselineV1";
  generatedAt: string;
  staleAfterDays: number;
  observations: readonly CanonicalAISearchObservationV1[];
  duplicateObservationIdsSuppressed: readonly string[];
  conflicts: readonly AISearchObservationConflictV1[];
  summaries: readonly AISearchSegmentSummaryV1[];
  verificationQueue: readonly AISearchVerificationItemV1[];
  externalAccessPerformed: false;
  writesPerformed: false;
  publicPublishingPerformed: false;
};

const MAX_OBSERVATIONS = 500;
const MAX_QUERY_TEXT_LENGTH = 500;
const MAX_ID_LENGTH = 160;
const MAX_EVIDENCE_REFS = 50;
const MAX_LIMITATIONS = 30;
const MAX_CITATIONS = 20;
const MAX_COMPETITORS = 30;
const MAX_TEXT_ITEM_LENGTH = 500;

const FORBIDDEN_CREDENTIAL_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "apikey",
  "clientsecret",
  "password",
  "cookie",
  "authorizationheader",
  "bearertoken",
  "secret"
]);

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

function boundedText(value: string, field: string, maxLength = MAX_TEXT_ITEM_LENGTH): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
  return normalized;
}

function uniqueBounded(values: readonly string[] | undefined, field: string, maxItems: number): string[] {
  const normalized = [...new Set((values ?? []).map((value) => boundedText(value, field)))].sort((left, right) => left.localeCompare(right));
  if (normalized.length > maxItems) throw new Error(`${field} exceeds ${maxItems} items`);
  return normalized;
}

function rejectCredentialMaterial(value: unknown, path = "input", seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialMaterial(child, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(object)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
      throw new Error(`${path}.${key} contains credential material; AI-search evidence contracts must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function normalizeUrl(value: string, field: string): string {
  const normalized = boundedText(value, field, 2_000);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${field} must be an absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${field} must be an HTTP(S) URL`);
  if (parsed.username || parsed.password) throw new Error(`${field} must not contain embedded credentials`);
  const sensitiveParams = ["access_token", "token", "api_key", "apikey", "signature", "secret"];
  for (const key of sensitiveParams) {
    if (parsed.searchParams.has(key)) throw new Error(`${field} must not contain credential query parameters`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function normalizeCompetitors(
  input: readonly AISearchCompetitorEntityInputV1[] | undefined,
  field: string
): CanonicalAISearchCompetitorEntityV1[] {
  if ((input?.length ?? 0) > MAX_COMPETITORS) throw new Error(`${field} exceeds ${MAX_COMPETITORS} competitors`);
  const byName = new Map<string, CanonicalAISearchCompetitorEntityV1>();
  for (const [index, competitor] of (input ?? []).entries()) {
    const name = boundedText(competitor.name, `${field}[${index}].name`, 200);
    const key = name.toLocaleLowerCase("en-US");
    const evidenceRefs = uniqueBounded(competitor.evidenceRefs, `${field}[${index}].evidenceRefs`, MAX_EVIDENCE_REFS);
    const prior = byName.get(key);
    if (prior) {
      byName.set(key, freeze({
        name: prior.name.localeCompare(name) <= 0 ? prior.name : name,
        evidenceRefs: uniqueBounded([...prior.evidenceRefs, ...evidenceRefs], `${field}[${index}].evidenceRefs`, MAX_EVIDENCE_REFS)
      }));
    } else {
      byName.set(key, freeze({ name, evidenceRefs }));
    }
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeObservation(
  input: AISearchObservationInputV1,
  nowMs: number,
  staleAfterDays: number
): CanonicalAISearchObservationV1 {
  rejectCredentialMaterial(input);
  if (!AI_SEARCH_SYSTEMS_V1.includes(input.system)) throw new Error(`unsupported AI search system: ${String(input.system)}`);
  if (!AI_SEARCH_QUERY_FAMILIES_V1.includes(input.queryFamily)) throw new Error(`unsupported AI search query family: ${String(input.queryFamily)}`);

  const observationId = boundedText(input.observationId, "observationId", MAX_ID_LENGTH);
  const queryId = boundedText(input.queryId, `${observationId}.queryId`, MAX_ID_LENGTH);
  const queryText = boundedText(input.queryText, `${observationId}.queryText`, MAX_QUERY_TEXT_LENGTH);
  const observedAt = requireIso(input.observedAt, `${observationId}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`${observationId}.observedAt cannot be in the future`);

  const evidenceRefs = uniqueBounded(input.evidenceRefs, `${observationId}.evidenceRefs`, MAX_EVIDENCE_REFS);
  const limitations = uniqueBounded(input.limitations, `${observationId}.limitations`, MAX_LIMITATIONS);
  const citationUrls = uniqueBounded(input.citationUrls, `${observationId}.citationUrls`, MAX_CITATIONS).map((url, index) =>
    normalizeUrl(url, `${observationId}.citationUrls[${index}]`)
  );
  const competitorEntities = normalizeCompetitors(input.competitorEntities, `${observationId}.competitorEntities`);

  let mentionState: AISearchMentionStateV1 = input.mentionState ?? "UNKNOWN";
  let positionClass: AISearchPositionClassV1 = input.positionClass ?? "UNKNOWN";
  let citationState: AISearchCitationStateV1 = input.citationState ?? "UNKNOWN";
  let entityAccuracy: AISearchEntityAccuracyV1 = input.entityAccuracy ?? "UNKNOWN";
  let competitorContextState: AISearchCompetitorContextStateV1 = input.competitorContextState ?? "UNKNOWN";

  if (input.accessState !== "OBSERVED") {
    if (citationUrls.length || competitorEntities.length) throw new Error(`${observationId} cannot carry answer citations or competitor observations without observed access`);
    const suppliedSpecificState =
      (input.mentionState != null && input.mentionState !== "UNKNOWN") ||
      (input.positionClass != null && input.positionClass !== "UNKNOWN") ||
      (input.citationState != null && input.citationState !== "UNKNOWN") ||
      (input.entityAccuracy != null && input.entityAccuracy !== "UNKNOWN") ||
      (input.competitorContextState != null && input.competitorContextState !== "UNKNOWN");
    if (suppliedSpecificState) throw new Error(`${observationId} cannot claim answer state when access was ${input.accessState}`);
    mentionState = "UNKNOWN";
    positionClass = "UNKNOWN";
    citationState = "UNKNOWN";
    entityAccuracy = "UNKNOWN";
    competitorContextState = "UNKNOWN";
  } else {
    if (!evidenceRefs.length) throw new Error(`${observationId} observed access requires provenance evidence`);

    if (mentionState === "ABSENT") {
      if (input.positionClass != null && input.positionClass !== "NOT_APPLICABLE") throw new Error(`${observationId} absent mention cannot have a position class`);
      if (input.citationState != null && input.citationState !== "NOT_APPLICABLE") throw new Error(`${observationId} absent mention cannot claim Keegan citation state`);
      if (input.entityAccuracy != null && input.entityAccuracy !== "NOT_APPLICABLE") throw new Error(`${observationId} absent mention cannot claim Keegan entity accuracy`);
      if (citationUrls.length) throw new Error(`${observationId} absent mention cannot carry Keegan citation URLs`);
      positionClass = "NOT_APPLICABLE";
      citationState = "NOT_APPLICABLE";
      entityAccuracy = "NOT_APPLICABLE";
    } else if (mentionState === "UNKNOWN") {
      if (citationUrls.length) throw new Error(`${observationId} unknown mention state cannot carry Keegan citation URLs`);
      const invalidState =
        (input.positionClass != null && input.positionClass !== "UNKNOWN") ||
        (input.citationState != null && input.citationState !== "UNKNOWN") ||
        (input.entityAccuracy != null && input.entityAccuracy !== "UNKNOWN");
      if (invalidState) throw new Error(`${observationId} unknown mention state cannot claim position, citation, or entity accuracy`);
      positionClass = "UNKNOWN";
      citationState = "UNKNOWN";
      entityAccuracy = "UNKNOWN";
    } else {
      if (positionClass === "NOT_APPLICABLE") throw new Error(`${observationId} present mention requires an observed or UNKNOWN position class`);
      if (citationState === "NOT_APPLICABLE") throw new Error(`${observationId} present mention requires CITED, NOT_CITED, or UNKNOWN citation state`);
      if (entityAccuracy === "NOT_APPLICABLE") throw new Error(`${observationId} present mention requires observed or UNKNOWN entity accuracy`);
      if (citationState === "CITED" && !citationUrls.length) throw new Error(`${observationId} CITED state requires at least one citation URL`);
      if (citationState !== "CITED" && citationUrls.length) throw new Error(`${observationId} citation URLs require CITED state`);
    }

    if (competitorContextState === "NONE_OBSERVED" && competitorEntities.length) {
      throw new Error(`${observationId} NONE_OBSERVED competitor context cannot include competitors`);
    }
    if (competitorContextState === "UNKNOWN" && competitorEntities.length) {
      throw new Error(`${observationId} competitor entities require OBSERVED competitor context`);
    }
    if (competitorContextState === "OBSERVED" && competitorEntities.some((competitor) => !competitor.evidenceRefs.length)) {
      throw new Error(`${observationId} observed competitor entities require provenance evidence`);
    }
  }

  const freshness: AISearchFreshnessV1 = nowMs - observedAtMs > staleAfterDays * 24 * 60 * 60 * 1_000 ? "STALE" : "FRESH";

  return freeze({
    observationId,
    queryId,
    queryText,
    queryFamily: input.queryFamily,
    system: input.system,
    observedAt,
    accessState: input.accessState,
    mentionState,
    positionClass,
    citationState,
    entityAccuracy,
    citationUrls,
    competitorContextState,
    competitorEntities,
    freshness,
    evidenceRefs,
    limitations
  });
}

function semanticFingerprint(observation: CanonicalAISearchObservationV1): string {
  return JSON.stringify({
    queryId: observation.queryId,
    queryText: observation.queryText,
    queryFamily: observation.queryFamily,
    system: observation.system,
    observedAt: observation.observedAt,
    accessState: observation.accessState,
    mentionState: observation.mentionState,
    positionClass: observation.positionClass,
    citationState: observation.citationState,
    entityAccuracy: observation.entityAccuracy,
    citationUrls: observation.citationUrls,
    competitorContextState: observation.competitorContextState,
    competitorEntities: observation.competitorEntities,
    freshness: observation.freshness,
    evidenceRefs: observation.evidenceRefs,
    limitations: observation.limitations
  });
}

function runKey(observation: CanonicalAISearchObservationV1): string {
  return `${observation.system}|${observation.queryId}|${observation.observedAt}`;
}

function conflictFrom(
  kind: AISearchObservationConflictV1["kind"],
  conflictKey: string,
  observations: readonly CanonicalAISearchObservationV1[],
  reason: string
): AISearchObservationConflictV1 {
  return freeze({
    kind,
    conflictKey,
    observationIds: [...new Set(observations.map((observation) => observation.observationId))].sort((left, right) => left.localeCompare(right)),
    evidenceRefs: uniqueBounded(observations.flatMap((observation) => observation.evidenceRefs), `${conflictKey}.evidenceRefs`, MAX_EVIDENCE_REFS),
    reason
  });
}

function competitorSummary(observations: readonly CanonicalAISearchObservationV1[]): CanonicalAISearchCompetitorEntityV1[] {
  const merged = new Map<string, CanonicalAISearchCompetitorEntityV1>();
  for (const observation of observations) {
    if (observation.competitorContextState !== "OBSERVED") continue;
    for (const competitor of observation.competitorEntities) {
      const key = competitor.name.toLocaleLowerCase("en-US");
      const prior = merged.get(key);
      merged.set(key, freeze({
        name: prior && prior.name.localeCompare(competitor.name) <= 0 ? prior.name : competitor.name,
        evidenceRefs: uniqueBounded([...(prior?.evidenceRefs ?? []), ...competitor.evidenceRefs], `${observation.observationId}.competitorSummary`, MAX_EVIDENCE_REFS)
      }));
    }
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function summarizeSegment(
  queryFamily: AISearchQueryFamilyV1,
  system: AISearchSystemV1,
  observations: readonly CanonicalAISearchObservationV1[]
): AISearchSegmentSummaryV1 {
  const segment = observations.filter((observation) => observation.queryFamily === queryFamily && observation.system === system);
  return freeze({
    queryFamily,
    system,
    observationCount: segment.length,
    freshObservedCount: segment.filter((observation) => observation.accessState === "OBSERVED" && observation.freshness === "FRESH").length,
    staleObservedCount: segment.filter((observation) => observation.accessState === "OBSERVED" && observation.freshness === "STALE").length,
    accessUnavailableCount: segment.filter((observation) => observation.accessState === "UNAVAILABLE").length,
    notRunCount: segment.filter((observation) => observation.accessState === "NOT_RUN").length,
    mentionPresentCount: segment.filter((observation) => observation.mentionState === "PRESENT").length,
    mentionAbsentCount: segment.filter((observation) => observation.mentionState === "ABSENT").length,
    mentionUnknownCount: segment.filter((observation) => observation.mentionState === "UNKNOWN").length,
    citedMentionCount: segment.filter((observation) => observation.mentionState === "PRESENT" && observation.citationState === "CITED").length,
    uncitedMentionCount: segment.filter((observation) => observation.mentionState === "PRESENT" && observation.citationState === "NOT_CITED").length,
    citationUnknownCount: segment.filter((observation) => observation.mentionState === "PRESENT" && observation.citationState === "UNKNOWN").length,
    accurateEntityMentionCount: segment.filter((observation) => observation.mentionState === "PRESENT" && observation.entityAccuracy === "ACCURATE").length,
    entityIssueCount: segment.filter((observation) => observation.entityAccuracy === "PARTIAL" || observation.entityAccuracy === "CONFLICTED").length,
    competitorEntitiesObserved: competitorSummary(segment)
  });
}

function verificationReasons(observation: CanonicalAISearchObservationV1): AISearchVerificationReasonV1[] {
  const reasons: AISearchVerificationReasonV1[] = [];
  if (observation.freshness === "STALE") reasons.push("STALE_OBSERVATION");
  if (observation.accessState === "UNAVAILABLE") reasons.push("ACCESS_UNAVAILABLE");
  if (observation.accessState === "OBSERVED" && observation.mentionState === "UNKNOWN") reasons.push("OBSERVED_RESULT_UNKNOWN");
  if (observation.mentionState === "PRESENT" && observation.citationState === "UNKNOWN") reasons.push("CITATION_STATE_UNKNOWN");
  if (observation.entityAccuracy === "PARTIAL") reasons.push("ENTITY_ACCURACY_PARTIAL");
  if (observation.entityAccuracy === "CONFLICTED") reasons.push("ENTITY_ACCURACY_CONFLICTED");
  if (observation.accessState === "OBSERVED" && observation.competitorContextState === "UNKNOWN") reasons.push("COMPETITOR_CONTEXT_UNKNOWN");
  return reasons;
}

export function compileAISearchAuthorityBaselineV1(
  inputs: readonly AISearchObservationInputV1[],
  now: string,
  staleAfterDays = 30
): AISearchAuthorityBaselineV1 {
  if (inputs.length > MAX_OBSERVATIONS) throw new Error(`AI-search baseline exceeds ${MAX_OBSERVATIONS} observations`);
  if (!Number.isFinite(staleAfterDays) || staleAfterDays <= 0 || staleAfterDays > 3_650) {
    throw new Error("staleAfterDays must be a finite value between 0 and 3650");
  }
  const generatedAt = requireIso(now, "now");
  const nowMs = Date.parse(generatedAt);
  const normalized = inputs.map((input) => normalizeObservation(input, nowMs, staleAfterDays));

  const conflicts: AISearchObservationConflictV1[] = [];
  const conflictedObservationIds = new Set<string>();
  const byObservationId = new Map<string, CanonicalAISearchObservationV1[]>();
  for (const observation of normalized) {
    const group = byObservationId.get(observation.observationId) ?? [];
    group.push(observation);
    byObservationId.set(observation.observationId, group);
  }

  const idResolved: CanonicalAISearchObservationV1[] = [];
  for (const [observationId, group] of [...byObservationId.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const fingerprints = new Set(group.map(semanticFingerprint));
    if (fingerprints.size > 1) {
      conflicts.push(conflictFrom("OBSERVATION_ID_CONFLICT", observationId, group, "The same observation ID carries materially different evidence; all variants are excluded until reconciled."));
      conflictedObservationIds.add(observationId);
      continue;
    }
    idResolved.push(group[0]);
  }

  const duplicateObservationIdsSuppressed: string[] = [];
  const bySemanticFingerprint = new Map<string, CanonicalAISearchObservationV1[]>();
  for (const observation of idResolved) {
    const fingerprint = semanticFingerprint(observation);
    const group = bySemanticFingerprint.get(fingerprint) ?? [];
    group.push(observation);
    bySemanticFingerprint.set(fingerprint, group);
  }

  const deduped: CanonicalAISearchObservationV1[] = [];
  for (const group of bySemanticFingerprint.values()) {
    const ordered = [...group].sort((left, right) => left.observationId.localeCompare(right.observationId));
    deduped.push(ordered[0]);
    duplicateObservationIdsSuppressed.push(...ordered.slice(1).map((observation) => observation.observationId));
  }

  const byRun = new Map<string, CanonicalAISearchObservationV1[]>();
  for (const observation of deduped) {
    const key = runKey(observation);
    const group = byRun.get(key) ?? [];
    group.push(observation);
    byRun.set(key, group);
  }

  const usable: CanonicalAISearchObservationV1[] = [];
  for (const [key, group] of [...byRun.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (group.length > 1) {
      conflicts.push(conflictFrom("RUN_CONFLICT", key, group, "The same system/query/timestamp has conflicting normalized observations; the run is excluded until reconciled."));
      group.forEach((observation) => conflictedObservationIds.add(observation.observationId));
      continue;
    }
    usable.push(group[0]);
  }

  const observations = usable.sort((left, right) =>
    left.queryFamily.localeCompare(right.queryFamily) ||
    left.system.localeCompare(right.system) ||
    left.queryId.localeCompare(right.queryId) ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.observationId.localeCompare(right.observationId)
  );

  const segmentKeys = new Set(observations.map((observation) => `${observation.queryFamily}|${observation.system}`));
  const summaries = [...segmentKeys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const [queryFamily, system] = key.split("|") as [AISearchQueryFamilyV1, AISearchSystemV1];
      return summarizeSegment(queryFamily, system, observations);
    });

  const verificationQueue = observations
    .map((observation) => freeze({ observationId: observation.observationId, reasons: verificationReasons(observation) }))
    .filter((item) => item.reasons.length > 0)
    .sort((left, right) => left.observationId.localeCompare(right.observationId));

  return freeze({
    contractVersion: "AISearchAuthorityBaselineV1",
    generatedAt,
    staleAfterDays,
    observations,
    duplicateObservationIdsSuppressed: [...new Set(duplicateObservationIdsSuppressed)].sort((left, right) => left.localeCompare(right)),
    conflicts: conflicts.sort((left, right) => left.conflictKey.localeCompare(right.conflictKey) || left.kind.localeCompare(right.kind)),
    summaries,
    verificationQueue,
    externalAccessPerformed: false,
    writesPerformed: false,
    publicPublishingPerformed: false
  });
}
