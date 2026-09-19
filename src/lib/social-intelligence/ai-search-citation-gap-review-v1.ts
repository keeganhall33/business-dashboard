import {
  AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationV1,
  type AiSearchEngineV1,
  type AiSearchQueryClassV1
} from "./ai-search-authority-observation-v1";

export const AI_SEARCH_CITATION_GAP_REVIEW_V1_VERSION = "AiSearchCitationGapReviewV1" as const;
export const AI_SEARCH_CITATION_GAP_MAX_PEERS_V1 = 50;
export const AI_SEARCH_CITATION_GAP_MAX_ITEMS_V1 = 200;

export type AiSearchCitationGapReviewStatusV1 =
  | "READY_FOR_REVIEW"
  | "NO_OBSERVED_GAP"
  | "VERIFY_REQUIRED";

export type AiSearchCitationGapVerificationCodeV1 =
  | "TARGET_NOT_READY"
  | "PEER_NOT_READY"
  | "TARGET_EVIDENCE_STALE"
  | "PEER_EVIDENCE_STALE"
  | "WINDOW_MISMATCH"
  | "QUERY_UNIVERSE_MISMATCH"
  | "QUERY_CLASS_MISMATCH";

export type AiSearchCitationGapVerificationIssueV1 = Readonly<{
  code: AiSearchCitationGapVerificationCodeV1;
  subjectEntityRef: string | null;
  detail: string;
}>;

export type AiSearchCitationGapPolicyV1 = Readonly<{
  maxEvaluationAgeHours: number;
  minDistinctPeerEntitiesForGap: number;
}>;

export type AiSearchCitationGapPeerInputV1 = Readonly<{
  evaluation: AiSearchAuthorityEvaluationV1;
}>;

export type AiSearchCitationGapReviewInputV1 = Readonly<{
  target: AiSearchAuthorityEvaluationV1;
  peers: readonly AiSearchCitationGapPeerInputV1[];
  policy: AiSearchCitationGapPolicyV1;
  evaluatedAt: string;
}>;

export type AiSearchCitationGapItemV1 = Readonly<{
  sourceRef: string;
  peerEntityRefs: readonly string[];
  queryKeys: readonly string[];
  engines: readonly AiSearchEngineV1[];
  queryClasses: readonly AiSearchQueryClassV1[];
  peerCitationObservationCount: number;
  targetMentionedQueryKeys: readonly string[];
  targetCitationObservedElsewhere: boolean;
  evidenceRefs: readonly string[];
  state: "OBSERVED_PEER_CITATION_GAP";
  statement: string;
  researchCandidate: true;
  rankingClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  attributionClaim: false;
  causalClaim: false;
  confidenceClaim: false;
  monetaryValueClaim: false;
}>;

export type AiSearchCitationGapReviewV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_CITATION_GAP_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: AiSearchCitationGapReviewStatusV1;
  targetEntityRef: string | null;
  peerEntityRefs: readonly string[];
  comparedQueryCount: number;
  items: readonly AiSearchCitationGapItemV1[];
  verificationIssues: readonly AiSearchCitationGapVerificationIssueV1[];
  guardrails: readonly string[];
  publicationAuthority: "NONE";
  outreachAuthority: "NONE";
  seoMutationAuthority: "NONE";
  notificationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

type ValidatedEvaluation = Readonly<{
  entityRef: string | null;
  queryMap: ReadonlyMap<string, AiSearchAuthorityObservationV1>;
  ready: boolean;
  stale: boolean;
  asOf: string;
  windowStartAt: string;
  windowEndAt: string;
}>;

type MutableGap = {
  sourceRef: string;
  peerEntityRefs: Set<string>;
  queryKeys: Set<string>;
  engines: Set<AiSearchEngineV1>;
  queryClasses: Set<AiSearchQueryClassV1>;
  peerCitationObservationKeys: Set<string>;
  targetMentionedQueryKeys: Set<string>;
  evidenceRefs: string[];
};

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function iso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function positiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function queryKey(observation: Pick<AiSearchAuthorityObservationV1, "engine" | "queryRef">): string {
  return `${observation.engine}:${observation.queryRef}`;
}

