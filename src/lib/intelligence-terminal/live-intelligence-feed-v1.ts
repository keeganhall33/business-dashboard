import { createHash } from "node:crypto";

export type LiveIntelligenceCategoryV1 =
  | "BUSINESS_PERFORMANCE"
  | "CUSTOMER_COLLECTOR"
  | "RELATIONSHIP_PARTNERSHIP"
  | "MARKET_CULTURE_SPORTS"
  | "MEDIA_BRAND"
  | "CREATIVE_PRODUCT"
  | "WEBSITE_MARKETING"
  | "OPERATIONS_SYSTEM"
  | "RISK_DATA_QUALITY"
  | "LEARNING_OUTCOME";

export type LiveIntelligenceTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";
export type LiveIntelligenceMaterialityV1 = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type LiveIntelligenceUrgencyV1 = "IMMEDIATE" | "SOON" | "MONITOR";
export type LiveIntelligenceFreshnessV1 = "CURRENT" | "AGING" | "STALE" | "SUPERSEDED" | "UNKNOWN";
export type LiveIntelligenceInvestigationStateV1 = "NOT_REQUIRED" | "OPEN" | "WAITING" | "COMPLETE" | "BLOCKED";
export type LiveIntelligenceActionStateV1 = "NONE" | "PREPARE" | "READY" | "WAITING_APPROVAL" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";

export type LiveIntelligenceSignalV1 = {
  signalId: string;
  dedupeKey: string;
  occurredAt: string;
  category: LiveIntelligenceCategoryV1;
  changeType: "MATERIAL_CHANGE" | "NO_CHANGE" | "ROUTINE_SUCCESS" | "LOW_VALUE_ACTIVITY";
  whatChanged: string;
  whyItMatters: string | null;
  materiality: LiveIntelligenceMaterialityV1;
  urgency: LiveIntelligenceUrgencyV1;
  truthState: LiveIntelligenceTruthStateV1;
  freshness: LiveIntelligenceFreshnessV1;
  confidence: number | null;
  causalClaim: boolean;
  causalitySupport: "SUPPORTED" | "INFERRED" | "UNKNOWN";
  affectedRefs: {
    entityRefs: readonly string[];
    recommendationRefs: readonly string[];
    decisionRefs: readonly string[];
  };
  evidenceRefs: readonly string[];
  investigationState: LiveIntelligenceInvestigationStateV1;
  actionState: LiveIntelligenceActionStateV1;
  safeNextStep: string | null;
  supersedesSignalIds: readonly string[];
};

export type LiveIntelligenceFeedItemV1 = Omit<LiveIntelligenceSignalV1, "changeType" | "supersedesSignalIds"> & {
  feedItemId: string;
  causalityDisplay: "SUPPORTED" | "NOT_ESTABLISHED";
  whyItMattersSupported: boolean;
};

export type LiveIntelligenceFeedV1 = {
  contractVersion: "LiveIntelligenceFeedV1";
  policyVersion: "live_intelligence_feed_policy_v1.0.0";
  generatedAt: string;
  items: readonly LiveIntelligenceFeedItemV1[];
  summary: {
    surfaced: number;
    immediate: number;
    verificationRequired: number;
    suppressedDuplicates: number;
    suppressedNoise: number;
    suppressedSuperseded: number;
    truncated: number;
  };
};

export class LiveIntelligenceFeedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LiveIntelligenceFeedError";
  }
}

