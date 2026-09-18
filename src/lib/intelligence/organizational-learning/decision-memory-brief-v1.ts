import { createHash } from "node:crypto";

import type {
  DecisionMemoryRecordV1,
  DecisionMemoryTruthStateV1,
  EvidenceBoundDecisionValueV1
} from "./decision-memory-v1";

export const DECISION_MEMORY_BRIEF_POLICY_VERSION_V1 = "decision_memory_brief_v1.0.0" as const;

export type DecisionMemoryBriefStateV1 =
  | "READY"
  | "REVIEW_REQUIRED"
  | "VERIFY_INTEGRITY"
  | "VERIFY_LINEAGE";

export type DecisionMemoryLineageStateV1 = "NO_PRIOR" | "EXPLICIT" | "UNPROVEN";
export type DecisionMemoryFreshnessStateV1 = "CURRENT" | "NO_EXPIRY" | "EXPIRED" | "FUTURE_RECORD";
export type DecisionMemoryOutcomeStateV1 =
  | "NOT_OBSERVED"
  | "OBSERVED"
  | "OBSERVED_NEEDS_VERIFICATION";

export type DecisionMemoryFieldChangeV1 = {
  field:
    | "SELECTED_ALTERNATIVE"
    | "ACTION_STATE"
    | "APPROVAL_STATE"
    | "RATIONALE"
    | "CONFIDENCE"
    | "OUTCOME_ASSESSMENT"
    | "VALID_UNTIL";
  priorValue: string | null;
  currentValue: string | null;
  evidenceRefs: readonly string[];
  causality: "NOT_ESTABLISHED";
};

export type DecisionMemoryRevisitSignalV1 = {
  kind: "EXPLICIT_TRIGGER" | "MATERIAL_ASSUMPTION" | "VALIDITY_EXPIRED" | "INTEGRITY_FLAG";
  ref: string;
  text: string | null;
  truthState: DecisionMemoryTruthStateV1 | "NOT_APPLICABLE";
  evidenceRefs: readonly string[];
};

export type DecisionMemoryOutcomeBriefV1 = {
  state: DecisionMemoryOutcomeStateV1;
  observedAt: string | null;
  assessment: EvidenceBoundDecisionValueV1<
    "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "INCONCLUSIVE" | "UNKNOWN"
  > | null;
  attributionClass: "CAUSAL" | "CONTRIBUTORY" | "CORRELATIONAL" | "UNKNOWN";
  attributionEvidenceRefs: readonly string[];
  confounderCount: number;
  lessonCandidateReviewRequired: boolean;
  causalityClaimedByBrief: false;
};

export type DecisionMemoryBriefV1 = {
  contractVersion: "DecisionMemoryBriefV1";
  policyVersion: typeof DECISION_MEMORY_BRIEF_POLICY_VERSION_V1;
  briefId: string;
  generatedAt: string;
  state: DecisionMemoryBriefStateV1;
  lineageState: DecisionMemoryLineageStateV1;
  freshnessState: DecisionMemoryFreshnessStateV1;
  decisionId: string;
  decisionClass: DecisionMemoryRecordV1["decisionClass"];
  decidedAt: string;
  selectedAlternativeId: string;
  selectedAlternativeLabel: string | null;
  rationale: DecisionMemoryRecordV1["rationale"];
  confidence: DecisionMemoryRecordV1["confidence"];
  approval: DecisionMemoryRecordV1["approval"];
  actionState: DecisionMemoryRecordV1["actionState"];
  outcome: DecisionMemoryOutcomeBriefV1;
  changesSincePrior: readonly DecisionMemoryFieldChangeV1[];
  revisitSignals: readonly DecisionMemoryRevisitSignalV1[];
  provenanceRefs: readonly string[];
  integrityFlags: readonly string[];
  limitations: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationAuthorized: false;
    spendAuthorized: false;
    publishAuthorized: false;
    approvalBypassAuthorized: false;
  };
};

export class DecisionMemoryBriefError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionMemoryBriefError";
  }
}

const MAX_REFS = 500;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new DecisionMemoryBriefError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  }
  return value.trim();
}

