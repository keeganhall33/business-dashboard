import {
  OPPORTUNITY_IMPORT_HANDOFF_VERSION,
  compileOpportunityImportHandoffV1,
  type OpportunityImportHandoffResultV1
} from "@/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION,
  type DormantEmailOpportunityProjectorResultV1,
  type DormantOpportunityCandidateV1,
  type DormantTruthStateV1
} from "@/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";

export const DORMANT_OPPORTUNITY_HANDOFF_VERSION = "DORMANT_OPPORTUNITY_HANDOFF_V1" as const;

export type DormantOpportunityHandoffContextV1 = Readonly<{
  candidateId: string;
  sourceInteractionRef: string;
  title: string;
  titleTruthState: DormantTruthStateV1;
  titleEvidenceRefs: readonly string[];
}>;

export type DormantOpportunityHandoffDispositionV1 =
  | "READY_FOR_CANONICAL_HANDOFF"
  | "LINK_TO_EXISTING"
  | "NEEDS_VERIFICATION"
  | "RELATIONSHIP_REVIEW_ONLY"
  | "SUPPRESS";

export type DormantOpportunityHandoffDecisionV1 = Readonly<{
  candidateId: string;
  conversationKey: string;
  disposition: DormantOpportunityHandoffDispositionV1;
  reasonCodes: readonly string[];
  relationshipClass: DormantOpportunityCandidateV1["candidateClass"];
  truthState: DormantTruthStateV1;
  canonicalPersonRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  lastMeaningfulTouchAt: string;
  ageDays: number;
  reviewOwner: DormantOpportunityCandidateV1["ownerRecommendation"];
  reviewNextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  handoff: OpportunityImportHandoffResultV1 | null;
}>;

export type DormantOpportunityHandoffInputV1 = Readonly<{
  projection: DormantEmailOpportunityProjectorResultV1;
  contexts: readonly DormantOpportunityHandoffContextV1[];
}>;

export type DormantOpportunityHandoffResultV1 = Readonly<{
  version: typeof DORMANT_OPPORTUNITY_HANDOFF_VERSION;
  sourceProjectionVersion: typeof DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION;
  opportunityHandoffVersion: typeof OPPORTUNITY_IMPORT_HANDOFF_VERSION;
  generatedAt: string;
  decisions: readonly DormantOpportunityHandoffDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    readyForCanonicalHandoff: number;
    linkToExisting: number;
    needsVerification: number;
    relationshipReviewOnly: number;
    suppressed: number;
  }>;
  crmMutationPerformed: false;
  mailboxMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAX_CONTEXTS = 100;
