export const CROSS_ENGINE_SYNTHESIS_V1_VERSION = "CrossEngineSynthesisV1" as const;
export const CROSS_ENGINE_SYNTHESIS_MAX_SIGNALS_V1 = 100;
export const CROSS_ENGINE_SYNTHESIS_MAX_HYPOTHESES_V1 = 50;

export type CrossEngineDomainV1 =
  | "REVENUE"
  | "SOCIAL"
  | "RELATIONSHIP"
  | "FINANCE"
  | "INVENTORY"
  | "WEBSITE"
  | "CONTENT"
  | "OPERATIONS"
  | "EXTERNAL"
  | "STRATEGY";

export type CrossEngineTruthStateV1 = "KNOWN" | "PARTIAL" | "STALE" | "CONFLICTED" | "UNKNOWN";
export type CrossEngineFreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";
export type CrossEngineMaterialityV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CrossEngineSignalV1 = Readonly<{
  signalId: string;
  domain: CrossEngineDomainV1;
  kind: "OPPORTUNITY" | "RISK" | "CHANGE";
  summary: string;
  observedAt: string;
  truthState: CrossEngineTruthStateV1;
  freshness: CrossEngineFreshnessV1;
  materiality: CrossEngineMaterialityV1;
  entityRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  /**
   * Explicit upstream lineage identity. Two signals with the same key are not
   * independent support even if they were projected into different domains.
   */
  independenceKey: string;
  /**
   * Canonical entity/time/decision linkage supplied by upstream owners. The
   * synthesizer never invents a relationship from prose or similar names.
   */
  synthesisKeys: readonly string[];
}>;

export type CrossEngineExpectedImpactV1 =
  | Readonly<{
      state: "UNKNOWN";
      unit: null;
      low: null;
      high: null;
      evidenceRefs: readonly [];
    }>
  | Readonly<{
      state: "SUPPORTED";
      unit: "CENTS" | "COUNT" | "PERCENT" | "HOURS" | "OTHER";
      low: number;
      high: number;
      evidenceRefs: readonly string[];
    }>;

export type CrossEngineHypothesisV1 = Readonly<{
  hypothesisId: string;
  signalIds: readonly string[];
  classification: "OPPORTUNITY" | "RISK";
  connection: string;
  whyItMatters: string;
  expectedImpact: CrossEngineExpectedImpactV1;
  decisiveUnknowns: readonly string[];
  timingWindow: Readonly<{ start: string; end: string }> | null;
  affectedDecisionRefs: readonly string[];
  affectedActionRefs: readonly string[];
  nextSafeAction: Readonly<{
    kind: "RESEARCH" | "REVIEW" | "MONITOR" | "PREPARE_FOR_APPROVAL";
    summary: string;
  }>;
}>;

export type CrossEngineSynthesisBlockReasonV1 =
  | "SIGNAL_NOT_DECISION_GRADE"
  | "INSUFFICIENT_INDEPENDENT_DOMAINS"
  | "DUPLICATED_LINEAGE"
  | "NO_EXPLICIT_SHARED_SYNTHESIS_KEY"
  | "IMPACT_EVIDENCE_NOT_LINKED";

