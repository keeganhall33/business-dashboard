import { DECISION_PRECEDENT_VERSION_V1, type DecisionPrecedentEvidenceV1, type DecisionPrecedentV1 } from "@/lib/executive-memory/contracts";
import type {
  DecisionMemoryRecordV1,
  DecisionMemoryTruthStateV1,
  EvidenceBoundDecisionValueV1
} from "./decision-memory-v1";

export const DECISION_MEMORY_PRECEDENT_POLICY_VERSION_V1 = "decision_memory_precedent_v1.0.0" as const;

export type DecisionMemoryPrecedentProjectionStateV1 = "READY" | "VERIFY_RECORD";

export type DecisionMemoryContextTagV1 = {
  tag: string;
  state: DecisionMemoryTruthStateV1;
  evidenceRefs: readonly string[];
};

export type DecisionMemoryPrecedentProjectionV1 = {
  contractVersion: "DecisionMemoryPrecedentProjectionV1";
  policyVersion: typeof DECISION_MEMORY_PRECEDENT_POLICY_VERSION_V1;
  state: DecisionMemoryPrecedentProjectionStateV1;
  generatedAt: string;
  sourceRecordId: string;
  sourceDecisionId: string;
  precedent: DecisionPrecedentV1 | null;
  omittedContextTags: readonly {
    tag: string;
    reason: "NOT_KNOWN" | "MISSING_EVIDENCE";
  }[];
  limitations: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationAuthorized: false;
    preferencePromotionAuthorized: false;
    policyPromotionAuthorized: false;
    approvalBypassAuthorized: false;
  };
};

type EvidenceUse = {
  ref: string;
  state: DecisionMemoryTruthStateV1;
  field: string;
};

export class DecisionMemoryPrecedentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionMemoryPrecedentError";
  }
}

const MAX_CONTEXT_TAGS = 100;
const MAX_TEXT = 1_000;

function required(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionMemoryPrecedentError("REQUIRED_FIELD", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new DecisionMemoryPrecedentError("BOUNDS_EXCEEDED", `${label} exceeds ${max} characters`);
  }
  return normalized;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const normalized = required(value, label, 128);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new DecisionMemoryPrecedentError("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return normalized;
}

function refs(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))]
    .sort((a, b) => a.localeCompare(b));
}

function actionAuthority(): DecisionMemoryPrecedentProjectionV1["actionAuthority"] {
  return {
    analysisOnly: true,
    persistenceAuthorized: false,
    externalActionAuthorized: false,
    pricingChangeAuthorized: false,
    negotiationAuthorized: false,
    preferencePromotionAuthorized: false,
    policyPromotionAuthorized: false,
    approvalBypassAuthorized: false
  };
}

function evidenceTruthState(states: readonly DecisionMemoryTruthStateV1[]): DecisionPrecedentEvidenceV1["truth_state"] {
  if (states.includes("CONFLICTED")) return "CONFLICTED";
  if (states.includes("STALE") || states.includes("UNKNOWN")) return "UNKNOWN";
  if (states.includes("INFERRED")) return "INFERRED";
  return "KNOWN";
}