function isSecretLike(value: string): boolean {
  return /(authorization\s*:|bearer\s+[a-z0-9._~+\/-]+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|session[_-]?token)\s*[=:])/i.test(value);
}

function assertSafeRef(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (isSecretLike(normalized)) throw new Error(`${field} contains credential-like material`);
  return normalized;
}

function assertEvaluationAuthority(evaluation: AiSearchAuthorityEvaluationV1, label: string): void {
  if (evaluation.contractVersion !== AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION) {
    throw new Error(`${label}.contractVersion is not canonical AiSearchAuthorityObservationV1`);
  }
  if (
    evaluation.authorityScore !== null ||
    evaluation.rankingClaimAllowed !== false ||
    evaluation.competitorClaimAllowed !== false ||
    evaluation.attributionClaimAllowed !== false ||
    evaluation.causalClaimAllowed !== false ||
    evaluation.externalAccessPerformed !== false ||
    evaluation.writesPerformed !== false
  ) {
    throw new Error(`${label} widens upstream authority`);
  }
}

function validateEvaluation(
  evaluation: AiSearchAuthorityEvaluationV1,
  label: string,
  evaluatedAtMs: number,
  maxEvaluationAgeHours: number
): ValidatedEvaluation {
  assertEvaluationAuthority(evaluation, label);

  const asOf = iso(evaluation.asOf, `${label}.asOf`);
  const windowStartAt = iso(evaluation.window.startAt, `${label}.window.startAt`);
  const windowEndAt = iso(evaluation.window.endAt, `${label}.window.endAt`);
  if (Date.parse(windowEndAt) <= Date.parse(windowStartAt)) throw new Error(`${label}.window must have a positive duration`);
  if (Date.parse(windowEndAt) > Date.parse(asOf)) throw new Error(`${label}.window.endAt cannot be after asOf`);
  if (Date.parse(asOf) > evaluatedAtMs) throw new Error(`${label}.asOf cannot be after evaluatedAt`);

  const queryMap = new Map<string, AiSearchAuthorityObservationV1>();
  const entityRefs = new Set<string>();
  let currentObservationCount = 0;
  let mentionCount = 0;
  let citationCount = 0;

  for (const [index, observation] of evaluation.observations.entries()) {
    const key = queryKey(observation);
    if (queryMap.has(key)) throw new Error(`${label} contains duplicate query observation: ${key}`);
    queryMap.set(key, observation);

    const entityRef = assertSafeRef(observation.targetEntityRef, `${label}.observations[${index}].targetEntityRef`);
    entityRefs.add(entityRef);
    assertSafeRef(observation.queryRef, `${label}.observations[${index}].queryRef`);
    assertSafeRef(observation.observationId, `${label}.observations[${index}].observationId`);
    for (const [refIndex, evidenceRef] of observation.evidenceRefs.entries()) {
      assertSafeRef(evidenceRef, `${label}.observations[${index}].evidenceRefs[${refIndex}]`);
    }
    for (const [refIndex, sourceRef] of observation.citedSourceRefs.entries()) {
      assertSafeRef(sourceRef, `${label}.observations[${index}].citedSourceRefs[${refIndex}]`);
    }

    const observedAt = iso(observation.observedAt, `${label}.observations[${index}].observedAt`);
    const capturedAt = iso(observation.capturedAt, `${label}.observations[${index}].capturedAt`);
    if (Date.parse(observedAt) < Date.parse(windowStartAt) || Date.parse(observedAt) > Date.parse(windowEndAt)) {
      throw new Error(`${label}.${observation.observationId}.observedAt must be inside the declared window`);
    }
    if (Date.parse(observedAt) > Date.parse(capturedAt)) {
      throw new Error(`${label}.${observation.observationId}.observedAt cannot be after capturedAt`);
    }
    if (Date.parse(capturedAt) > Date.parse(asOf)) {
      throw new Error(`${label}.${observation.observationId}.capturedAt cannot be after asOf`);
    }

    const mentionObserved = observation.resultState !== "NOT_MENTIONED";
    const citationObserved = observation.resultState === "MENTIONED_WITH_CITATION";
    if (observation.mentionObserved !== mentionObserved || observation.citationObserved !== citationObserved) {
      throw new Error(`${label}.${observation.observationId} result flags are inconsistent`);
    }
    if (citationObserved !== (observation.citedSourceRefs.length > 0)) {
      throw new Error(`${label}.${observation.observationId} citation evidence is inconsistent`);
    }
    if (!citationObserved && observation.citedSourceRefs.length > 0) {
      throw new Error(`${label}.${observation.observationId} cannot attach citations without an observed citation`);
    }

    if (observation.freshness === "CURRENT") {
      currentObservationCount += 1;
      if (mentionObserved) mentionCount += 1;
      if (citationObserved) citationCount += 1;
    }
  }

  if (entityRefs.size > 1) throw new Error(`${label} mixes targetEntityRef identities`);
  const entityRef = entityRefs.size === 1 ? [...entityRefs][0]! : null;

  const ready =
    evaluation.status === "READY" &&
    evaluation.missingQueryKeys.length === 0 &&
    evaluation.staleObservationIds.length === 0;

  if (ready) {
    if (!entityRef) throw new Error(`${label} READY evaluation requires one targetEntityRef`);
    if (evaluation.expectedQueryCount !== queryMap.size || evaluation.currentObservationCount !== queryMap.size) {
      throw new Error(`${label} READY evaluation query counts are inconsistent`);
    }
    if (currentObservationCount !== queryMap.size) throw new Error(`${label} READY evaluation contains non-current observations`);
    if (evaluation.overall.mentionCount !== mentionCount || evaluation.overall.citationCount !== citationCount) {
      throw new Error(`${label} READY evaluation aggregate counts are inconsistent`);
    }
  }

  const stale = evaluatedAtMs - Date.parse(asOf) > maxEvaluationAgeHours * 3_600_000;
  return freeze({ entityRef, queryMap, ready, stale, asOf, windowStartAt, windowEndAt });
}

