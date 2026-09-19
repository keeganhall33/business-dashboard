import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1,
} from "./decision-memory-v1";

export const COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_VERSION_V1 =
  "CompanyBrainAssumptionLineageReviewV1" as const;
export const COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_POLICY_VERSION_V1 =
  "company_brain_assumption_lineage_review_v1.0.0" as const;

const MAX_RECORDS = 100;
const MAX_TRANSITIONS = 300;
const MAX_REFS = 500;
const MAX_SOURCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type CompanyBrainAssumptionTransitionKindV1 = "RETIRED" | "REPLACED";

export type CompanyBrainAssumptionTransitionEvidenceV1 = Readonly<{
  transitionId: string;
  decisionId: string;
  fromRecordId: string;
  toRecordId: string;
  assumptionId: string;
  kind: CompanyBrainAssumptionTransitionKindV1;
  replacementAssumptionId: string | null;
  observedAt: string;
  truthState: DecisionMemoryTruthStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type CompanyBrainAssumptionLineageItemStateV1 =
  | "CURRENT"
  | "EXPLICITLY_RETIRED"
  | "EXPLICITLY_REPLACED"
  | "UNRESOLVED_REMOVAL";

export type CompanyBrainAssumptionLineageItemV1 = Readonly<{
  assumptionId: string;
  statement: string;
  material: boolean;
  statementTruthState: DecisionMemoryTruthStateV1;
  introducedInRecordId: string;
  latestRecordId: string;
  state: CompanyBrainAssumptionLineageItemStateV1;
  replacementAssumptionId: string | null;
  transitionId: string | null;
  transitionObservedAt: string | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causality: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainAssumptionLineageReasonV1 =
  | "NO_RECORDS"
  | "RECORD_BOUNDS_EXCEEDED"
  | "TRANSITION_BOUNDS_EXCEEDED"
  | "INVALID_EVALUATED_AT"
  | "INVALID_MAXIMUM_SOURCE_AGE"
  | "SOURCE_CONTRACT_INVALID"
  | "SOURCE_AUTHORITY_WIDENED"
  | "SOURCE_DECISION_ID_MISMATCH"
  | "SOURCE_RECORD_ID_INVALID"
  | "DUPLICATE_RECORD_ID"
  | "SOURCE_DECIDED_AT_INVALID"
  | "SOURCE_CHRONOLOGY_INVALID"
  | "SOURCE_PROVENANCE_MISSING"
  | "SOURCE_INTEGRITY_UNRESOLVED"
  | "ASSUMPTION_ID_INVALID"
  | "DUPLICATE_ASSUMPTION_ID_IN_RECORD"
  | "ASSUMPTION_STATEMENT_NOT_KNOWN"
  | "ASSUMPTION_EVIDENCE_MISSING"
  | "ASSUMPTION_IDENTITY_DRIFT"
  | "LINEAGE_ROOT_INVALID"
  | "LINEAGE_PARENT_MISSING"
  | "LINEAGE_FORK"
  | "LINEAGE_CYCLE_OR_DISCONNECTED"
  | "TRANSITION_ID_INVALID"
  | "DUPLICATE_TRANSITION_ID"
  | "TRANSITION_BINDING_INVALID"
  | "TRANSITION_NOT_KNOWN"
  | "TRANSITION_EVIDENCE_MISSING"
  | "TRANSITION_SOURCE_MISSING"
  | "TRANSITION_TIMESTAMP_INVALID"
  | "TRANSITION_FUTURE_DATED"
  | "TRANSITION_STALE"
  | "TRANSITION_PREDATES_SOURCE_RECORD"
  | "REMOVAL_WITHOUT_EXPLICIT_TRANSITION"
  | "DUPLICATE_REMOVAL_TRANSITION"
  | "RETIREMENT_HAS_REPLACEMENT"
  | "REPLACEMENT_TARGET_MISSING"
  | "REPLACEMENT_TARGET_NOT_ADDED"
  | "REPLACEMENT_SELF_REFERENCE"
  | "REPLACEMENT_TARGET_REUSED"
  | "REPLACEMENT_CYCLE"
  | "RETIRED_ASSUMPTION_REINTRODUCED"
  | "UNEXPECTED_TRANSITION";

export type CompanyBrainAssumptionLineageReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  state: "READY" | "VERIFY_SOURCE";
  decisionId: string | null;
  evaluatedAt: string | null;
  sourceRecordIds: readonly string[];
  reasonCodes: readonly CompanyBrainAssumptionLineageReasonV1[];
  assumptions: readonly CompanyBrainAssumptionLineageItemV1[];
  currentAssumptionIds: readonly string[];
  explicitlyRetiredAssumptionIds: readonly string[];
  explicitlyReplacedAssumptionIds: readonly string[];
  unresolvedRemovedAssumptionIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  recommendedReplacement: null;
  limitations: readonly string[];
  nextInternalStep: "VERIFY_ASSUMPTION_LINEAGE" | null;
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    assumptionMutationAuthorized: false;
    decisionMutationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    reallocationAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type ReviewCompanyBrainAssumptionLineageInputV1 = Readonly<{
  records: readonly DecisionMemoryRecordV1[];
  transitions: readonly CompanyBrainAssumptionTransitionEvidenceV1[];
  evaluatedAt: string;
  maximumSourceAgeMs: number;
}>;

const SOURCE_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationAuthorized: false,
  spendAuthorized: false,
  publishAuthorized: false,
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  assumptionMutationAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  reallocationAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const,
});

