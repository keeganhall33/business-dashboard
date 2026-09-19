export const COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_VERSION_V1 =
  "CompanyBrainCorrectionDestinationPlanV1" as const;
export const COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_POLICY_VERSION_V1 =
  "company_brain_correction_destination_plan_v1.0.0" as const;
export const MAX_CORRECTION_DESTINATION_EVIDENCE_REFS_V1 = 100;
export const MAX_CORRECTION_DESTINATION_AFFECTED_REFS_V1 = 50;

export const companyBrainCorrectionClassesV1 = [
  "MISSING_OR_WRONG_FACT",
  "STRATEGIC_CHOICE_OR_WHY",
  "REPEATED_PREFERENCE_OR_STANDARD",
  "PROVEN_TECHNIQUE",
  "REPEATABLE_SEQUENCE",
  "DANGEROUS_ACTION_OR_NEVER_DO",
  "PROMPT_AGENT_WORKFLOW_FAILURE",
  "VALIDATED_LESSON"
] as const;

export type CompanyBrainCorrectionClassV1 =
  (typeof companyBrainCorrectionClassesV1)[number];
export type CompanyBrainCorrectionTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";
export type CompanyBrainCorrectionDestinationV1 =
  | "CANONICAL_EVIDENCE_CORRECTION_REVIEW"
  | "DECISION_MEMORY_REVIEW"
  | "PREFERENCE_POLICY_REVIEW"
  | "SKILL_PLAYBOOK_REVIEW"
  | "AUTOMATION_CANDIDATE_REVIEW"
  | "SAFETY_POLICY_AND_APPROVAL_GATE_REVIEW"
  | "EVAL_REGRESSION_REVIEW"
  | "LEARNING_REVIEW";

export type CompanyBrainCorrectionDestinationInputV1 = Readonly<{
  correctionId: string;
  correctionClass: CompanyBrainCorrectionClassV1 | string;
  truthState: CompanyBrainCorrectionTruthStateV1;
  sourceInteractionRef: string;
  sourceRunRef: string | null;
  actorRef: string;
  observedAt: string;
  generatedAt: string;
  originalState: string | null;
  proposedState: string;
  evidenceRefs: readonly string[];
  affectedCanonicalRefs: readonly string[];
}>;

