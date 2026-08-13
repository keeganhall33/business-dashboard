export type TruthStateV1 = "KNOWN" | "UNKNOWN";

export type DecisionQuestionV1 = {
  id: string;
  question: string;
  truth: TruthStateV1;
  notes?: string | null;
};

export type HypothesisV1 = {
  id: string;
  hypothesis: string;
  status: "candidate" | "supported" | "disconfirmed" | "inconclusive";
  disconfirmingEvidenceNeeded: string[];
};

export type DecisionDecompositionV1 = {
  v: "DecisionDecompositionV1";
  generatedAt: string;
  decisionId: string;
  decisionSummary: string;

  timeHorizon: "now" | "7d" | "30d" | "90d" | "unknown";
  actionabilityThreshold: "low" | "medium" | "high" | "unknown";

  knowns: DecisionQuestionV1[];
  unknowns: DecisionQuestionV1[];
  subQuestions: DecisionQuestionV1[];

  hypotheses: HypothesisV1[];
};

export type ExpectedInformationGainV1 = "high" | "medium" | "low" | "unknown";

export type ValueOfInformationPlanV1 = {
  v: "ValueOfInformationPlanV1";
  generatedAt: string;
  decisionId: string;

  // Select exactly one next missing fact to pursue in this micro-slice.
  nextMissingFact: {
    id: string;
    question: string;
    expectedInformationGain: ExpectedInformationGainV1;
    rationale: string;
  } | null;

  stop: {
    shouldStop: boolean;
    reason: "no_unknowns" | "marginal_value_low" | "blocked" | "unknown";
    note?: string | null;
  };
};