const CATEGORIES = new Set<LiveIntelligenceCategoryV1>([
  "BUSINESS_PERFORMANCE", "CUSTOMER_COLLECTOR", "RELATIONSHIP_PARTNERSHIP", "MARKET_CULTURE_SPORTS", "MEDIA_BRAND",
  "CREATIVE_PRODUCT", "WEBSITE_MARKETING", "OPERATIONS_SYSTEM", "RISK_DATA_QUALITY", "LEARNING_OUTCOME"
]);
const TRUTH_STATES = new Set<LiveIntelligenceTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"]);
const MATERIALITY_ORDER: Readonly<Record<LiveIntelligenceMaterialityV1, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const URGENCY_ORDER: Readonly<Record<LiveIntelligenceUrgencyV1, number>> = { IMMEDIATE: 0, SOON: 1, MONITOR: 2 };
const MAX_INPUTS = 500;
const MAX_OUTPUT = 30;
const MAX_REFS = 100;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new LiveIntelligenceFeedError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function optional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function instant(value: string, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new LiveIntelligenceFeedError("INVALID_TIMESTAMP", `${label} is invalid`);
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) throw new LiveIntelligenceFeedError("INVALID_REFS", `${label} is invalid`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function normalize(signal: LiveIntelligenceSignalV1, index: number): LiveIntelligenceSignalV1 {
  const signalId = required(signal?.signalId, `signals[${index}].signalId`);
  if (!CATEGORIES.has(signal.category)) throw new LiveIntelligenceFeedError("INVALID_CATEGORY", `${signalId} has an invalid category`);
  if (!TRUTH_STATES.has(signal.truthState)) throw new LiveIntelligenceFeedError("INVALID_TRUTH_STATE", `${signalId} has an invalid truth state`);
  if (signal.confidence != null && (typeof signal.confidence !== "number" || !Number.isFinite(signal.confidence) || signal.confidence < 0 || signal.confidence > 1)) {
    throw new LiveIntelligenceFeedError("INVALID_CONFIDENCE", `${signalId} confidence must be between zero and one`);
  }
  return {
    ...structuredClone(signal), signalId, dedupeKey: required(signal.dedupeKey, `${signalId}.dedupeKey`),
    occurredAt: instant(signal.occurredAt, `${signalId}.occurredAt`), whatChanged: required(signal.whatChanged, `${signalId}.whatChanged`),
    whyItMatters: optional(signal.whyItMatters), safeNextStep: optional(signal.safeNextStep),
    evidenceRefs: refs(signal.evidenceRefs, `${signalId}.evidenceRefs`),
    affectedRefs: {
      entityRefs: refs(signal.affectedRefs?.entityRefs ?? [], `${signalId}.entityRefs`),
      recommendationRefs: refs(signal.affectedRefs?.recommendationRefs ?? [], `${signalId}.recommendationRefs`),
      decisionRefs: refs(signal.affectedRefs?.decisionRefs ?? [], `${signalId}.decisionRefs`)
    },
    supersedesSignalIds: refs(signal.supersedesSignalIds, `${signalId}.supersedesSignalIds`)
  };
}

function better(a: LiveIntelligenceSignalV1, b: LiveIntelligenceSignalV1): LiveIntelligenceSignalV1 {
  const materiality = MATERIALITY_ORDER[a.materiality] - MATERIALITY_ORDER[b.materiality];
  if (materiality !== 0) return materiality < 0 ? a : b;
  const urgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
  if (urgency !== 0) return urgency < 0 ? a : b;
  const time = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (time !== 0) return time > 0 ? a : b;
  return a.signalId.localeCompare(b.signalId) <= 0 ? a : b;
}

function toItem(signal: LiveIntelligenceSignalV1): LiveIntelligenceFeedItemV1 {
  const whySupported = !signal.causalClaim || signal.causalitySupport === "SUPPORTED";
  const identity = { signalId: signal.signalId, dedupeKey: signal.dedupeKey, occurredAt: signal.occurredAt };
  return {
    feedItemId: `live_intelligence_${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 20)}`,
    signalId: signal.signalId, dedupeKey: signal.dedupeKey, occurredAt: signal.occurredAt, category: signal.category,
    whatChanged: signal.whatChanged,
    whyItMatters: whySupported ? signal.whyItMatters : "Why this matters is not yet established by the available evidence.",
    materiality: signal.materiality, urgency: signal.urgency, truthState: signal.truthState, freshness: signal.freshness,
    confidence: signal.confidence, causalClaim: signal.causalClaim, causalitySupport: signal.causalitySupport,
    affectedRefs: signal.affectedRefs, evidenceRefs: signal.evidenceRefs, investigationState: signal.investigationState,
    actionState: signal.actionState, safeNextStep: signal.safeNextStep,
    causalityDisplay: whySupported ? "SUPPORTED" : "NOT_ESTABLISHED", whyItMattersSupported: whySupported
  };
}

export function buildLiveIntelligenceFeedV1(input: {
  signals: readonly LiveIntelligenceSignalV1[];
  generatedAt: string;
  maxItems?: number;
}): LiveIntelligenceFeedV1 {
  if (!Array.isArray(input.signals) || input.signals.length > MAX_INPUTS) throw new LiveIntelligenceFeedError("INPUT_BOUND", `At most ${MAX_INPUTS} signals are allowed`);
  const generatedAt = instant(input.generatedAt, "generatedAt");
  const maxItems = input.maxItems ?? MAX_OUTPUT;
  if (!Number.isInteger(maxItems) || maxItems < 0 || maxItems > MAX_OUTPUT) throw new LiveIntelligenceFeedError("OUTPUT_BOUND", `maxItems must be between zero and ${MAX_OUTPUT}`);
  const normalized = input.signals.map(normalize);
  if (new Set(normalized.map((item) => item.signalId)).size !== normalized.length) throw new LiveIntelligenceFeedError("DUPLICATE_SIGNAL_ID", "signalId must be unique");

  const supersededIds = new Set(normalized.flatMap((signal) => signal.supersedesSignalIds));
  const candidates = normalized.filter((signal) => signal.freshness !== "SUPERSEDED" && !supersededIds.has(signal.signalId));
  const suppressedSuperseded = normalized.length - candidates.length;
  const material = candidates.filter((signal) => signal.changeType === "MATERIAL_CHANGE" && signal.materiality !== "LOW");
  const suppressedNoise = candidates.length - material.length;
  const byKey = new Map<string, LiveIntelligenceSignalV1>();
  let suppressedDuplicates = 0;
  for (const signal of material) {
    const existing = byKey.get(signal.dedupeKey);
    if (!existing) byKey.set(signal.dedupeKey, signal);
    else {
      byKey.set(signal.dedupeKey, better(existing, signal));
      suppressedDuplicates += 1;
    }
  }
  const ordered = [...byKey.values()].sort((a, b) =>
    URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
    || MATERIALITY_ORDER[a.materiality] - MATERIALITY_ORDER[b.materiality]
    || Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
    || a.signalId.localeCompare(b.signalId)
  );
  const items = ordered.slice(0, maxItems).map(toItem);
  return freeze({
    contractVersion: "LiveIntelligenceFeedV1", policyVersion: "live_intelligence_feed_policy_v1.0.0", generatedAt, items,
    summary: {
      surfaced: items.length, immediate: items.filter((item) => item.urgency === "IMMEDIATE").length,
      verificationRequired: items.filter((item) => item.truthState !== "KNOWN" || !item.whyItMattersSupported).length,
      suppressedDuplicates, suppressedNoise, suppressedSuperseded, truncated: Math.max(0, ordered.length - items.length)
    }
  });
}