function sameQueryKeys(left: ReadonlyMap<string, AiSearchAuthorityObservationV1>, right: ReadonlyMap<string, AiSearchAuthorityObservationV1>): boolean {
  if (left.size !== right.size) return false;
  for (const key of left.keys()) if (!right.has(key)) return false;
  return true;
}

function queryClassesMatch(
  target: ReadonlyMap<string, AiSearchAuthorityObservationV1>,
  peer: ReadonlyMap<string, AiSearchAuthorityObservationV1>
): boolean {
  for (const [key, targetObservation] of target.entries()) {
    const peerObservation = peer.get(key);
    if (!peerObservation || peerObservation.queryClass !== targetObservation.queryClass) return false;
  }
  return true;
}

function verificationIssue(
  code: AiSearchCitationGapVerificationCodeV1,
  subjectEntityRef: string | null,
  detail: string
): AiSearchCitationGapVerificationIssueV1 {
  return freeze({ code, subjectEntityRef, detail });
}

function guardrails(): readonly string[] {
  return freeze([
    "A citation gap means a sourceRef was directly observed in one or more peer citations on exact compared query keys while that same sourceRef was not observed in the target citation on those same query keys during the same fixed benchmark window.",
    "Absence from a target citation on a compared query does not establish that the source lacks target coverage elsewhere, and it does not establish why any AI system produced its answer.",
    "Peer citations do not establish competitor performance, ranking superiority, endorsement, sponsorship, relationship, authority, causality, attribution, business impact, confidence, or monetary value.",
    "Only complete, fresh, equal-window evaluations over the exact same query universe and query classes can produce citation-gap review items.",
    "Research candidates are internal evidence-review prompts only. No outreach, publication, SEO mutation, provider write, notification, spend, or approval bypass is authorized."
  ]);
}