function evidenceInventory(uses: readonly EvidenceUse[]): DecisionPrecedentEvidenceV1[] {
  const grouped = new Map<string, EvidenceUse[]>();
  for (const use of uses) {
    if (!use.ref.trim()) continue;
    const ref = use.ref.trim();
    grouped.set(ref, [...(grouped.get(ref) ?? []), { ...use, ref }]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([evidenceId, items]) => ({
      evidence_id: evidenceId,
      label: evidenceId,
      truth_state: evidenceTruthState(items.map((item) => item.state)),
      notes: `Referenced by canonical decision memory field(s): ${[
        ...new Set(items.map((item) => item.field))
      ].sort().join(", ")}.`
    }));
}

function addBoundEvidence<T>(
  uses: EvidenceUse[],
  field: string,
  value: EvidenceBoundDecisionValueV1<T> | null | undefined
): void {
  if (!value) return;
  for (const ref of value.evidenceRefs) uses.push({ ref, state: value.state, field });
}

function knownText(value: EvidenceBoundDecisionValueV1<string>): string | null {
  if (value.state !== "KNOWN" || value.value == null || value.evidenceRefs.length === 0) return null;
  return value.value;
}

function outcomeSummary(record: DecisionMemoryRecordV1, evidenceUses: EvidenceUse[]): {
  summary: string;
  evidenceRefs: string[];
} {
  const observation = record.outcomeObservation;
  if (!observation) return { summary: "UNKNOWN", evidenceRefs: [] };

  const descriptions: string[] = [];
  const outcomeRefs: string[] = [];
  for (const outcome of observation.outcomes) {
    addBoundEvidence(evidenceUses, `outcome:${outcome.outcomeId}:description`, outcome.description);
    addBoundEvidence(evidenceUses, `outcome:${outcome.outcomeId}:observedRange`, outcome.observedRange);
    const description = knownText(outcome.description);
    if (!description) continue;
    descriptions.push(description);
    outcomeRefs.push(...outcome.description.evidenceRefs);
  }
  addBoundEvidence(evidenceUses, "outcome:assessment", observation.assessment);
  for (const ref of observation.attributionEvidenceRefs) {
    evidenceUses.push({ ref, state: "KNOWN", field: "outcome:attribution" });
  }
  for (const confounder of observation.confounders) {
    for (const ref of confounder.evidenceRefs) {
      evidenceUses.push({ ref, state: "KNOWN", field: `outcome:confounder:${confounder.confounderId}` });
    }
  }

  return {
    summary: descriptions.length > 0 ? descriptions.join(" ") : "UNKNOWN",
    evidenceRefs: refs(outcomeRefs)
  };
}

function normalizeContextTags(
  record: DecisionMemoryRecordV1,
  tags: readonly DecisionMemoryContextTagV1[],
  evidenceUses: EvidenceUse[]
): {
  included: string[];
  omitted: DecisionMemoryPrecedentProjectionV1["omittedContextTags"];
} {
  if (tags.length > MAX_CONTEXT_TAGS) {
    throw new DecisionMemoryPrecedentError(
      "BOUNDS_EXCEEDED",
      `context tags are bounded to ${MAX_CONTEXT_TAGS}`
    );
  }

  const included = new Set<string>([`decision-class:${record.decisionClass.toLowerCase()}`]);
  const omitted: Array<{ tag: string; reason: "NOT_KNOWN" | "MISSING_EVIDENCE" }> = [];
  const seen = new Set<string>();

  for (const item of tags) {
    const tag = required(item.tag, "contextTag.tag", 256).toLowerCase();
    if (seen.has(tag)) {
      throw new DecisionMemoryPrecedentError("DUPLICATE_CONTEXT_TAG", `duplicate context tag ${tag}`);
    }
    seen.add(tag);
    if (item.state !== "KNOWN") {
      omitted.push({ tag, reason: "NOT_KNOWN" });
      continue;
    }
    const evidenceRefs = refs(item.evidenceRefs);
    if (evidenceRefs.length === 0) {
      omitted.push({ tag, reason: "MISSING_EVIDENCE" });
      continue;
    }
    included.add(tag);
    for (const ref of evidenceRefs) {
      evidenceUses.push({ ref, state: "KNOWN", field: `context-tag:${tag}` });
    }
  }

  return {
    included: [...included].sort((a, b) => a.localeCompare(b)),
    omitted: omitted.sort((a, b) => a.tag.localeCompare(b.tag))
  };
}

function isChronologyValid(record: DecisionMemoryRecordV1, generatedAt: string): boolean {
  const generatedMs = Date.parse(generatedAt);
  const decidedMs = Date.parse(record.decidedAt);
  if (!Number.isFinite(decidedMs) || decidedMs > generatedMs) return false;
  if (!record.outcomeObservation) return true;
  const observedMs = Date.parse(record.outcomeObservation.observedAt);
  return Number.isFinite(observedMs) && observedMs >= decidedMs && observedMs <= generatedMs;
}

function projectPrecedent(
  record: DecisionMemoryRecordV1,
  generatedAt: string,
  contextTags: readonly DecisionMemoryContextTagV1[]
): {
  precedent: DecisionPrecedentV1;
  omittedContextTags: DecisionMemoryPrecedentProjectionV1["omittedContextTags"];
} {
  const evidenceUses: EvidenceUse[] = [];
  addBoundEvidence(evidenceUses, "context", record.context);
  addBoundEvidence(evidenceUses, "rationale", record.rationale);
  addBoundEvidence(evidenceUses, "confidence", record.confidence);

  const chosen = record.alternatives.find((item) => item.alternativeId === record.selectedAlternativeId);
  if (!chosen) {
    throw new DecisionMemoryPrecedentError(
      "SELECTED_ALTERNATIVE_MISSING",
      "selected alternative must exist before precedent projection"
    );
  }

  const options = record.alternatives.map((alternative) => {
    addBoundEvidence(evidenceUses, `alternative:${alternative.alternativeId}`, alternative.description);
    return {
      option_id: alternative.alternativeId,
      label: alternative.label,
      was_chosen: alternative.alternativeId === record.selectedAlternativeId,
      tradeoff: knownText(alternative.description) ?? "UNKNOWN"
    };
  });

  const assumptions = record.assumptions
    .filter(
      (assumption) =>
        assumption.statement.state === "KNOWN" &&
        assumption.statement.value != null &&
        assumption.statement.evidenceRefs.length > 0
    )
    .map((assumption) => {
      addBoundEvidence(evidenceUses, `assumption:${assumption.assumptionId}`, assumption.statement);
      return assumption.statement.value as string;
    })
    .sort((a, b) => a.localeCompare(b));

  const normalizedTags = normalizeContextTags(record, contextTags, evidenceUses);
  const outcome = outcomeSummary(record, evidenceUses);

  const precedent: DecisionPrecedentV1 = {
    contract_version: DECISION_PRECEDENT_VERSION_V1,
    DECISION_ID: record.decisionId,
    decided_at: record.decidedAt,
    decision_title: knownText(record.context) ?? `${record.decisionClass} decision`,
    CONTEXT_TAGS: normalizedTags.included,
    OPTIONS_CONSIDERED: options,
    CHOSEN_ACTION: chosen.label,
    KEY_EVIDENCE: evidenceInventory(evidenceUses),
    KEY_ASSUMPTIONS: assumptions,
    OUTCOME: {
      status: "UNKNOWN",
      summary: outcome.summary,
      evidence_refs: outcome.evidenceRefs
    },
    ATTRIBUTION_CONFIDENCE: "UNKNOWN",
    LESSON: "UNKNOWN",
    PREFERENCE_SIGNAL_CLASS: "WEAK_SIGNAL_ONLY"
  };

  return { precedent, omittedContextTags: normalizedTags.omitted };
}

export function compileDecisionMemoryPrecedentV1(args: {
  record: DecisionMemoryRecordV1;
  generatedAt: string;
  contextTags?: readonly DecisionMemoryContextTagV1[];
}): DecisionMemoryPrecedentProjectionV1 {
  if (!args.record || args.record.contractVersion !== "DecisionMemoryV1") {
    throw new DecisionMemoryPrecedentError("INVALID_RECORD", "record must be DecisionMemoryV1");
  }
  const generatedAt = canonicalTimestamp(args.generatedAt, "generatedAt");
  const contextTags = args.contextTags ?? [];

  const limitations = [
    "The projection carries only facts already present in canonical decision memory plus explicitly evidence-bound KNOWN context tags.",
    "Outcome status remains UNKNOWN because DecisionMemoryV1 does not encode an explicit precedent success/failure status.",
    "Attribution confidence remains UNKNOWN because attribution class is not converted into confidence.",
    "Governed lesson candidates are not promoted into precedent lessons; LESSON remains UNKNOWN until a separate reviewed learning contract authorizes promotion.",
    "A single decision never becomes a preference rule; the precedent is classified WEAK_SIGNAL_ONLY."
  ];

  if (args.record.integrityFlags.length > 0 || !isChronologyValid(args.record, generatedAt)) {
    return Object.freeze({
      contractVersion: "DecisionMemoryPrecedentProjectionV1" as const,
      policyVersion: DECISION_MEMORY_PRECEDENT_POLICY_VERSION_V1,
      state: "VERIFY_RECORD" as const,
      generatedAt,
      sourceRecordId: args.record.recordId,
      sourceDecisionId: args.record.decisionId,
      precedent: null,
      omittedContextTags: [],
      limitations: Object.freeze([
        ...limitations,
        "Canonical decision-memory integrity or chronology requires verification before this record can enter precedent retrieval."
      ]),
      actionAuthority: Object.freeze(actionAuthority())
    });
  }

  const projection = projectPrecedent(args.record, generatedAt, contextTags);
  return Object.freeze({
    contractVersion: "DecisionMemoryPrecedentProjectionV1" as const,
    policyVersion: DECISION_MEMORY_PRECEDENT_POLICY_VERSION_V1,
    state: "READY" as const,
    generatedAt,
    sourceRecordId: args.record.recordId,
    sourceDecisionId: args.record.decisionId,
    precedent: Object.freeze(projection.precedent),
    omittedContextTags: Object.freeze([...projection.omittedContextTags]),
    limitations: Object.freeze(limitations),
    actionAuthority: Object.freeze(actionAuthority())
  });
}