function uniqueRefs(values: readonly string[]): string[] {
  const normalized = [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))]
    .sort((a, b) => a.localeCompare(b));
  if (normalized.length > MAX_REFS) {
    throw new DecisionMemoryBriefError("BOUNDS_EXCEEDED", "decision memory brief provenance exceeds supported bounds");
  }
  return normalized;
}

function boundRefs<T>(bound: EvidenceBoundDecisionValueV1<T> | null | undefined): readonly string[] {
  return bound?.evidenceRefs ?? [];
}

function collectRecordRefs(record: DecisionMemoryRecordV1): string[] {
  const refs: string[] = [
    ...record.sourceRefs,
    ...record.context.evidenceRefs,
    ...record.rationale.evidenceRefs,
    ...record.confidence.evidenceRefs,
    ...record.approval.evidenceRefs,
    ...record.actionEvidenceRefs,
    ...record.alternatives.flatMap((item) => item.description.evidenceRefs),
    ...record.assumptions.flatMap((item) => item.statement.evidenceRefs),
    ...record.expectedOutcomes.flatMap((item) => [
      ...item.description.evidenceRefs,
      ...item.expectedRange.evidenceRefs
    ]),
    ...record.successCriteria.flatMap((item) => item.evidenceRefs),
    ...record.failureCriteria.flatMap((item) => item.evidenceRefs)
  ];

  if (record.outcomeObservation) {
    refs.push(
      ...record.outcomeObservation.sourceRefs,
      ...record.outcomeObservation.assessment.evidenceRefs,
      ...record.outcomeObservation.attributionEvidenceRefs,
      ...record.outcomeObservation.outcomes.flatMap((item) => [
        ...item.description.evidenceRefs,
        ...item.observedRange.evidenceRefs
      ]),
      ...record.outcomeObservation.confounders.flatMap((item) => item.evidenceRefs),
      ...record.outcomeObservation.assumptionAssessments.flatMap((item) => item.evidenceRefs),
      ...(record.outcomeObservation.lessonCandidate?.evidenceRefs ?? [])
    );
  }

  return uniqueRefs(refs);
}

function selectedAlternativeLabel(record: DecisionMemoryRecordV1): string | null {
  return record.alternatives.find((item) => item.alternativeId === record.selectedAlternativeId)?.label ?? null;
}

function explicitLineage(current: DecisionMemoryRecordV1, prior: DecisionMemoryRecordV1): boolean {
  return current.priorRecordId === prior.recordId || current.supersedesDecisionId === prior.decisionId;
}

function change(
  field: DecisionMemoryFieldChangeV1["field"],
  priorValue: string | null,
  currentValue: string | null,
  evidenceRefs: readonly string[]
): DecisionMemoryFieldChangeV1 | null {
  if (priorValue === currentValue) return null;
  return {
    field,
    priorValue,
    currentValue,
    evidenceRefs: uniqueRefs(evidenceRefs),
    causality: "NOT_ESTABLISHED"
  };
}

function outcomeAssessmentValue(record: DecisionMemoryRecordV1): string | null {
  const assessment = record.outcomeObservation?.assessment;
  return assessment?.value ?? null;
}