export function compileAiSearchCitationGapReviewV1(input: AiSearchCitationGapReviewInputV1): AiSearchCitationGapReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.peers) || input.peers.length === 0) throw new Error("peers must contain at least one evaluation");
  if (input.peers.length > AI_SEARCH_CITATION_GAP_MAX_PEERS_V1) {
    throw new Error(`at most ${AI_SEARCH_CITATION_GAP_MAX_PEERS_V1} peer evaluations are allowed`);
  }

  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxEvaluationAgeHours = positiveFinite(input.policy.maxEvaluationAgeHours, "policy.maxEvaluationAgeHours");
  const minDistinctPeerEntitiesForGap = positiveInteger(
    input.policy.minDistinctPeerEntitiesForGap,
    "policy.minDistinctPeerEntitiesForGap"
  );
  if (minDistinctPeerEntitiesForGap > input.peers.length) {
    throw new Error("policy.minDistinctPeerEntitiesForGap cannot exceed peer count");
  }

  const target = validateEvaluation(input.target, "target", evaluatedAtMs, maxEvaluationAgeHours);
  const peers = input.peers.map((peer, index) =>
    validateEvaluation(peer.evaluation, `peers[${index}]`, evaluatedAtMs, maxEvaluationAgeHours)
  );

  const peerEntityRefs = new Set<string>();
  for (const [index, peer] of peers.entries()) {
    if (peer.ready && !peer.entityRef) throw new Error(`peers[${index}] READY evaluation requires targetEntityRef`);
    if (!peer.entityRef) continue;
    if (target.entityRef && peer.entityRef === target.entityRef) throw new Error("peer evaluation cannot target the same entity as target");
    if (peerEntityRefs.has(peer.entityRef)) throw new Error(`duplicate peer targetEntityRef: ${peer.entityRef}`);
    peerEntityRefs.add(peer.entityRef);
  }

  const verificationIssues: AiSearchCitationGapVerificationIssueV1[] = [];
  if (!target.ready) {
    verificationIssues.push(verificationIssue("TARGET_NOT_READY", target.entityRef, "Target AI-search evaluation is not READY with complete current evidence."));
  }
  if (target.stale) {
    verificationIssues.push(verificationIssue("TARGET_EVIDENCE_STALE", target.entityRef, "Target AI-search evaluation exceeds the caller-supplied freshness policy."));
  }

  for (const peer of peers) {
    if (!peer.ready) {
      verificationIssues.push(verificationIssue("PEER_NOT_READY", peer.entityRef, "Peer AI-search evaluation is not READY with complete current evidence."));
      continue;
    }
    if (peer.stale) {
      verificationIssues.push(verificationIssue("PEER_EVIDENCE_STALE", peer.entityRef, "Peer AI-search evaluation exceeds the caller-supplied freshness policy."));
    }
    if (peer.windowStartAt !== target.windowStartAt || peer.windowEndAt !== target.windowEndAt) {
      verificationIssues.push(verificationIssue("WINDOW_MISMATCH", peer.entityRef, "Peer and target evaluations must use the exact same benchmark window."));
    }
    if (!sameQueryKeys(target.queryMap, peer.queryMap)) {
      verificationIssues.push(verificationIssue("QUERY_UNIVERSE_MISMATCH", peer.entityRef, "Peer and target evaluations must contain the exact same engine/queryRef universe."));
      continue;
    }
    if (!queryClassesMatch(target.queryMap, peer.queryMap)) {
      verificationIssues.push(verificationIssue("QUERY_CLASS_MISMATCH", peer.entityRef, "Peer and target evaluations must preserve the same queryClass for every compared query key."));
    }
  }

  if (verificationIssues.length) {
    return freeze({
      contractVersion: AI_SEARCH_CITATION_GAP_REVIEW_V1_VERSION,
      evaluatedAt,
      status: "VERIFY_REQUIRED" as const,
      targetEntityRef: target.entityRef,
      peerEntityRefs: unique([...peerEntityRefs]),
      comparedQueryCount: 0,
      items: [],
      verificationIssues,
      guardrails: guardrails(),
      publicationAuthority: "NONE" as const,
      outreachAuthority: "NONE" as const,
      seoMutationAuthority: "NONE" as const,
      notificationAuthority: "NONE" as const,
      providerWriteAuthority: "NONE" as const,
      externalAccessPerformed: false as const,
      writesPerformed: false as const
    });
  }

  if (!target.entityRef) throw new Error("target READY evaluation requires targetEntityRef");
  const gaps = new Map<string, MutableGap>();
  const targetCitationSources = new Set(
    [...target.queryMap.values()].flatMap((observation) => observation.citedSourceRefs)
  );

  for (const peer of peers) {
    if (!peer.entityRef) throw new Error("peer READY evaluation requires targetEntityRef");
    for (const [key, peerObservation] of peer.queryMap.entries()) {
      if (!peerObservation.citationObserved) continue;
      const targetObservation = target.queryMap.get(key);
      if (!targetObservation) throw new Error(`target query map unexpectedly missing ${key}`);

      for (const sourceRef of peerObservation.citedSourceRefs) {
        if (targetObservation.citedSourceRefs.includes(sourceRef)) continue;
        const existing = gaps.get(sourceRef) ?? {
          sourceRef,
          peerEntityRefs: new Set<string>(),
          queryKeys: new Set<string>(),
          engines: new Set<AiSearchEngineV1>(),
          queryClasses: new Set<AiSearchQueryClassV1>(),
          peerCitationObservationKeys: new Set<string>(),
          targetMentionedQueryKeys: new Set<string>(),
          evidenceRefs: []
        };
        existing.peerEntityRefs.add(peer.entityRef);
        existing.queryKeys.add(key);
        existing.engines.add(peerObservation.engine);
        existing.queryClasses.add(peerObservation.queryClass);
        existing.peerCitationObservationKeys.add(`${peer.entityRef}\u0000${key}\u0000${sourceRef}`);
        if (targetObservation.mentionObserved) existing.targetMentionedQueryKeys.add(key);
        existing.evidenceRefs.push(...peerObservation.evidenceRefs, ...targetObservation.evidenceRefs);
        gaps.set(sourceRef, existing);
      }
    }
  }

  const items = [...gaps.values()]
    .filter((gap) => gap.peerEntityRefs.size >= minDistinctPeerEntitiesForGap)
    .map((gap): AiSearchCitationGapItemV1 => {
      const peersForGap = [...gap.peerEntityRefs].sort((left, right) => left.localeCompare(right));
      const queryKeys = [...gap.queryKeys].sort((left, right) => left.localeCompare(right));
      const engines = [...gap.engines].sort((left, right) => left.localeCompare(right));
      const queryClasses = [...gap.queryClasses].sort((left, right) => left.localeCompare(right));
      const targetMentionedQueryKeys = [...gap.targetMentionedQueryKeys].sort((left, right) => left.localeCompare(right));
      return freeze({
        sourceRef: gap.sourceRef,
        peerEntityRefs: peersForGap,
        queryKeys,
        engines,
        queryClasses,
        peerCitationObservationCount: gap.peerCitationObservationKeys.size,
        targetMentionedQueryKeys,
        targetCitationObservedElsewhere: targetCitationSources.has(gap.sourceRef),
        evidenceRefs: unique(gap.evidenceRefs),
        state: "OBSERVED_PEER_CITATION_GAP" as const,
        statement: `${gap.sourceRef} was directly observed in ${gap.peerCitationObservationKeys.size} peer citation observation(s) across ${queryKeys.length} exact compared query key(s) and ${peersForGap.length} distinct peer entity/entities, while that source was not observed in the target citation on those same query comparisons. This is a bounded citation-coverage observation only, not evidence that the source caused the peer appearance or that any peer outranks, outperforms, endorses, sponsors, or has a relationship with the source.`,
        researchCandidate: true as const,
        rankingClaim: false as const,
        competitorPerformanceClaim: false as const,
        endorsementClaim: false as const,
        relationshipClaim: false as const,
        attributionClaim: false as const,
        causalClaim: false as const,
        confidenceClaim: false as const,
        monetaryValueClaim: false as const
      });
    })
    .sort((left, right) =>
      right.peerEntityRefs.length - left.peerEntityRefs.length ||
      right.queryKeys.length - left.queryKeys.length ||
      left.sourceRef.localeCompare(right.sourceRef)
    )
    .slice(0, AI_SEARCH_CITATION_GAP_MAX_ITEMS_V1);

  return freeze({
    contractVersion: AI_SEARCH_CITATION_GAP_REVIEW_V1_VERSION,
    evaluatedAt,
    status: items.length ? "READY_FOR_REVIEW" : "NO_OBSERVED_GAP",
    targetEntityRef: target.entityRef,
    peerEntityRefs: unique([...peerEntityRefs]),
    comparedQueryCount: target.queryMap.size,
    items,
    verificationIssues: [],
    guardrails: guardrails(),
    publicationAuthority: "NONE",
    outreachAuthority: "NONE",
    seoMutationAuthority: "NONE",
    notificationAuthority: "NONE",
    providerWriteAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
