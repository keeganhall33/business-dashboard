import type { DecisionDecompositionV1, ValueOfInformationPlanV1 } from "./contracts";

// Phase B micro-slice: deterministic baseline decomposition + VOI plan.
// No external calls. Conservative UNKNOWN. No numeric fake precision.

export type DecisionInputV1 = {
  decisionId: string;
  decisionSummary: string;
  timeHorizon?: DecisionDecompositionV1["timeHorizon"];
  actionabilityThreshold?: DecisionDecompositionV1["actionabilityThreshold"];
  knowns?: Array<{ id: string; question: string; notes?: string | null }>;
  unknowns?: Array<{ id: string; question: string; notes?: string | null; expectedInformationGain?: ValueOfInformationPlanV1["nextMissingFact"]["expectedInformationGain"] }>;
  hypotheses?: Array<{ id: string; hypothesis: string; disconfirmingEvidenceNeeded?: string[] }>;
  marginalValueLow?: boolean;
};

function isoNow(nowIso?: string) {
  return nowIso ?? new Date().toISOString();
}

export function buildDecisionDecompositionV1(input: DecisionInputV1, nowIso?: string): DecisionDecompositionV1 {
  const knowns = (input.knowns ?? []).map((k) => ({ id: k.id, question: k.question, truth: "KNOWN" as const, notes: k.notes ?? null }));
  const unknowns = (input.unknowns ?? []).map((u) => ({ id: u.id, question: u.question, truth: "UNKNOWN" as const, notes: u.notes ?? null }));

  const subQuestions = [
    ...knowns.map((k) => ({ ...k })),
    ...unknowns.map((u) => ({ ...u }))
  ];

  const hypotheses = (input.hypotheses ?? []).map((h) => ({
    id: h.id,
    hypothesis: h.hypothesis,
    status: "candidate" as const,
    disconfirmingEvidenceNeeded: [...new Set(h.disconfirmingEvidenceNeeded ?? [])]
  }));

  return {
    v: "DecisionDecompositionV1",
    generatedAt: isoNow(nowIso),
    decisionId: input.decisionId,
    decisionSummary: input.decisionSummary,
    timeHorizon: input.timeHorizon ?? "unknown",
    actionabilityThreshold: input.actionabilityThreshold ?? "unknown",
    knowns,
    unknowns,
    subQuestions,
    hypotheses
  };
}

export function buildValueOfInformationPlanV1(decomp: DecisionDecompositionV1, options?: { marginalValueLow?: boolean; nowIso?: string }): ValueOfInformationPlanV1 {
  const now = isoNow(options?.nowIso);
  const unknowns = decomp.unknowns ?? [];
  if (!unknowns.length) {
    return {
      v: "ValueOfInformationPlanV1",
      generatedAt: now,
      decisionId: decomp.decisionId,
      nextMissingFact: null,
      stop: { shouldStop: true, reason: "no_unknowns", note: null }
    };
  }

  if (options?.marginalValueLow) {
    return {
      v: "ValueOfInformationPlanV1",
      generatedAt: now,
      decisionId: decomp.decisionId,
      nextMissingFact: null,
      stop: { shouldStop: true, reason: "marginal_value_low", note: "Marginal value of additional research is low for this decision." }
    };
  }

  // Deterministic selection: choose first unknown by id ordering.
  const next = [...unknowns].sort((a, b) => a.id.localeCompare(b.id))[0];
  return {
    v: "ValueOfInformationPlanV1",
    generatedAt: now,
    decisionId: decomp.decisionId,
    nextMissingFact: {
      id: next.id,
      question: next.question,
      expectedInformationGain: "unknown",
      rationale: "Selected first UNKNOWN fact deterministically to avoid fake precision; refine expectedInformationGain in later slices."
    },
    stop: { shouldStop: false, reason: "unknown", note: null }
  };
}