export type CompanyBrainCorrectionDestinationPlanV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_POLICY_VERSION_V1;
  status: "ROUTE_FOR_REVIEW" | "WITHHELD";
  correctionId: string | null;
  correctionClass: CompanyBrainCorrectionClassV1 | null;
  truthState: CompanyBrainCorrectionTruthStateV1 | null;
  destination: CompanyBrainCorrectionDestinationV1 | null;
  reasonCode:
    | "SUPPORTED_PRECLASSIFIED_CORRECTION"
    | "UNSUPPORTED_CORRECTION_CLASS"
    | "UNKNOWN_CORRECTION"
    | "STALE_CORRECTION"
    | "CONFLICTED_CORRECTION"
    | "MISSING_EVIDENCE"
    | "MISSING_AFFECTED_SCOPE"
    | "FUTURE_CORRECTION"
    | "INVALID_INPUT";
  sourceInteractionRef: string | null;
  sourceRunRef: string | null;
  actorRef: string | null;
  observedAt: string | null;
  originalState: string | null;
  proposedState: string | null;
  evidenceRefs: readonly string[];
  affectedCanonicalRefs: readonly string[];
  safeNextStep:
    | "PREPARE_EVIDENCE_CORRECTION_REVIEW"
    | "PREPARE_DECISION_MEMORY_REVIEW"
    | "PREPARE_PREFERENCE_POLICY_REVIEW"
    | "PREPARE_SKILL_PLAYBOOK_REVIEW"
    | "PREPARE_AUTOMATION_CANDIDATE_REVIEW"
    | "PREPARE_SAFETY_POLICY_REVIEW"
    | "PREPARE_EVAL_REGRESSION_REVIEW"
    | "PREPARE_LEARNING_REVIEW"
    | null;
  canonicalPromotionRequiresGovernedReview: true;
  consequentialEffectRequiresExistingApprovalPolicy: true;
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    canonicalTruthMutationAuthorized: false;
    decisionMutationAuthorized: false;
    preferenceMutationAuthorized: false;
    policyMutationAuthorized: false;
    skillPromotionAuthorized: false;
    automationCreationAuthorized: false;
    evalMutationAuthorized: false;
    approvalGateMutationAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  canonicalTruthMutationAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  preferenceMutationAuthorized: false as const,
  policyMutationAuthorized: false as const,
  skillPromotionAuthorized: false as const,
  automationCreationAuthorized: false as const,
  evalMutationAuthorized: false as const,
  approvalGateMutationAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const ROUTES: Readonly<Record<CompanyBrainCorrectionClassV1, Readonly<{
  destination: CompanyBrainCorrectionDestinationV1;
  safeNextStep: Exclude<CompanyBrainCorrectionDestinationPlanV1["safeNextStep"], null>;
}>>> = Object.freeze({
  MISSING_OR_WRONG_FACT: Object.freeze({
    destination: "CANONICAL_EVIDENCE_CORRECTION_REVIEW",
    safeNextStep: "PREPARE_EVIDENCE_CORRECTION_REVIEW"
  }),
  STRATEGIC_CHOICE_OR_WHY: Object.freeze({
    destination: "DECISION_MEMORY_REVIEW",
    safeNextStep: "PREPARE_DECISION_MEMORY_REVIEW"
  }),
  REPEATED_PREFERENCE_OR_STANDARD: Object.freeze({
    destination: "PREFERENCE_POLICY_REVIEW",
    safeNextStep: "PREPARE_PREFERENCE_POLICY_REVIEW"
  }),
  PROVEN_TECHNIQUE: Object.freeze({
    destination: "SKILL_PLAYBOOK_REVIEW",
    safeNextStep: "PREPARE_SKILL_PLAYBOOK_REVIEW"
  }),
  REPEATABLE_SEQUENCE: Object.freeze({
    destination: "AUTOMATION_CANDIDATE_REVIEW",
    safeNextStep: "PREPARE_AUTOMATION_CANDIDATE_REVIEW"
  }),
  DANGEROUS_ACTION_OR_NEVER_DO: Object.freeze({
    destination: "SAFETY_POLICY_AND_APPROVAL_GATE_REVIEW",
    safeNextStep: "PREPARE_SAFETY_POLICY_REVIEW"
  }),
  PROMPT_AGENT_WORKFLOW_FAILURE: Object.freeze({
    destination: "EVAL_REGRESSION_REVIEW",
    safeNextStep: "PREPARE_EVAL_REGRESSION_REVIEW"
  }),
  VALIDATED_LESSON: Object.freeze({
    destination: "LEARNING_REVIEW",
    safeNextStep: "PREPARE_LEARNING_REVIEW"
  })
});

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function uniqueRefs(value: unknown, maximum: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function isSupportedClass(value: unknown): value is CompanyBrainCorrectionClassV1 {
  return typeof value === "string"
    && companyBrainCorrectionClassesV1.includes(value as CompanyBrainCorrectionClassV1);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function withheld(
  reasonCode: CompanyBrainCorrectionDestinationPlanV1["reasonCode"],
  input?: CompanyBrainCorrectionDestinationInputV1,
  evidenceRefs: readonly string[] = [],
  affectedCanonicalRefs: readonly string[] = []
): CompanyBrainCorrectionDestinationPlanV1 {
  return deepFreeze({
    contractVersion: COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_VERSION_V1,
    policyVersion: COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_POLICY_VERSION_V1,
    status: "WITHHELD" as const,
    correctionId: text(input?.correctionId) ?? null,
    correctionClass: isSupportedClass(input?.correctionClass) ? input!.correctionClass : null,
    truthState: input?.truthState ?? null,
    destination: null,
    reasonCode,
    sourceInteractionRef: text(input?.sourceInteractionRef) ?? null,
    sourceRunRef: text(input?.sourceRunRef) ?? null,
    actorRef: text(input?.actorRef) ?? null,
    observedAt: validTimestamp(input?.observedAt) ? input!.observedAt : null,
    originalState: input?.originalState == null ? null : text(input.originalState),
    proposedState: text(input?.proposedState),
    evidenceRefs,
    affectedCanonicalRefs,
    safeNextStep: null,
    canonicalPromotionRequiresGovernedReview: true as const,
    consequentialEffectRequiresExistingApprovalPolicy: true as const,
    authority: AUTHORITY
  });
}

export function planCompanyBrainCorrectionDestinationV1(
  input: CompanyBrainCorrectionDestinationInputV1
): CompanyBrainCorrectionDestinationPlanV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return withheld("INVALID_INPUT");
  }

  const evidenceRefs = uniqueRefs(input.evidenceRefs, MAX_CORRECTION_DESTINATION_EVIDENCE_REFS_V1);
  const affectedCanonicalRefs = uniqueRefs(
    input.affectedCanonicalRefs,
    MAX_CORRECTION_DESTINATION_AFFECTED_REFS_V1
  );
  if (!evidenceRefs || !affectedCanonicalRefs) {
    return withheld("INVALID_INPUT", input);
  }
  if (!isSupportedClass(input.correctionClass)) {
    return withheld("UNSUPPORTED_CORRECTION_CLASS", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (input.truthState === "UNKNOWN") {
    return withheld("UNKNOWN_CORRECTION", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (input.truthState === "STALE") {
    return withheld("STALE_CORRECTION", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (input.truthState === "CONFLICTED") {
    return withheld("CONFLICTED_CORRECTION", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (evidenceRefs.length === 0) {
    return withheld("MISSING_EVIDENCE", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (affectedCanonicalRefs.length === 0) {
    return withheld("MISSING_AFFECTED_SCOPE", input, evidenceRefs, affectedCanonicalRefs);
  }

  const correctionId = text(input.correctionId);
  const sourceInteractionRef = text(input.sourceInteractionRef);
  const actorRef = text(input.actorRef);
  const proposedState = text(input.proposedState);
  if (
    !correctionId
    || !sourceInteractionRef
    || !actorRef
    || !proposedState
    || !validTimestamp(input.observedAt)
    || !validTimestamp(input.generatedAt)
  ) {
    return withheld("INVALID_INPUT", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (Date.parse(input.observedAt) > Date.parse(input.generatedAt)) {
    return withheld("FUTURE_CORRECTION", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (input.originalState != null && !text(input.originalState)) {
    return withheld("INVALID_INPUT", input, evidenceRefs, affectedCanonicalRefs);
  }
  if (input.sourceRunRef != null && !text(input.sourceRunRef)) {
    return withheld("INVALID_INPUT", input, evidenceRefs, affectedCanonicalRefs);
  }

  const route = ROUTES[input.correctionClass];
  return deepFreeze({
    contractVersion: COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_VERSION_V1,
    policyVersion: COMPANY_BRAIN_CORRECTION_DESTINATION_PLAN_POLICY_VERSION_V1,
    status: "ROUTE_FOR_REVIEW" as const,
    correctionId,
    correctionClass: input.correctionClass,
    truthState: input.truthState,
    destination: route.destination,
    reasonCode: "SUPPORTED_PRECLASSIFIED_CORRECTION" as const,
    sourceInteractionRef,
    sourceRunRef: text(input.sourceRunRef),
    actorRef,
    observedAt: input.observedAt,
    originalState: input.originalState == null ? null : input.originalState.trim(),
    proposedState,
    evidenceRefs,
    affectedCanonicalRefs,
    safeNextStep: route.safeNextStep,
    canonicalPromotionRequiresGovernedReview: true as const,
    consequentialEffectRequiresExistingApprovalPolicy: true as const,
    authority: AUTHORITY
  });
}