const LIMITATIONS = Object.freeze([
  "This review preserves assumption revision history only when DecisionMemory lineage and explicit transition evidence agree. It does not decide whether an assumption is objectively true.",
  "A removed assumption is not called retired or replaced without one exact, current, KNOWN transition record. Missing or ambiguous transition evidence remains unresolved.",
  "A replacement link records provenance only. It does not establish that the replacement is better, caused an outcome, deserves confidence, or should become policy.",
  "No decision, assumption, price, negotiation, allocation, campaign, experiment, persistence, external action, or approval state may be changed by this review.",
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? normalized : null;
}

function exactSourceAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expected = SOURCE_AUTHORITY as Record<string, boolean>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function refs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-assumption-lineage:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function hasReplacementCycle(edges: ReadonlyMap<string, string>): boolean {
  const visited = new Set<string>();
  const active = new Set<string>();

  const visit = (node: string): boolean => {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    active.add(node);
    const next = edges.get(node);
    if (next && visit(next)) return true;
    active.delete(node);
    return false;
  };

  return [...edges.keys()].some(visit);
}

export function reviewCompanyBrainAssumptionLineageV1(
  input: ReviewCompanyBrainAssumptionLineageInputV1,
): CompanyBrainAssumptionLineageReviewV1 {
  const reasons = new Set<CompanyBrainAssumptionLineageReasonV1>();
  const evaluatedAt = timestamp(input?.evaluatedAt);
  const maximumSourceAgeMs = input?.maximumSourceAgeMs;
  const suppliedRecords = Array.isArray(input?.records) ? input.records : [];
  const suppliedTransitions = Array.isArray(input?.transitions) ? input.transitions : [];

  if (suppliedRecords.length === 0) reasons.add("NO_RECORDS");
  if (suppliedRecords.length > MAX_RECORDS) reasons.add("RECORD_BOUNDS_EXCEEDED");
  if (suppliedTransitions.length > MAX_TRANSITIONS) reasons.add("TRANSITION_BOUNDS_EXCEEDED");
  if (!evaluatedAt) reasons.add("INVALID_EVALUATED_AT");
  if (
    !Number.isFinite(maximumSourceAgeMs)
    || maximumSourceAgeMs <= 0
    || maximumSourceAgeMs > MAX_SOURCE_AGE_MS
  ) {
    reasons.add("INVALID_MAXIMUM_SOURCE_AGE");
  }

  const recordById = new Map<string, DecisionMemoryRecordV1>();
  const decidedAtById = new Map<string, number>();
  const decisionIds = new Set<string>();
  let sourceRecordIds: string[] = [];

  if (suppliedRecords.length <= MAX_RECORDS) {
    for (const record of suppliedRecords) {
      const recordId = text(record?.recordId);
      const decisionId = text(record?.decisionId);
      if (!recordId) {
        reasons.add("SOURCE_RECORD_ID_INVALID");
        continue;
      }
      if (recordById.has(recordId)) reasons.add("DUPLICATE_RECORD_ID");
      else recordById.set(recordId, record);
      sourceRecordIds.push(recordId);
      if (decisionId) decisionIds.add(decisionId);
      else reasons.add("SOURCE_DECISION_ID_MISMATCH");

      if (
        record?.contractVersion !== "DecisionMemoryV1"
        || record?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1
      ) reasons.add("SOURCE_CONTRACT_INVALID");
      if (!exactSourceAuthority(record?.actionAuthority)) reasons.add("SOURCE_AUTHORITY_WIDENED");

      const decidedAt = timestamp(record?.decidedAt);
      if (!decidedAt) reasons.add("SOURCE_DECIDED_AT_INVALID");
      else decidedAtById.set(recordId, Date.parse(decidedAt));

      const sourceRefs = refs(record?.sourceRefs);
      if (!sourceRefs || sourceRefs.length === 0) reasons.add("SOURCE_PROVENANCE_MISSING");
      if (Array.isArray(record?.integrityFlags) && record.integrityFlags.length > 0) {
        reasons.add("SOURCE_INTEGRITY_UNRESOLVED");
      }

      const assumptionIds = new Set<string>();
      for (const assumption of Array.isArray(record?.assumptions) ? record.assumptions : []) {
        const assumptionId = text(assumption?.assumptionId);
        if (!assumptionId) {
          reasons.add("ASSUMPTION_ID_INVALID");
          continue;
        }
        if (assumptionIds.has(assumptionId)) reasons.add("DUPLICATE_ASSUMPTION_ID_IN_RECORD");
        assumptionIds.add(assumptionId);
        if (assumption?.statement?.state !== "KNOWN" || !text(assumption?.statement?.value)) {
          reasons.add("ASSUMPTION_STATEMENT_NOT_KNOWN");
        }
        const evidence = refs(assumption?.statement?.evidenceRefs);
        if (!evidence || evidence.length === 0) reasons.add("ASSUMPTION_EVIDENCE_MISSING");
      }
    }
  }

  sourceRecordIds = [...new Set(sourceRecordIds)].sort((a, b) => a.localeCompare(b));
  const decisionId = decisionIds.size === 1 ? [...decisionIds][0] ?? null : null;
  if (decisionIds.size > 1) reasons.add("SOURCE_DECISION_ID_MISMATCH");

  let orderedRecords: DecisionMemoryRecordV1[] = [];
  if (recordById.size > 0) {
    const roots = [...recordById.values()].filter((record) => record.priorRecordId == null);
    if (roots.length !== 1) reasons.add("LINEAGE_ROOT_INVALID");

    const childByParent = new Map<string, DecisionMemoryRecordV1>();
    for (const record of recordById.values()) {
      const parentId = record.priorRecordId == null ? null : text(record.priorRecordId);
      if (record.priorRecordId != null && !parentId) reasons.add("LINEAGE_PARENT_MISSING");
      if (parentId) {
        if (!recordById.has(parentId)) reasons.add("LINEAGE_PARENT_MISSING");
        if (childByParent.has(parentId)) reasons.add("LINEAGE_FORK");
        else childByParent.set(parentId, record);
      }
    }

    const root = roots[0];
    if (root) {
      const seen = new Set<string>();
      let current: DecisionMemoryRecordV1 | undefined = root;
      while (current) {
        const id = text(current.recordId);
        if (!id || seen.has(id)) {
          reasons.add("LINEAGE_CYCLE_OR_DISCONNECTED");
          break;
        }
        seen.add(id);
        orderedRecords.push(current);
        current = childByParent.get(id);
      }
      if (seen.size !== recordById.size) reasons.add("LINEAGE_CYCLE_OR_DISCONNECTED");
    }
  }

  for (let index = 1; index < orderedRecords.length; index += 1) {
    const prior = orderedRecords[index - 1];
    const current = orderedRecords[index];
    const priorId = text(prior?.recordId);
    const currentId = text(current?.recordId);
    if (!priorId || !currentId) continue;
    const priorTime = decidedAtById.get(priorId);
    const currentTime = decidedAtById.get(currentId);
    if (priorTime != null && currentTime != null && currentTime < priorTime) {
      reasons.add("SOURCE_CHRONOLOGY_INVALID");
    }
  }

  const transitionByEdgeAndAssumption = new Map<string, CompanyBrainAssumptionTransitionEvidenceV1[]>();
  const transitionIds = new Set<string>();
  const validTransitionIds = new Set<string>();
  const allEvidenceRefs: string[] = [];
  const allSourceRefs: string[] = [];

  if (suppliedTransitions.length <= MAX_TRANSITIONS) {
    for (const transition of suppliedTransitions) {
      const transitionId = text(transition?.transitionId);
      const transitionDecisionId = text(transition?.decisionId);
      const fromRecordId = text(transition?.fromRecordId);
      const toRecordId = text(transition?.toRecordId);
      const assumptionId = text(transition?.assumptionId);
      const observedAt = timestamp(transition?.observedAt);
      const evidence = refs(transition?.evidenceRefs);
      const sources = refs(transition?.sourceRefs);

      if (!transitionId) reasons.add("TRANSITION_ID_INVALID");
      else if (transitionIds.has(transitionId)) reasons.add("DUPLICATE_TRANSITION_ID");
      else transitionIds.add(transitionId);

      if (!fromRecordId || !toRecordId || !assumptionId || !transitionDecisionId) {
        reasons.add("TRANSITION_BINDING_INVALID");
        continue;
      }
      if (transitionDecisionId !== decisionId) reasons.add("TRANSITION_BINDING_INVALID");
      if (transition.truthState !== "KNOWN") reasons.add("TRANSITION_NOT_KNOWN");
      if (!evidence || evidence.length === 0) reasons.add("TRANSITION_EVIDENCE_MISSING");
      if (!sources || sources.length === 0) reasons.add("TRANSITION_SOURCE_MISSING");
      if (!observedAt) reasons.add("TRANSITION_TIMESTAMP_INVALID");
      if (observedAt && evaluatedAt && maximumSourceAgeMs > 0 && Number.isFinite(maximumSourceAgeMs)) {
        const observedAtMs = Date.parse(observedAt);
        const evaluatedAtMs = Date.parse(evaluatedAt);
        if (observedAtMs > evaluatedAtMs) reasons.add("TRANSITION_FUTURE_DATED");
        if (evaluatedAtMs - observedAtMs > maximumSourceAgeMs) reasons.add("TRANSITION_STALE");
        const fromTime = decidedAtById.get(fromRecordId);
        if (fromTime != null && observedAtMs < fromTime) reasons.add("TRANSITION_PREDATES_SOURCE_RECORD");
      }

      if (evidence) allEvidenceRefs.push(...evidence);
      if (sources) allSourceRefs.push(...sources);
      const edgeKey = `${fromRecordId}\u0000${toRecordId}\u0000${assumptionId}`;
      const bucket = transitionByEdgeAndAssumption.get(edgeKey) ?? [];
      bucket.push(transition);
      transitionByEdgeAndAssumption.set(edgeKey, bucket);
      if (transitionId) validTransitionIds.add(transitionId);
    }
  }

  const history = new Map<string, CompanyBrainAssumptionLineageItemV1>();
  const removedEver = new Set<string>();
  const replacementEdges = new Map<string, string>();
  const replacementTargets = new Set<string>();
  const usedTransitionIds = new Set<string>();
  const unresolvedRemoved = new Set<string>();

  const assumptionMap = (record: DecisionMemoryRecordV1): Map<string, DecisionMemoryRecordV1["assumptions"][number]> =>
    new Map(record.assumptions.map((assumption) => [assumption.assumptionId, assumption]));

  const first = orderedRecords[0];
  if (first) {
    for (const assumption of first.assumptions) {
      const assumptionId = text(assumption.assumptionId);
      const statement = text(assumption.statement.value);
      if (!assumptionId || !statement) continue;
      history.set(assumptionId, {
        assumptionId,
        statement,
        material: assumption.material,
        statementTruthState: assumption.statement.state,
        introducedInRecordId: first.recordId,
        latestRecordId: first.recordId,
        state: "CURRENT",
        replacementAssumptionId: null,
        transitionId: null,
        transitionObservedAt: null,
        evidenceRefs: refs(assumption.statement.evidenceRefs) ?? Object.freeze([]),
        sourceRefs: refs(first.sourceRefs) ?? Object.freeze([]),
        causality: "NOT_ESTABLISHED",
        confidence: "NOT_ESTABLISHED",
        monetaryValue: null,
      });
    }
  }

  for (let index = 1; index < orderedRecords.length; index += 1) {
    const prior = orderedRecords[index - 1];
    const current = orderedRecords[index];
    const priorAssumptions = assumptionMap(prior);
    const currentAssumptions = assumptionMap(current);
    const added = new Set([...currentAssumptions.keys()].filter((id) => !priorAssumptions.has(id)));
    const removed = [...priorAssumptions.keys()].filter((id) => !currentAssumptions.has(id));

    for (const [assumptionId, currentAssumption] of currentAssumptions) {
      const priorAssumption = priorAssumptions.get(assumptionId);
      const statement = text(currentAssumption.statement.value);
      if (!statement) continue;
      if (priorAssumption) {
        if (
          text(priorAssumption.statement.value) !== statement
          || priorAssumption.material !== currentAssumption.material
          || priorAssumption.revisitTrigger !== currentAssumption.revisitTrigger
        ) reasons.add("ASSUMPTION_IDENTITY_DRIFT");
        const existing = history.get(assumptionId);
        if (existing) {
          history.set(assumptionId, {
            ...existing,
            latestRecordId: current.recordId,
            evidenceRefs: unique([...existing.evidenceRefs, ...(refs(currentAssumption.statement.evidenceRefs) ?? [])]),
            sourceRefs: unique([...existing.sourceRefs, ...(refs(current.sourceRefs) ?? [])]),
          });
        }
      } else {
        if (removedEver.has(assumptionId)) reasons.add("RETIRED_ASSUMPTION_REINTRODUCED");
        history.set(assumptionId, {
          assumptionId,
          statement,
          material: currentAssumption.material,
          statementTruthState: currentAssumption.statement.state,
          introducedInRecordId: current.recordId,
          latestRecordId: current.recordId,
          state: "CURRENT",
          replacementAssumptionId: null,
          transitionId: null,
          transitionObservedAt: null,
          evidenceRefs: refs(currentAssumption.statement.evidenceRefs) ?? Object.freeze([]),
          sourceRefs: refs(current.sourceRefs) ?? Object.freeze([]),
          causality: "NOT_ESTABLISHED",
          confidence: "NOT_ESTABLISHED",
          monetaryValue: null,
        });
      }
    }

    for (const assumptionId of removed) {
      removedEver.add(assumptionId);
      const edgeKey = `${prior.recordId}\u0000${current.recordId}\u0000${assumptionId}`;
      const matching = transitionByEdgeAndAssumption.get(edgeKey) ?? [];
      const existing = history.get(assumptionId);
      if (matching.length === 0) {
        reasons.add("REMOVAL_WITHOUT_EXPLICIT_TRANSITION");
        unresolvedRemoved.add(assumptionId);
        if (existing) history.set(assumptionId, { ...existing, latestRecordId: prior.recordId, state: "UNRESOLVED_REMOVAL" });
        continue;
      }
      if (matching.length > 1) {
        reasons.add("DUPLICATE_REMOVAL_TRANSITION");
        unresolvedRemoved.add(assumptionId);
        if (existing) history.set(assumptionId, { ...existing, latestRecordId: prior.recordId, state: "UNRESOLVED_REMOVAL" });
        continue;
      }

      const transition = matching[0];
      const transitionId = text(transition.transitionId);
      if (transitionId) usedTransitionIds.add(transitionId);
      const replacementId = transition.replacementAssumptionId == null
        ? null
        : text(transition.replacementAssumptionId);
      const evidence = refs(transition.evidenceRefs) ?? Object.freeze([]);
      const sources = refs(transition.sourceRefs) ?? Object.freeze([]);
      const observedAt = timestamp(transition.observedAt);

      if (transition.kind === "RETIRED") {
        if (replacementId != null) reasons.add("RETIREMENT_HAS_REPLACEMENT");
        if (existing) {
          history.set(assumptionId, {
            ...existing,
            latestRecordId: prior.recordId,
            state: "EXPLICITLY_RETIRED",
            replacementAssumptionId: null,
            transitionId,
            transitionObservedAt: observedAt,
            evidenceRefs: unique([...existing.evidenceRefs, ...evidence]),
            sourceRefs: unique([...existing.sourceRefs, ...sources]),
          });
        }
      } else if (transition.kind === "REPLACED") {
        if (!replacementId) reasons.add("REPLACEMENT_TARGET_MISSING");
        else {
          if (replacementId === assumptionId) reasons.add("REPLACEMENT_SELF_REFERENCE");
          if (!added.has(replacementId)) reasons.add("REPLACEMENT_TARGET_NOT_ADDED");
          if (replacementTargets.has(replacementId)) reasons.add("REPLACEMENT_TARGET_REUSED");
          replacementTargets.add(replacementId);
          replacementEdges.set(assumptionId, replacementId);
        }
        if (existing) {
          history.set(assumptionId, {
            ...existing,
            latestRecordId: prior.recordId,
            state: "EXPLICITLY_REPLACED",
            replacementAssumptionId: replacementId,
            transitionId,
            transitionObservedAt: observedAt,
            evidenceRefs: unique([...existing.evidenceRefs, ...evidence]),
            sourceRefs: unique([...existing.sourceRefs, ...sources]),
          });
        }
      } else {
        reasons.add("TRANSITION_BINDING_INVALID");
      }
    }
  }

  for (const transitionId of validTransitionIds) {
    if (!usedTransitionIds.has(transitionId)) reasons.add("UNEXPECTED_TRANSITION");
  }
  if (hasReplacementCycle(replacementEdges)) reasons.add("REPLACEMENT_CYCLE");

  const assumptions = [...history.values()].sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
  const state = reasons.size === 0 ? "READY" : "VERIFY_SOURCE";
  const safeAssumptions = state === "READY" ? assumptions : assumptions.map((item) =>
    item.state === "UNRESOLVED_REMOVAL" ? item : item
  );
  const reasonCodes = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const currentAssumptionIds = unique(safeAssumptions.filter((item) => item.state === "CURRENT").map((item) => item.assumptionId));
  const explicitlyRetiredAssumptionIds = unique(safeAssumptions.filter((item) => item.state === "EXPLICITLY_RETIRED").map((item) => item.assumptionId));
  const explicitlyReplacedAssumptionIds = unique(safeAssumptions.filter((item) => item.state === "EXPLICITLY_REPLACED").map((item) => item.assumptionId));

  return deepFreeze({
    contractVersion: COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_ASSUMPTION_LINEAGE_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      decisionId ?? "unknown",
      evaluatedAt ?? "invalid",
      ...sourceRecordIds,
      ...[...transitionIds].sort((a, b) => a.localeCompare(b)),
      ...reasonCodes,
    ]),
    state,
    decisionId,
    evaluatedAt,
    sourceRecordIds: Object.freeze(sourceRecordIds),
    reasonCodes,
    assumptions: Object.freeze(safeAssumptions),
    currentAssumptionIds,
    explicitlyRetiredAssumptionIds,
    explicitlyReplacedAssumptionIds,
    unresolvedRemovedAssumptionIds: unique([...unresolvedRemoved]),
    evidenceRefs: unique(allEvidenceRefs),
    sourceRefs: unique(allSourceRefs),
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    recommendedReplacement: null,
    limitations: LIMITATIONS,
    nextInternalStep: state === "VERIFY_SOURCE" ? "VERIFY_ASSUMPTION_LINEAGE" : null,
    authority: AUTHORITY,
  }) as CompanyBrainAssumptionLineageReviewV1;
}
