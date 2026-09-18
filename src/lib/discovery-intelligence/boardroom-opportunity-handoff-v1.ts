import {
  BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION,
  type BoardroomOpportunityClassifierResultV1,
  type BoardroomOpportunityDecisionV1,
  type BoardroomDispositionV1,
  type BoardroomInternalActionV1,
  type BoardroomTruthStateV1
} from "./boardroom-opportunity-classifier-v1";
import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffQualificationV1,
  type OpportunityImportHandoffResultV1
} from "../relationships-crm/opportunity-import-handoff-v1";

export const BOARDROOM_OPPORTUNITY_HANDOFF_VERSION = "BOARDROOM_OPPORTUNITY_HANDOFF_V1" as const;

export type BoardroomOpportunityBridgeDispositionV1 =
  | "SUPPRESS"
  | "WATCH_ONLY"
  | "NEEDS_RESEARCH"
  | "NEEDS_VERIFICATION"
  | "LINK_TO_EXISTING";

export type BoardroomOpportunityBridgeItemV1 = Readonly<{
  storyId: string;
  sourceRef: string;
  classificationDisposition: BoardroomDispositionV1;
  bridgeDisposition: BoardroomOpportunityBridgeDispositionV1;
  evidenceState: BoardroomTruthStateV1;
  evidenceRefs: readonly string[];
  organizationRefs: readonly string[];
  unmappedEntityRefs: readonly string[];
  existingOpportunityRef: string | null;
  researchQuestions: readonly string[];
  reasonCodes: readonly string[];
  handoff: OpportunityImportHandoffResultV1 | null;
}>;

export type BoardroomOpportunityHandoffInputV1 = {
  classification: BoardroomOpportunityClassifierResultV1;
};