export type CrossEngineSynthesisItemV1 = Readonly<{
  hypothesisId: string;
  status: "READY" | "BLOCKED";
  blockReasons: readonly CrossEngineSynthesisBlockReasonV1[];
  classification: CrossEngineHypothesisV1["classification"];
  connection: string;
  whyItMatters: string;
  supportMode: "MULTI_DOMAIN_INDEPENDENT" | "SINGLE_CRITICAL_SIGNAL" | "BLOCKED";
  supportAssessment:
    | "SUPPORTED_BY_INDEPENDENT_CURRENT_EVIDENCE"
    | "SINGLE_CRITICAL_SIGNAL_REQUIRES_REVIEW"
    | "INSUFFICIENT_FOR_DECISION_GRADE_SYNTHESIS";
  signalIds: readonly string[];
  domains: readonly CrossEngineDomainV1[];
  sharedSynthesisKeys: readonly string[];
  entityRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  expectedImpact: CrossEngineExpectedImpactV1;
  decisiveUnknowns: readonly string[];
  timingWindow: CrossEngineHypothesisV1["timingWindow"];
  affectedDecisionRefs: readonly string[];
  affectedActionRefs: readonly string[];
  nextSafeAction: CrossEngineHypothesisV1["nextSafeAction"];
  causalAttribution: "NOT_ESTABLISHED";
  limitations: readonly string[];
  authority: Readonly<{
    externalMutationAllowed: false;
    outreachAllowed: false;
    publishingAllowed: false;
    spendAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

export type CrossEngineSynthesisInputV1 = Readonly<{
  generatedAt: string;
  signals: readonly CrossEngineSignalV1[];
  hypotheses: readonly CrossEngineHypothesisV1[];
}>;

export type CrossEngineSynthesisV1 = Readonly<{
  contractVersion: typeof CROSS_ENGINE_SYNTHESIS_V1_VERSION;
  generatedAt: string;
  status: "READY" | "BLOCKED" | "NO_MATERIAL_SYNTHESIS";
  items: readonly CrossEngineSynthesisItemV1[];
  readyCount: number;
  blockedCount: number;
  limitations: readonly string[];
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

const AUTHORITY = Object.freeze({
  externalMutationAllowed: false,
  outreachAllowed: false,
  publishingAllowed: false,
  spendAllowed: false,
  actionExecutionAllowed: false,
  approvalBypassAllowed: false
} as const);

const LIMITATIONS = Object.freeze([
  "Cross-domain co-occurrence and shared canonical linkage do not establish causality.",
  "This projection does not infer relationships, timing, economics, confidence, or access paths that are absent from upstream evidence.",
  "A ready synthesis is decision support only and grants no external action or approval authority."
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function normalizedText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be empty`);
  return normalized;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function requireIso(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!value || !Number.isFinite(milliseconds)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function validateRange(
  range: CrossEngineHypothesisV1["timingWindow"],
  generatedAtMs: number,
  field: string
): CrossEngineHypothesisV1["timingWindow"] {
  if (!range) return null;
  const start = requireIso(range.start, `${field}.start`);
  const end = requireIso(range.end, `${field}.end`);
  if (Date.parse(end) < Date.parse(start)) throw new Error(`${field} end must not precede start`);
  if (Date.parse(start) > generatedAtMs && Date.parse(end) > generatedAtMs) {
    // A future planning window is valid when explicitly supplied. Parsing above
    // is the only temporal normalization performed here.
  }
  return { start, end };
}

function validateExpectedImpact(
  impact: CrossEngineExpectedImpactV1,
  signalEvidenceRefs: ReadonlySet<string>
): { impact: CrossEngineExpectedImpactV1; linked: boolean } {
  if (impact.state === "UNKNOWN") {
    return {
      impact: {
        state: "UNKNOWN",
        unit: null,
        low: null,
        high: null,
        evidenceRefs: []
      },
      linked: true
    };
  }

  if (!Number.isFinite(impact.low) || !Number.isFinite(impact.high) || impact.high < impact.low) {
    throw new Error("supported expectedImpact requires a finite ordered range");
  }
  const evidenceRefs = unique(impact.evidenceRefs);
  if (evidenceRefs.length === 0) throw new Error("supported expectedImpact requires evidenceRefs");
  const linked = evidenceRefs.every((ref) => signalEvidenceRefs.has(ref));
  return {
    impact: {
      state: "SUPPORTED",
      unit: impact.unit,
      low: impact.low,
      high: impact.high,
      evidenceRefs
    },
    linked
  };
}

function signalDecisionGrade(signal: CrossEngineSignalV1, generatedAtMs: number): boolean {
  const observedAtMs = Date.parse(signal.observedAt);
  return (
    signal.truthState === "KNOWN" &&
    signal.freshness === "FRESH" &&
    Number.isFinite(observedAtMs) &&
    observedAtMs <= generatedAtMs &&
    signal.evidenceRefs.length > 0 &&
    signal.sourceRefs.length > 0 &&
    signal.independenceKey.trim().length > 0 &&
    signal.synthesisKeys.length > 0
  );
}

function sharedSynthesisKeys(signals: readonly CrossEngineSignalV1[]): string[] {
  if (signals.length === 0) return [];
  const first = new Set(unique(signals[0].synthesisKeys));
  return [...first]
    .filter((key) => signals.every((signal) => unique(signal.synthesisKeys).includes(key)))
    .sort((a, b) => a.localeCompare(b));
}

function blockedReasons(
  signals: readonly CrossEngineSignalV1[],
  generatedAtMs: number,
  impactLinked: boolean
): CrossEngineSynthesisBlockReasonV1[] {
  const reasons = new Set<CrossEngineSynthesisBlockReasonV1>();
  const singleCritical = signals.length === 1 && signals[0].materiality === "CRITICAL";

  if (signals.some((signal) => !signalDecisionGrade(signal, generatedAtMs))) {
    reasons.add("SIGNAL_NOT_DECISION_GRADE");
  }

  if (!singleCritical) {
    if (new Set(signals.map((signal) => signal.domain)).size < 2) {
      reasons.add("INSUFFICIENT_INDEPENDENT_DOMAINS");
    }
    if (new Set(signals.map((signal) => signal.independenceKey.trim())).size < signals.length) {
      reasons.add("DUPLICATED_LINEAGE");
    }
    if (sharedSynthesisKeys(signals).length === 0) {
      reasons.add("NO_EXPLICIT_SHARED_SYNTHESIS_KEY");
    }
  }

  if (!impactLinked) reasons.add("IMPACT_EVIDENCE_NOT_LINKED");
  return [...reasons].sort((a, b) => a.localeCompare(b));
}

function compileItem(
  hypothesis: CrossEngineHypothesisV1,
  signalsById: ReadonlyMap<string, CrossEngineSignalV1>,
  generatedAtMs: number
): CrossEngineSynthesisItemV1 {
  normalizedText(hypothesis.hypothesisId, "hypothesisId");
  normalizedText(hypothesis.connection, `${hypothesis.hypothesisId}.connection`);
  normalizedText(hypothesis.whyItMatters, `${hypothesis.hypothesisId}.whyItMatters`);
  normalizedText(hypothesis.nextSafeAction.summary, `${hypothesis.hypothesisId}.nextSafeAction.summary`);

  const signalIds = unique(hypothesis.signalIds);
  if (signalIds.length === 0) throw new Error(`${hypothesis.hypothesisId} must reference at least one signal`);
  if (signalIds.length !== hypothesis.signalIds.length) {
    throw new Error(`${hypothesis.hypothesisId} contains duplicate signalIds`);
  }
  const signals = signalIds.map((signalId) => {
    const signal = signalsById.get(signalId);
    if (!signal) throw new Error(`${hypothesis.hypothesisId} references unknown signal ${signalId}`);
    return signal;
  });

  const evidenceRefs = unique(signals.flatMap((signal) => signal.evidenceRefs));
  const impact = validateExpectedImpact(hypothesis.expectedImpact, new Set(evidenceRefs));
  const reasons = blockedReasons(signals, generatedAtMs, impact.linked);
  const singleCritical = signals.length === 1 && signals[0].materiality === "CRITICAL";
  const ready = reasons.length === 0;
  const supportMode = ready
    ? singleCritical
      ? "SINGLE_CRITICAL_SIGNAL"
      : "MULTI_DOMAIN_INDEPENDENT"
    : "BLOCKED";
  const supportAssessment = ready
    ? singleCritical
      ? "SINGLE_CRITICAL_SIGNAL_REQUIRES_REVIEW"
      : "SUPPORTED_BY_INDEPENDENT_CURRENT_EVIDENCE"
    : "INSUFFICIENT_FOR_DECISION_GRADE_SYNTHESIS";

  return deepFreeze({
    hypothesisId: hypothesis.hypothesisId.trim(),
    status: ready ? "READY" : "BLOCKED",
    blockReasons: reasons,
    classification: hypothesis.classification,
    connection: hypothesis.connection.trim(),
    whyItMatters: hypothesis.whyItMatters.trim(),
    supportMode,
    supportAssessment,
    signalIds,
    domains: [...new Set(signals.map((signal) => signal.domain))].sort(),
    sharedSynthesisKeys: singleCritical ? unique(signals[0].synthesisKeys) : sharedSynthesisKeys(signals),
    entityRefs: unique(signals.flatMap((signal) => signal.entityRefs)),
    evidenceRefs,
    sourceRefs: unique(signals.flatMap((signal) => signal.sourceRefs)),
    expectedImpact: impact.linked ? impact.impact : {
      state: "UNKNOWN",
      unit: null,
      low: null,
      high: null,
      evidenceRefs: []
    },
    decisiveUnknowns: unique(hypothesis.decisiveUnknowns),
    timingWindow: hypothesis.timingWindow,
    affectedDecisionRefs: unique(hypothesis.affectedDecisionRefs),
    affectedActionRefs: unique(hypothesis.affectedActionRefs),
    nextSafeAction: {
      kind: hypothesis.nextSafeAction.kind,
      summary: hypothesis.nextSafeAction.summary.trim()
    },
    causalAttribution: "NOT_ESTABLISHED",
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}

/**
 * Compiles explicit cross-domain hypotheses from bounded upstream signals.
 *
 * This is intentionally a conservative synthesis boundary, not a discovery
 * model. It only joins signals through canonical synthesis keys supplied by
 * upstream owners, counts independent lineage once, preserves unsupported
 * impact as UNKNOWN, and never upgrades co-occurrence into causal truth.
 */
export function compileCrossEngineSynthesisV1(
  input: CrossEngineSynthesisInputV1
): CrossEngineSynthesisV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.signals)) throw new Error("signals must be an array");
  if (!Array.isArray(input.hypotheses)) throw new Error("hypotheses must be an array");
  if (input.signals.length > CROSS_ENGINE_SYNTHESIS_MAX_SIGNALS_V1) {
    throw new Error(`at most ${CROSS_ENGINE_SYNTHESIS_MAX_SIGNALS_V1} signals are allowed`);
  }
  if (input.hypotheses.length > CROSS_ENGINE_SYNTHESIS_MAX_HYPOTHESES_V1) {
    throw new Error(`at most ${CROSS_ENGINE_SYNTHESIS_MAX_HYPOTHESES_V1} hypotheses are allowed`);
  }

  const generatedAt = requireIso(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const signalsById = new Map<string, CrossEngineSignalV1>();

  for (const signal of input.signals) {
    const signalId = normalizedText(signal.signalId, "signalId");
    if (signalsById.has(signalId)) throw new Error(`duplicate signalId: ${signalId}`);
    const observedAt = requireIso(signal.observedAt, `${signalId}.observedAt`);
    if (Date.parse(observedAt) > generatedAtMs) throw new Error(`${signalId}.observedAt cannot be after generatedAt`);
    normalizedText(signal.summary, `${signalId}.summary`);
    normalizedText(signal.independenceKey, `${signalId}.independenceKey`);
    if (unique(signal.evidenceRefs).length !== signal.evidenceRefs.length) throw new Error(`${signalId} has duplicate evidenceRefs`);
    if (unique(signal.sourceRefs).length !== signal.sourceRefs.length) throw new Error(`${signalId} has duplicate sourceRefs`);
    if (unique(signal.synthesisKeys).length !== signal.synthesisKeys.length) throw new Error(`${signalId} has duplicate synthesisKeys`);
    signalsById.set(signalId, signal);
  }

  const hypothesisIds = new Set<string>();
  const items = input.hypotheses
    .map((hypothesis) => {
      const id = normalizedText(hypothesis.hypothesisId, "hypothesisId");
      if (hypothesisIds.has(id)) throw new Error(`duplicate hypothesisId: ${id}`);
      hypothesisIds.add(id);
      const timingWindow = validateRange(hypothesis.timingWindow, generatedAtMs, `${id}.timingWindow`);
      return compileItem({ ...hypothesis, timingWindow }, signalsById, generatedAtMs);
    })
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "READY" ? -1 : 1;
      return left.hypothesisId.localeCompare(right.hypothesisId);
    });

  const readyCount = items.filter((item) => item.status === "READY").length;
  const blockedCount = items.length - readyCount;
  const status = items.length === 0
    ? "NO_MATERIAL_SYNTHESIS"
    : readyCount > 0
      ? "READY"
      : "BLOCKED";

  return deepFreeze({
    contractVersion: CROSS_ENGINE_SYNTHESIS_V1_VERSION,
    generatedAt,
    status,
    items,
    readyCount,
    blockedCount,
    limitations: [...LIMITATIONS],
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