function buildChanges(
  current: DecisionMemoryRecordV1,
  prior: DecisionMemoryRecordV1 | null,
  lineageState: DecisionMemoryLineageStateV1
): DecisionMemoryFieldChangeV1[] {
  if (!prior || lineageState !== "EXPLICIT") return [];

  const changes = [
    change(
      "SELECTED_ALTERNATIVE",
      prior.selectedAlternativeId,
      current.selectedAlternativeId,
      [
        ...boundRefs(prior.alternatives.find((item) => item.alternativeId === prior.selectedAlternativeId)?.description),
        ...boundRefs(current.alternatives.find((item) => item.alternativeId === current.selectedAlternativeId)?.description)
      ]
    ),
    change("ACTION_STATE", prior.actionState, current.actionState, [
      ...prior.actionEvidenceRefs,
      ...current.actionEvidenceRefs
    ]),
    change("APPROVAL_STATE", prior.approval.approvalState, current.approval.approvalState, [
      ...prior.approval.evidenceRefs,
      ...current.approval.evidenceRefs
    ]),
    change("RATIONALE", prior.rationale.value, current.rationale.value, [
      ...prior.rationale.evidenceRefs,
      ...current.rationale.evidenceRefs
    ]),
    change(
      "CONFIDENCE",
      prior.confidence.value ? `${prior.confidence.state}:${prior.confidence.value}` : `${prior.confidence.state}:UNKNOWN`,
      current.confidence.value ? `${current.confidence.state}:${current.confidence.value}` : `${current.confidence.state}:UNKNOWN`,
      [...prior.confidence.evidenceRefs, ...current.confidence.evidenceRefs]
    ),
    change("OUTCOME_ASSESSMENT", outcomeAssessmentValue(prior), outcomeAssessmentValue(current), [
      ...boundRefs(prior.outcomeObservation?.assessment),
      ...boundRefs(current.outcomeObservation?.assessment)
    ]),
    change("VALID_UNTIL", prior.validUntil, current.validUntil, [])
  ].filter((item): item is DecisionMemoryFieldChangeV1 => item !== null);

  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

function buildRevisitSignals(record: DecisionMemoryRecordV1, expired: boolean): DecisionMemoryRevisitSignalV1[] {
  const signals: DecisionMemoryRevisitSignalV1[] = record.revisitTriggers.map((trigger, index) => ({
    kind: "EXPLICIT_TRIGGER",
    ref: `revisit:${index + 1}`,
    text: trigger,
    truthState: "NOT_APPLICABLE",
    evidenceRefs: []
  }));

  for (const assumption of record.assumptions) {
    if (!assumption.material) continue;
    const assessment = record.outcomeObservation?.assumptionAssessments.find(
      (item) => item.assumptionId === assumption.assumptionId
    );
    const unresolved = assumption.statement.value == null || !assessment || assessment.assessment === "UNRESOLVED";
    const refuted = assessment?.assessment === "REFUTED";
    if (!unresolved && !refuted) continue;
    signals.push({
      kind: "MATERIAL_ASSUMPTION",
      ref: assumption.assumptionId,
      text: assumption.revisitTrigger,
      truthState: assumption.statement.state,
      evidenceRefs: uniqueRefs([
        ...assumption.statement.evidenceRefs,
        ...(assessment?.evidenceRefs ?? [])
      ])
    });
  }

  if (expired && record.validUntil) {
    signals.push({
      kind: "VALIDITY_EXPIRED",
      ref: record.decisionId,
      text: record.validUntil,
      truthState: "NOT_APPLICABLE",
      evidenceRefs: []
    });
  }

  for (const flag of record.integrityFlags) {
    signals.push({
      kind: "INTEGRITY_FLAG",
      ref: flag,
      text: null,
      truthState: "NOT_APPLICABLE",
      evidenceRefs: []
    });
  }

  return signals.sort((a, b) => `${a.kind}:${a.ref}`.localeCompare(`${b.kind}:${b.ref}`));
}

function buildOutcome(record: DecisionMemoryRecordV1): DecisionMemoryOutcomeBriefV1 {
  const observation = record.outcomeObservation;
  if (!observation) {
    return {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    };
  }

  const assessmentDecisionGrade =
    observation.assessment.state === "KNOWN" &&
    observation.assessment.value != null &&
    observation.assessment.evidenceRefs.length > 0;
  const attributionSupported =
    observation.attributionClass === "UNKNOWN" || observation.attributionEvidenceRefs.length > 0;

  return {
    state: assessmentDecisionGrade && attributionSupported ? "OBSERVED" : "OBSERVED_NEEDS_VERIFICATION",
    observedAt: observation.observedAt,
    assessment: observation.assessment,
    attributionClass: observation.attributionClass,
    attributionEvidenceRefs: observation.attributionEvidenceRefs,
    confounderCount: observation.confounders.length,
    lessonCandidateReviewRequired: observation.lessonCandidate?.reviewState === "GOVERNED_REVIEW_REQUIRED",
    causalityClaimedByBrief: false
  };
}

function actionAuthority(): DecisionMemoryBriefV1["actionAuthority"] {
  return {
    analysisOnly: true,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationAuthorized: false,
    spendAuthorized: false,
    publishAuthorized: false,
    approvalBypassAuthorized: false
  };
}

export function compileDecisionMemoryBriefV1(args: {
  record: DecisionMemoryRecordV1;
  priorRecord?: DecisionMemoryRecordV1 | null;
  generatedAt: string;
}): DecisionMemoryBriefV1 {
  if (!args.record || args.record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMemoryBriefError("INVALID_RECORD", "record must be a DecisionMemoryV1 record");
  }
  const generatedAt = timestamp(args.generatedAt, "generatedAt");
  const generatedMs = Date.parse(generatedAt);
  const decisionMs = Date.parse(args.record.decidedAt);
  const prior = args.priorRecord ?? null;

  if (prior && prior.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMemoryBriefError("INVALID_PRIOR_RECORD", "priorRecord must be a DecisionMemoryV1 record");
  }

  const lineageState: DecisionMemoryLineageStateV1 = !prior
    ? "NO_PRIOR"
    : explicitLineage(args.record, prior)
      ? "EXPLICIT"
      : "UNPROVEN";

  const futureDecision = decisionMs > generatedMs;
  const expired = args.record.validUntil != null && Date.parse(args.record.validUntil) < generatedMs;
  const freshnessState: DecisionMemoryFreshnessStateV1 = futureDecision
    ? "FUTURE_RECORD"
    : args.record.validUntil == null
      ? "NO_EXPIRY"
      : expired
        ? "EXPIRED"
        : "CURRENT";

  const outcome = buildOutcome(args.record);
  const outcomeFuture = outcome.observedAt != null && Date.parse(outcome.observedAt) > generatedMs;
  const outcomePredatesDecision = outcome.observedAt != null && Date.parse(outcome.observedAt) < decisionMs;
  const chronologyInvalid = futureDecision || outcomeFuture || outcomePredatesDecision;
  const integrityInvalid = args.record.integrityFlags.length > 0 || outcome.state === "OBSERVED_NEEDS_VERIFICATION";

  const state: DecisionMemoryBriefStateV1 = lineageState === "UNPROVEN"
    ? "VERIFY_LINEAGE"
    : chronologyInvalid || integrityInvalid
      ? "VERIFY_INTEGRITY"
      : expired
        ? "REVIEW_REQUIRED"
        : "READY";

  const limitations = [
    "The brief reports recorded decision facts and explicit changes only; it does not infer why a change occurred.",
    "Outcome chronology and attribution are preserved from the decision record; correlation is not upgraded to causality.",
    "Pricing, negotiation, spend, publishing, persistence, and external execution remain outside this projection."
  ];
  if (lineageState === "UNPROVEN") {
    limitations.push("The supplied prior record is not connected by explicit record or supersession lineage, so change comparison is withheld.");
  }
  if (chronologyInvalid) {
    limitations.push("Decision or outcome chronology conflicts with the briefing timestamp and requires verification.");
  }

  const changesSincePrior = buildChanges(args.record, prior, lineageState);
  const revisitSignals = buildRevisitSignals(args.record, expired);
  const provenanceRefs = uniqueRefs([
    ...collectRecordRefs(args.record),
    ...(prior && lineageState === "EXPLICIT" ? collectRecordRefs(prior) : [])
  ]);

  const identity = {
    generatedAt,
    recordId: args.record.recordId,
    priorRecordId: prior && lineageState === "EXPLICIT" ? prior.recordId : null,
    state,
    changesSincePrior,
    revisitSignals,
    outcome
  };

  const brief: DecisionMemoryBriefV1 = {
    contractVersion: "DecisionMemoryBriefV1",
    policyVersion: DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
    briefId: stableId(identity),
    generatedAt,
    state,
    lineageState,
    freshnessState,
    decisionId: args.record.decisionId,
    decisionClass: args.record.decisionClass,
    decidedAt: args.record.decidedAt,
    selectedAlternativeId: args.record.selectedAlternativeId,
    selectedAlternativeLabel: selectedAlternativeLabel(args.record),
    rationale: args.record.rationale,
    confidence: args.record.confidence,
    approval: args.record.approval,
    actionState: args.record.actionState,
    outcome,
    changesSincePrior,
    revisitSignals,
    provenanceRefs,
    integrityFlags: [...args.record.integrityFlags],
    limitations,
    actionAuthority: actionAuthority()
  };

  return freeze(brief);
}