const TERMINAL_THREAD_STATES = new Set(["RESOLVED", "REJECTED", "WON", "LOST", "IRRELEVANT"] as const);
const RELATIONSHIP_ONLY_CLASSES = new Set(["WARM_INTRO", "STALE_STRATEGIC_RELATIONSHIP"] as const);
const TRUTH_STATES = new Set<DormantTruthStateV1>(["KNOWN", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function refs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function contextIndex(contexts: readonly DormantOpportunityHandoffContextV1[]): Map<string, DormantOpportunityHandoffContextV1> {
  if (!Array.isArray(contexts)) throw new Error("contexts must be an array");
  if (contexts.length > MAX_CONTEXTS) throw new Error(`contexts exceeds ${MAX_CONTEXTS}`);
  const index = new Map<string, DormantOpportunityHandoffContextV1>();
  for (const [position, context] of contexts.entries()) {
    if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error(`contexts[${position}] must be an object`);
    const candidateId = requiredText(context.candidateId, `contexts[${position}].candidateId`);
    if (index.has(candidateId)) throw new Error(`duplicate context for ${candidateId}`);
    if (!TRUTH_STATES.has(context.titleTruthState)) throw new Error(`contexts[${position}].titleTruthState is unsupported`);
    index.set(candidateId, freezeDeep({
      candidateId,
      sourceInteractionRef: requiredText(context.sourceInteractionRef, `contexts[${position}].sourceInteractionRef`),
      title: requiredText(context.title, `contexts[${position}].title`),
      titleTruthState: context.titleTruthState,
      titleEvidenceRefs: [...refs(context.titleEvidenceRefs, `contexts[${position}].titleEvidenceRefs`)]
    }));
  }
  return index;
}

function unionRefs(...groups: readonly (readonly string[])[]): readonly string[] {
  return Object.freeze([...new Set(groups.flatMap((group) => [...group]))].sort((a, b) => a.localeCompare(b)));
}

function baseDecision(candidate: DormantOpportunityCandidateV1) {
  return {
    candidateId: candidate.candidateId,
    conversationKey: candidate.conversationKey,
    relationshipClass: candidate.candidateClass,
    truthState: candidate.truthState,
    canonicalPersonRef: candidate.personRef,
    canonicalOrganizationRef: candidate.organizationRef,
    canonicalOpportunityRef: candidate.opportunityRef,
    lastMeaningfulTouchAt: candidate.lastMeaningfulTouchAt,
    ageDays: candidate.ageDays,
    reviewOwner: candidate.ownerRecommendation,
    reviewNextStep: candidate.safeNextStep,
    evidenceRefs: [...candidate.evidenceRefs],
    sourceRefs: [...candidate.sourceRefs]
  } as const;
}

function compileCandidate(
  candidate: DormantOpportunityCandidateV1,
  context: DormantOpportunityHandoffContextV1 | undefined
): DormantOpportunityHandoffDecisionV1 {
  const base = baseDecision(candidate);

  if (TERMINAL_THREAD_STATES.has(candidate.threadState as never)) {
    return freezeDeep({
      ...base,
      disposition: "SUPPRESS" as const,
      reasonCodes: [`THREAD_STATE_${candidate.threadState}_IS_TERMINAL`],
      handoff: null
    });
  }

  if (RELATIONSHIP_ONLY_CLASSES.has(candidate.candidateClass as never) && !candidate.opportunityRef) {
    return freezeDeep({
      ...base,
      disposition: "RELATIONSHIP_REVIEW_ONLY" as const,
      reasonCodes: ["RELATIONSHIP_SIGNAL_IS_NOT_ENOUGH_TO_CREATE_OPPORTUNITY"],
      handoff: null
    });
  }

  if (!context) {
    return freezeDeep({
      ...base,
      disposition: "NEEDS_VERIFICATION" as const,
      reasonCodes: ["EVIDENCED_TITLE_CONTEXT_REQUIRED"],
      handoff: null
    });
  }

  if (context.titleTruthState !== "KNOWN") {
    return freezeDeep({
      ...base,
      disposition: "NEEDS_VERIFICATION" as const,
      reasonCodes: [`TITLE_${context.titleTruthState}_REQUIRES_VERIFICATION`],
      evidenceRefs: [...unionRefs(candidate.evidenceRefs, context.titleEvidenceRefs)],
      handoff: null
    });
  }

  const qualification = candidate.truthState === "KNOWN" ? "QUALIFIED" as const : "CANDIDATE" as const;
  const evidenceRefs = unionRefs(candidate.evidenceRefs, context.titleEvidenceRefs);
  const handoff = compileOpportunityImportHandoffV1({
    source: "IONOS",
    sourceInteractionRef: context.sourceInteractionRef,
    candidate: {
      sourceCandidateKey: candidate.candidateId,
      title: context.title,
      qualification,
      truthState: candidate.truthState,
      evidenceRefs,
      personRefs: candidate.personRef ? [candidate.personRef] : [],
      organizationRefs: candidate.organizationRef ? [candidate.organizationRef] : [],
      existingOpportunityRef: candidate.opportunityRef,
      summary: {
        state: candidate.truthState,
        value: candidate.rationale,
        evidenceRefs: candidate.evidenceRefs
      },
      whyNow: {
        state: candidate.truthState,
        value: `The last supported meaningful touch is ${candidate.ageDays} days old.`,
        evidenceRefs: candidate.evidenceRefs
      },
      planningWindow: null
    }
  });

  const disposition: DormantOpportunityHandoffDispositionV1 = handoff.disposition === "READY_FOR_CANONICAL_UPSERT"
    ? "READY_FOR_CANONICAL_HANDOFF"
    : handoff.disposition === "LINK_TO_EXISTING"
      ? "LINK_TO_EXISTING"
      : "NEEDS_VERIFICATION";

  return freezeDeep({
    ...base,
    disposition,
    reasonCodes: [...handoff.reasonCodes],
    evidenceRefs: [...evidenceRefs],
    handoff
  });
}

export function compileDormantOpportunityHandoffsV1(input: DormantOpportunityHandoffInputV1): DormantOpportunityHandoffResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.projection || typeof input.projection !== "object" || Array.isArray(input.projection)) throw new Error("projection must be an object");
  if (input.projection.version !== DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION) throw new Error("projection.version is unsupported");
  if (!Array.isArray(input.projection.queue)) throw new Error("projection.queue must be an array");

  const contexts = contextIndex(input.contexts);
  const queuedIds = new Set(input.projection.queue.map((candidate) => requiredText(candidate.candidateId, "candidate.candidateId")));
  for (const candidateId of contexts.keys()) {
    if (!queuedIds.has(candidateId)) throw new Error(`context ${candidateId} does not match a queued dormant candidate`);
  }

  const decisions = input.projection.queue.map((candidate) => compileCandidate(candidate, contexts.get(candidate.candidateId)));
  const count = (disposition: DormantOpportunityHandoffDispositionV1) => decisions.filter((decision) => decision.disposition === disposition).length;

  return freezeDeep({
    version: DORMANT_OPPORTUNITY_HANDOFF_VERSION,
    sourceProjectionVersion: DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION,
    opportunityHandoffVersion: OPPORTUNITY_IMPORT_HANDOFF_VERSION,
    generatedAt: input.projection.generatedAt,
    decisions,
    counts: {
      reviewed: decisions.length,
      readyForCanonicalHandoff: count("READY_FOR_CANONICAL_HANDOFF"),
      linkToExisting: count("LINK_TO_EXISTING"),
      needsVerification: count("NEEDS_VERIFICATION"),
      relationshipReviewOnly: count("RELATIONSHIP_REVIEW_ONLY"),
      suppressed: count("SUPPRESS")
    },
    crmMutationPerformed: false as const,
    mailboxMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
