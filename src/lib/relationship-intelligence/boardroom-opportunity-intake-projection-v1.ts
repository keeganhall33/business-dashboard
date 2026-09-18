import {
  BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION,
  type BoardroomOpportunityClassifierResultV1,
  type BoardroomOpportunityDecisionV1,
  type BoardroomSignalClassV1,
  type BoardroomTruthStateV1
} from "@/lib/discovery-intelligence/boardroom-opportunity-classifier-v1";
import type {
  OpportunitySignalTruthStateV1,
  OpportunitySignalTypeV1,
  OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const BOARDROOM_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1 =
  "BOARDROOM_OPPORTUNITY_INTAKE_PROJECTION_V1" as const;

export type BoardroomOpportunityProjectionDispositionV1 =
  | "EMITTED"
  | "SUPPRESSED"
  | "VERIFY_REQUIRED";

export type BoardroomOpportunityProjectionRecordV1 = Readonly<{
  storyId: string;
  disposition: BoardroomOpportunityProjectionDispositionV1;
  sourceRef: string;
  observedAt: string;
  signalClass: BoardroomSignalClassV1 | null;
  projectedSignalType: OpportunitySignalTypeV1 | null;
  projectedTruthState: OpportunitySignalTruthStateV1 | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: null;
  canonicalOpportunityRef: string | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
}>;

export type BoardroomOpportunityIntakeProjectionInputV1 = Readonly<{
  projectedAt: string | Date;
  classifier: BoardroomOpportunityClassifierResultV1;
  maximumClassifierAgeMinutes?: number;
}>;

export type BoardroomOpportunityIntakeProjectionResultV1 = Readonly<{
  version: typeof BOARDROOM_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  records: readonly BoardroomOpportunityProjectionRecordV1[];
  observations: readonly OpportunitySourceObservationV1[];
  policies: Readonly<{
    sourceKind: "BOARDROOM";
    identity: "EXACT_BOARDROOM_STORY_ID";
    opportunityLinkage: "EXACT_EXISTING_OPPORTUNITY_REF_ONLY";
    organizationLinkage: "EXACT_SINGLE_SUPPLIED_ORGANIZATION_REF_ONLY";
    personLinkage: "NOT_PROJECTED_FROM_UNTYPED_ENTITY_REFS";
    timingProjection: "NONE_FROM_TITLE_SUMMARY_OR_WHY_NOW";
    relationshipProjection: "NONE_FROM_NEWS_MENTION";
    sourceCountConfidence: "NOT_ESTABLISHED";
  }>;
  authority: Readonly<{
    analysisOnly: true;
    externalResearchAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
  limitations: readonly string[];
}>;

const MINUTE_MS = 60_000;
const DEFAULT_MAX_CLASSIFIER_AGE_MINUTES = 180;
const MAX_CLASSIFIER_AGE_MINUTES = 1_440;

const SIGNAL_CLASSES = new Set<BoardroomSignalClassV1>([
  "SPONSORSHIP",
  "PARTNERSHIP",
  "EXECUTIVE_MOVE",
  "ATHLETE_TALENT_DEAL",
  "COLLECTIBLES_LICENSING",
  "EVENT",
  "VENUE",
  "MEDIA",
  "CHARITY",
  "BRAND_ACTIVATION",
  "ACQUISITION_INVESTMENT"
]);

const TRUTH_STATES = new Set<BoardroomTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);

const POLICIES = Object.freeze({
  sourceKind: "BOARDROOM" as const,
  identity: "EXACT_BOARDROOM_STORY_ID" as const,
  opportunityLinkage: "EXACT_EXISTING_OPPORTUNITY_REF_ONLY" as const,
  organizationLinkage: "EXACT_SINGLE_SUPPLIED_ORGANIZATION_REF_ONLY" as const,
  personLinkage: "NOT_PROJECTED_FROM_UNTYPED_ENTITY_REFS" as const,
  timingProjection: "NONE_FROM_TITLE_SUMMARY_OR_WHY_NOW" as const,
  relationshipProjection: "NONE_FROM_NEWS_MENTION" as const,
  sourceCountConfidence: "NOT_ESTABLISHED" as const
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  externalResearchAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This projection bridges the deterministic Boardroom classifier into the canonical structured opportunity-intake contract. It does not read mail, parse raw newsletter content, browse the web, enrich entities, or persist CRM truth.",
  "A Boardroom news signal is not evidence that a brand, athlete, executive, sponsor, team, or organization is interested in Keegan. The projection preserves category and provenance only.",
  "Only an exact existingOpportunityRef supplied by the upstream classifier is projected as an opportunity link. News text, entity names, organization names, titles, summaries, and fit reasons are never fuzzy-matched into opportunities here.",
  "A canonical organization is projected only when the classifier supplies exactly one organization ref. Multiple organization refs remain ambiguous rather than choosing a sponsor, buyer, partner, rights holder, or target organization.",
  "Untyped entityRefs are never converted into a person ref, decision-maker claim, warm-access claim, sponsorship relationship, contact detail, or endorsement. No relationship is created from co-mention in a story.",
  "Classifier whyNow text and publication time are not a planning, budget, renewal, season, launch, event, or outreach window. No planningWindow claim is emitted by this bridge.",
  "EMITTED means the observation can enter canonical opportunity-signal intake for further evidence review. It does not mean qualified opportunity, sponsor interest, commercial intent, confidence, deal likelihood, attribution, monetary value, or authority to act."
] as const);

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function instant(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function textList(value: unknown, label: string, allowEmpty = true): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = value.map((item, index) => requiredText(item, `${label}[${index}]`));
  const result = uniqueSorted(normalized);
  if (!allowEmpty && result.length === 0) throw new Error(`${label} must not be empty`);
  return result;
}

function classifierProjectionIssue(
  generatedAt: string,
  projectedAtMs: number,
  maximumClassifierAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return "CLASSIFIER_GENERATED_AT_INVALID";
  if (generatedAtMs > projectedAtMs) return "CLASSIFIER_GENERATED_IN_FUTURE";
  if (projectedAtMs - generatedAtMs > maximumClassifierAgeMinutes * MINUTE_MS) return "CLASSIFIER_PROJECTION_STALE";
  return null;
}

function projectSignalType(signalClass: BoardroomSignalClassV1): OpportunitySignalTypeV1 {
  switch (signalClass) {
    case "SPONSORSHIP":
      return "SPONSORSHIP_OPPORTUNITY";
    case "PARTNERSHIP":
    case "BRAND_ACTIVATION":
      return "PARTNERSHIP_OPPORTUNITY";
    case "EXECUTIVE_MOVE":
      return "DECISION_MAKER_CHANGE";
    case "ATHLETE_TALENT_DEAL":
    case "COLLECTIBLES_LICENSING":
    case "EVENT":
    case "VENUE":
    case "MEDIA":
    case "CHARITY":
    case "ACQUISITION_INVESTMENT":
      return "OTHER_BUSINESS_OPPORTUNITY";
  }
}

function projectTruthState(decision: BoardroomOpportunityDecisionV1): OpportunitySignalTruthStateV1 {
  if (decision.reasonCodes.includes("STALE_EVIDENCE")) return "STALE";
  switch (decision.evidenceState) {
    case "KNOWN":
      return "KNOWN";
    case "INFERRED":
    case "PARTIAL":
      return "PARTIAL";
    case "UNKNOWN":
      return "UNKNOWN";
    case "STALE":
      return "STALE";
    case "CONFLICTED":
      return "CONFLICTED";
  }
}

function organizationProjection(
  organizationRefs: readonly string[],
  reasonCodes: Set<string>
): string | null {
  if (organizationRefs.length === 0) {
    reasonCodes.add("NO_CANONICAL_ORGANIZATION_SUPPLIED");
    return null;
  }
  if (organizationRefs.length > 1) {
    reasonCodes.add("MULTIPLE_ORGANIZATIONS_AMBIGUOUS_NO_ORGANIZATION_SELECTED");
    return null;
  }
  reasonCodes.add("EXACT_SINGLE_ORGANIZATION_REF_PRESERVED");
  return organizationRefs[0];
}

function verifyRecord(
  decision: BoardroomOpportunityDecisionV1,
  projectedAtMs: number
): Readonly<{
  storyId: string;
  sourceRef: string;
  observedAt: string;
  evidenceRefs: readonly string[];
  organizationRefs: readonly string[];
  existingOpportunityRef: string | null;
  signalClass: BoardroomSignalClassV1 | null;
  verificationReasons: readonly string[];
}> {
  const storyId = requiredText(decision.storyId, "decision.storyId");
  const sourceRef = requiredText(decision.sourceRef, `${storyId}.sourceRef`);
  const observedAt = instant(decision.publishedAt, `${storyId}.publishedAt`);
  const evidenceRefs = textList(decision.evidenceRefs, `${storyId}.evidenceRefs`, false);
  const organizationRefs = textList(decision.organizationRefs, `${storyId}.organizationRefs`);
  textList(decision.entityRefs, `${storyId}.entityRefs`);
  textList(decision.reasonCodes, `${storyId}.reasonCodes`);
  const existingOpportunityRef = optionalText(decision.existingOpportunityRef, `${storyId}.existingOpportunityRef`);
  const verificationReasons = new Set<string>();

  if (Date.parse(observedAt) > projectedAtMs) verificationReasons.add("STORY_OBSERVED_IN_FUTURE");
  if (!TRUTH_STATES.has(decision.evidenceState)) verificationReasons.add("UNSUPPORTED_EVIDENCE_STATE");
  if (decision.signalClass !== null && !SIGNAL_CLASSES.has(decision.signalClass)) verificationReasons.add("UNSUPPORTED_SIGNAL_CLASS");

  if (decision.disposition !== "IGNORE" && decision.signalClass === null) {
    verificationReasons.add("NON_IGNORED_DECISION_MISSING_SIGNAL_CLASS");
  }
  if (decision.recommendedAction === "LINK_TO_EXISTING" && !existingOpportunityRef) {
    verificationReasons.add("LINK_TO_EXISTING_MISSING_EXACT_OPPORTUNITY_REF");
  }
  if (existingOpportunityRef && decision.recommendedAction !== "LINK_TO_EXISTING") {
    verificationReasons.add("EXISTING_OPPORTUNITY_REF_WITHOUT_LINK_ACTION");
  }
  if (decision.duplicateOfStoryId && decision.disposition !== "IGNORE") {
    verificationReasons.add("DUPLICATE_STORY_NOT_SUPPRESSED_UPSTREAM");
  }

  return freezeDeep({
    storyId,
    sourceRef,
    observedAt,
    evidenceRefs,
    organizationRefs,
    existingOpportunityRef,
    signalClass: decision.signalClass,
    verificationReasons: uniqueSorted([...verificationReasons])
  });
}

function blockedResult(generatedAt: string, issues: readonly string[]): BoardroomOpportunityIntakeProjectionResultV1 {
  return freezeDeep({
    version: BOARDROOM_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    records: [],
    observations: [],
    policies: POLICIES,
    authority: AUTHORITY,
    limitations: [...LIMITATIONS]
  });
}

export function projectBoardroomOpportunitiesToIntakeV1(
  input: BoardroomOpportunityIntakeProjectionInputV1
): BoardroomOpportunityIntakeProjectionResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.classifier || typeof input.classifier !== "object" || Array.isArray(input.classifier)) {
    throw new Error("classifier must be an object");
  }

  const generatedAt = instant(input.projectedAt, "projectedAt");
  const projectedAtMs = Date.parse(generatedAt);
  const maximumClassifierAgeMinutes = boundedInteger(
    input.maximumClassifierAgeMinutes,
    DEFAULT_MAX_CLASSIFIER_AGE_MINUTES,
    1,
    MAX_CLASSIFIER_AGE_MINUTES,
    "maximumClassifierAgeMinutes"
  );

  const issues: string[] = [];
  if (input.classifier.version !== BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION) issues.push("CLASSIFIER_VERSION_UNSUPPORTED");
  const freshnessIssue = classifierProjectionIssue(input.classifier.generatedAt, projectedAtMs, maximumClassifierAgeMinutes);
  if (freshnessIssue) issues.push(freshnessIssue);
  if (!Array.isArray(input.classifier.decisions)) issues.push("CLASSIFIER_DECISIONS_INVALID");
  if (input.classifier.externalResearchPerformed !== false) issues.push("CLASSIFIER_EXTERNAL_RESEARCH_SIDE_EFFECT_DETECTED");
  if (input.classifier.crmMutationPerformed !== false) issues.push("CLASSIFIER_CRM_MUTATION_SIDE_EFFECT_DETECTED");
  if (input.classifier.externalActionPerformed !== false) issues.push("CLASSIFIER_EXTERNAL_ACTION_SIDE_EFFECT_DETECTED");

  if (issues.length > 0) return blockedResult(generatedAt, issues);

  const seenStoryIds = new Set<string>();
  const records: BoardroomOpportunityProjectionRecordV1[] = [];
  const observations: OpportunitySourceObservationV1[] = [];

  for (const [index, decision] of input.classifier.decisions.entries()) {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      throw new Error(`classifier.decisions[${index}] must be an object`);
    }

    const verified = verifyRecord(decision, projectedAtMs);
    if (seenStoryIds.has(verified.storyId)) throw new Error(`classifier contains duplicate storyId ${verified.storyId}`);
    seenStoryIds.add(verified.storyId);

    const recordReasons = new Set<string>();
    for (const reason of decision.reasonCodes) recordReasons.add(`CLASSIFIER:${reason}`);

    if (decision.disposition === "IGNORE") {
      recordReasons.add("CLASSIFIER_DECISION_SUPPRESSED");
      records.push(freezeDeep({
        storyId: verified.storyId,
        disposition: "SUPPRESSED" as const,
        sourceRef: verified.sourceRef,
        observedAt: verified.observedAt,
        signalClass: verified.signalClass,
        projectedSignalType: null,
        projectedTruthState: null,
        canonicalOrganizationRef: null,
        canonicalPersonRef: null,
        canonicalOpportunityRef: null,
        evidenceRefs: [...verified.evidenceRefs],
        reasonCodes: uniqueSorted([...recordReasons])
      }));
      continue;
    }

    if (verified.verificationReasons.length > 0 || verified.signalClass === null) {
      for (const reason of verified.verificationReasons) recordReasons.add(`VERIFY:${reason}`);
      records.push(freezeDeep({
        storyId: verified.storyId,
        disposition: "VERIFY_REQUIRED" as const,
        sourceRef: verified.sourceRef,
        observedAt: verified.observedAt,
        signalClass: verified.signalClass,
        projectedSignalType: null,
        projectedTruthState: null,
        canonicalOrganizationRef: null,
        canonicalPersonRef: null,
        canonicalOpportunityRef: verified.existingOpportunityRef,
        evidenceRefs: [...verified.evidenceRefs],
        reasonCodes: uniqueSorted([...recordReasons])
      }));
      continue;
    }

    const canonicalOrganizationRef = organizationProjection(verified.organizationRefs, recordReasons);
    const projectedSignalType = projectSignalType(verified.signalClass);
    const projectedTruthState = projectTruthState(decision);
    recordReasons.add("UNTYPED_ENTITY_REFS_NOT_PROJECTED_TO_PERSON");
    recordReasons.add("NO_PLANNING_WINDOW_PROJECTED_FROM_BOARDROOM_NARRATIVE");
    recordReasons.add("NO_RELATIONSHIP_OR_ACCESS_CLAIM_PROJECTED_FROM_NEWS_MENTION");
    if (verified.existingOpportunityRef) recordReasons.add("EXACT_EXISTING_OPPORTUNITY_REF_PRESERVED");

    const observation: OpportunitySourceObservationV1 = freezeDeep({
      captureId: `boardroom-classifier:${verified.storyId}`,
      sourceKind: "BOARDROOM" as const,
      sourceEventKey: `boardroom-story:${verified.storyId}`,
      sourceRef: verified.sourceRef,
      observedAt: verified.observedAt,
      evidenceRefs: [...verified.evidenceRefs],
      truthState: projectedTruthState,
      signalType: projectedSignalType,
      organizationRef: canonicalOrganizationRef,
      personRef: null,
      opportunityRef: verified.existingOpportunityRef,
      planningWindow: null,
      decisionMakerClaim: null,
      sponsorshipRelationshipClaim: null,
      warmAccessClaim: null
    });

    observations.push(observation);
    records.push(freezeDeep({
      storyId: verified.storyId,
      disposition: "EMITTED" as const,
      sourceRef: verified.sourceRef,
      observedAt: verified.observedAt,
      signalClass: verified.signalClass,
      projectedSignalType,
      projectedTruthState,
      canonicalOrganizationRef,
      canonicalPersonRef: null,
      canonicalOpportunityRef: verified.existingOpportunityRef,
      evidenceRefs: [...verified.evidenceRefs],
      reasonCodes: uniqueSorted([...recordReasons])
    }));
  }

  const recordOrder = (a: BoardroomOpportunityProjectionRecordV1, b: BoardroomOpportunityProjectionRecordV1) =>
    b.observedAt.localeCompare(a.observedAt) || a.storyId.localeCompare(b.storyId);
  records.sort(recordOrder);
  observations.sort((a, b) =>
    instant(b.observedAt, "observation.observedAt").localeCompare(instant(a.observedAt, "observation.observedAt")) ||
    a.sourceEventKey.localeCompare(b.sourceEventKey)
  );

  return freezeDeep({
    version: BOARDROOM_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    records,
    observations,
    policies: POLICIES,
    authority: AUTHORITY,
    limitations: [...LIMITATIONS]
  });
}