export type BoardroomOpportunityHandoffResultV1 = Readonly<{
  version: typeof BOARDROOM_OPPORTUNITY_HANDOFF_VERSION;
  classifierVersion: typeof BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION;
  items: readonly BoardroomOpportunityBridgeItemV1[];
  counts: Readonly<{
    reviewed: number;
    suppressed: number;
    watchOnly: number;
    needsResearch: number;
    needsVerification: number;
    linkedToExisting: number;
  }>;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAX_DECISIONS = 500;
const TRUTH_STATES = new Set<BoardroomTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const DISPOSITIONS = new Set<BoardroomDispositionV1>([
  "IGNORE",
  "WATCH",
  "CANDIDATE",
  "QUALIFIED_FOR_RESEARCH"
]);
const ACTIONS = new Set<BoardroomInternalActionV1>(["IGNORE", "WATCH", "RESEARCH", "LINK_TO_EXISTING"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function textList(value: unknown, label: string, required = false): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (required && normalized.length === 0) throw new Error(`${label} must not be empty`);
  return Object.freeze(normalized);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function uniqueReasons(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function validateDecision(decision: BoardroomOpportunityDecisionV1, index: number) {
  if (!isPlainObject(decision)) throw new Error(`classification.decisions[${index}] must be a plain object`);
  const storyId = requiredText(decision.storyId, `classification.decisions[${index}].storyId`);
  const sourceRef = requiredText(decision.sourceRef, `classification.decisions[${index}].sourceRef`);
  const title = requiredText(decision.title, `classification.decisions[${index}].title`);
  const evidenceRefs = textList(decision.evidenceRefs, `classification.decisions[${index}].evidenceRefs`, true);
  const organizationRefs = textList(decision.organizationRefs, `classification.decisions[${index}].organizationRefs`);
  const entityRefs = textList(decision.entityRefs, `classification.decisions[${index}].entityRefs`);
  const researchQuestions = textList(decision.researchQuestions, `classification.decisions[${index}].researchQuestions`);
  const existingOpportunityRef = optionalText(
    decision.existingOpportunityRef,
    `classification.decisions[${index}].existingOpportunityRef`
  );
  const duplicateOfStoryId = optionalText(
    decision.duplicateOfStoryId,
    `classification.decisions[${index}].duplicateOfStoryId`
  );

  if (!TRUTH_STATES.has(decision.evidenceState)) {
    throw new Error(`classification.decisions[${index}].evidenceState is unsupported`);
  }
  if (!DISPOSITIONS.has(decision.disposition)) {
    throw new Error(`classification.decisions[${index}].disposition is unsupported`);
  }
  if (!ACTIONS.has(decision.recommendedAction)) {
    throw new Error(`classification.decisions[${index}].recommendedAction is unsupported`);
  }

  return {
    storyId,
    sourceRef,
    title,
    evidenceRefs,
    organizationRefs,
    entityRefs,
    researchQuestions,
    existingOpportunityRef,
    duplicateOfStoryId,
    evidenceState: decision.evidenceState,
    disposition: decision.disposition,
    recommendedAction: decision.recommendedAction
  } as const;
}

function mapQualification(decision: ReturnType<typeof validateDecision>): Readonly<{
  qualification: OpportunityHandoffQualificationV1;
  reasonCodes: readonly string[];
}> {
  const reasons: string[] = [];

  if (decision.disposition === "WATCH") {
    return { qualification: "WATCH", reasonCodes: Object.freeze(["CLASSIFIER_WATCH_REMAINS_WATCH"]) };
  }

  if (decision.disposition === "QUALIFIED_FOR_RESEARCH") {
    return {
      qualification: "CANDIDATE",
      reasonCodes: Object.freeze([
        "RESEARCH_QUALIFICATION_IS_NOT_CANONICAL_QUALIFICATION",
        "RESEARCH_REQUIRED_BEFORE_CANONICAL_OPPORTUNITY"
      ])
    };
  }

  if (
    decision.disposition === "CANDIDATE" &&
    decision.recommendedAction === "LINK_TO_EXISTING" &&
    decision.existingOpportunityRef != null &&
    decision.evidenceState === "KNOWN"
  ) {
    return {
      qualification: "QUALIFIED",
      reasonCodes: Object.freeze(["EXPLICIT_EXISTING_OPPORTUNITY_LINK_ONLY"])
    };
  }

  if (decision.recommendedAction === "LINK_TO_EXISTING" && decision.existingOpportunityRef == null) {
    reasons.push("LINK_ACTION_WITHOUT_EXPLICIT_OPPORTUNITY_REF");
  }
  if (decision.recommendedAction === "LINK_TO_EXISTING" && decision.evidenceState !== "KNOWN") {
    reasons.push("LINK_ACTION_REQUIRES_KNOWN_EVIDENCE");
  }
  reasons.push("SOURCE_REMAINS_CANDIDATE_PENDING_VERIFICATION_OR_RESEARCH");
  return { qualification: "CANDIDATE", reasonCodes: uniqueReasons(reasons) };
}

function bridgeDispositionFor(
  decision: ReturnType<typeof validateDecision>,
  handoff: OpportunityImportHandoffResultV1
): BoardroomOpportunityBridgeDispositionV1 {
  if (handoff.disposition === "READY_FOR_CANONICAL_UPSERT") {
    throw new Error("Boardroom bridge must not create a canonical opportunity directly from newsletter classification");
  }
  if (handoff.disposition === "LINK_TO_EXISTING") return "LINK_TO_EXISTING";
  if (handoff.disposition === "WATCH_ONLY") return "WATCH_ONLY";
  if (decision.recommendedAction === "RESEARCH" || decision.disposition === "QUALIFIED_FOR_RESEARCH") {
    return "NEEDS_RESEARCH";
  }
  return "NEEDS_VERIFICATION";
}

export function compileBoardroomOpportunityHandoffsV1(
  input: BoardroomOpportunityHandoffInputV1
): BoardroomOpportunityHandoffResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  if (!isPlainObject(input.classification)) throw new Error("classification must be a plain object");
  if (input.classification.version !== BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION) {
    throw new Error("classification version is unsupported");
  }
  if (!Array.isArray(input.classification.decisions)) throw new Error("classification.decisions must be an array");
  if (input.classification.decisions.length > MAX_DECISIONS) {
    throw new Error(`classification.decisions exceeds ${MAX_DECISIONS}`);
  }
  if (
    input.classification.externalResearchPerformed !== false ||
    input.classification.crmMutationPerformed !== false ||
    input.classification.externalActionPerformed !== false
  ) {
    throw new Error("classification violates the read-only classifier boundary");
  }

  const seenStoryIds = new Set<string>();
  const items = input.classification.decisions.map((rawDecision, index): BoardroomOpportunityBridgeItemV1 => {
    const decision = validateDecision(rawDecision, index);
    if (seenStoryIds.has(decision.storyId)) throw new Error(`duplicate storyId ${decision.storyId}`);
    seenStoryIds.add(decision.storyId);

    const baseReasons: string[] = [];
    if (decision.entityRefs.length > 0) {
      baseReasons.push("GENERIC_ENTITY_REFS_NOT_PROMOTED_TO_PERSON_REFS");
    }

    if (decision.disposition === "IGNORE" || decision.duplicateOfStoryId != null) {
      if (decision.duplicateOfStoryId != null) baseReasons.push("DUPLICATE_OR_SYNDICATED_SUPPRESSED");
      if (decision.disposition === "IGNORE") baseReasons.push("CLASSIFIER_IGNORED");
      return freezeDeep({
        storyId: decision.storyId,
        sourceRef: decision.sourceRef,
        classificationDisposition: decision.disposition,
        bridgeDisposition: "SUPPRESS" as const,
        evidenceState: decision.evidenceState,
        evidenceRefs: [...decision.evidenceRefs],
        organizationRefs: [...decision.organizationRefs],
        unmappedEntityRefs: [...decision.entityRefs],
        existingOpportunityRef: decision.existingOpportunityRef,
        researchQuestions: [...decision.researchQuestions],
        reasonCodes: [...uniqueReasons(baseReasons)],
        handoff: null
      });
    }

    const mapping = mapQualification(decision);
    const handoff = compileOpportunityImportHandoffV1({
      source: "BOARDROOM",
      sourceInteractionRef: decision.sourceRef,
      candidate: {
        sourceCandidateKey: `boardroom-story:${decision.storyId}`,
        title: decision.title,
        qualification: mapping.qualification,
        truthState: decision.evidenceState,
        evidenceRefs: [...decision.evidenceRefs],
        personRefs: [],
        organizationRefs: [...decision.organizationRefs],
        existingOpportunityRef: decision.existingOpportunityRef
      }
    });

    const bridgeDisposition = bridgeDispositionFor(decision, handoff);
    return freezeDeep({
      storyId: decision.storyId,
      sourceRef: decision.sourceRef,
      classificationDisposition: decision.disposition,
      bridgeDisposition,
      evidenceState: decision.evidenceState,
      evidenceRefs: [...decision.evidenceRefs],
      organizationRefs: [...decision.organizationRefs],
      unmappedEntityRefs: [...decision.entityRefs],
      existingOpportunityRef: decision.existingOpportunityRef,
      researchQuestions: [...decision.researchQuestions],
      reasonCodes: [...uniqueReasons([...baseReasons, ...mapping.reasonCodes, ...handoff.reasonCodes])],
      handoff
    });
  });

  return freezeDeep({
    version: BOARDROOM_OPPORTUNITY_HANDOFF_VERSION,
    classifierVersion: BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION,
    items,
    counts: {
      reviewed: items.length,
      suppressed: items.filter((item) => item.bridgeDisposition === "SUPPRESS").length,
      watchOnly: items.filter((item) => item.bridgeDisposition === "WATCH_ONLY").length,
      needsResearch: items.filter((item) => item.bridgeDisposition === "NEEDS_RESEARCH").length,
      needsVerification: items.filter((item) => item.bridgeDisposition === "NEEDS_VERIFICATION").length,
      linkedToExisting: items.filter((item) => item.bridgeDisposition === "LINK_TO_EXISTING").length
    },
    externalResearchPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
