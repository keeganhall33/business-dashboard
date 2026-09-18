import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffEvidenceFieldV1,
  type OpportunityHandoffQualificationV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportHandoffResultV1
} from "../relationships-crm/opportunity-import-handoff-v1";

export const CHATGPT_OPPORTUNITY_CAPTURE_VERSION = "CHATGPT_OPPORTUNITY_CAPTURE_V1" as const;

export type ChatGPTOpportunityCaptureOriginV1 = "USER_EXPLICIT" | "ASSISTANT_SUGGESTED";
export type ChatGPTOpportunityCaptureIntentV1 =
  | "WATCH"
  | "TRACK_CANDIDATE"
  | "SAVE_QUALIFIED"
  | "LINK_EXISTING";

export type ChatGPTOpportunityCaptureCandidateV1 = {
  sourceCandidateKey: string;
  title: OpportunityHandoffEvidenceFieldV1;
  truthState: OpportunityHandoffTruthStateV1;
  evidenceRefs: readonly string[];
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
  summary?: OpportunityHandoffEvidenceFieldV1 | null;
  whyNow?: OpportunityHandoffEvidenceFieldV1 | null;
  recommendedNextAction?: OpportunityHandoffEvidenceFieldV1 | null;
  planningWindow?: OpportunityHandoffEvidenceFieldV1 | null;
};

export type ChatGPTOpportunityCaptureInputV1 = {
  conversationRef: string;
  messageRef: string;
  origin: ChatGPTOpportunityCaptureOriginV1;
  intent: ChatGPTOpportunityCaptureIntentV1;
  intentEvidenceRefs: readonly string[];
  candidate: ChatGPTOpportunityCaptureCandidateV1;
};

export type ChatGPTOpportunityCaptureResultV1 = Readonly<{
  version: typeof CHATGPT_OPPORTUNITY_CAPTURE_VERSION;
  origin: ChatGPTOpportunityCaptureOriginV1;
  intent: ChatGPTOpportunityCaptureIntentV1;
  conversationRef: string;
  messageRef: string;
  requestedQualification: OpportunityHandoffQualificationV1;
  effectiveQualification: OpportunityHandoffQualificationV1;
  reasonCodes: readonly string[];
  handoff: OpportunityImportHandoffResultV1;
  inferredContactInfo: false;
  inferredRelationship: false;
  inferredSponsorship: false;
  inferredTiming: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const ORIGINS = new Set<ChatGPTOpportunityCaptureOriginV1>(["USER_EXPLICIT", "ASSISTANT_SUGGESTED"]);
const INTENTS = new Set<ChatGPTOpportunityCaptureIntentV1>([
  "WATCH",
  "TRACK_CANDIDATE",
  "SAVE_QUALIFIED",
  "LINK_EXISTING"
]);
const TRUTH_STATES = new Set<OpportunityHandoffTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const FIELD_KEYS = new Set(["state", "value", "evidenceRefs"]);
const INPUT_KEYS = new Set(["conversationRef", "messageRef", "origin", "intent", "intentEvidenceRefs", "candidate"]);
const CANDIDATE_KEYS = new Set([
  "sourceCandidateKey",
  "title",
  "truthState",
  "evidenceRefs",
  "personRefs",
  "organizationRefs",
  "existingOpportunityRef",
  "summary",
  "whyNow",
  "recommendedNextAction",
  "planningWindow"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value: unknown, allowed: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
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

function refs(value: unknown, label: string, required = false): readonly string[] {
  if (value == null) {
    if (required) throw new Error(`${label} must be a non-empty array`);
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (required && normalized.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(normalized);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function normalizeField(value: unknown, label: string, required = false): Readonly<OpportunityHandoffEvidenceFieldV1> | null {
  if (value == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  assertKeys(value, FIELD_KEYS, label);
  if (typeof value.state !== "string" || !TRUTH_STATES.has(value.state as OpportunityHandoffTruthStateV1)) {
    throw new Error(`${label}.state is unsupported`);
  }
  const state = value.state as OpportunityHandoffTruthStateV1;
  const normalizedValue = value.value == null ? null : requiredText(value.value, `${label}.value`);
  const evidenceRefs = refs(value.evidenceRefs, `${label}.evidenceRefs`, true);
  if (state === "KNOWN" && normalizedValue == null) {
    throw new Error(`${label}.value is required when state is KNOWN`);
  }
  return freezeDeep({ state, value: normalizedValue, evidenceRefs: [...evidenceRefs] });
}

function requestedQualification(intent: ChatGPTOpportunityCaptureIntentV1): OpportunityHandoffQualificationV1 {
  if (intent === "WATCH") return "WATCH";
  if (intent === "TRACK_CANDIDATE") return "CANDIDATE";
  return "QUALIFIED";
}

function uniqueReasons(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

export function compileChatGPTOpportunityCaptureV1(
  input: ChatGPTOpportunityCaptureInputV1
): ChatGPTOpportunityCaptureResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  const conversationRef = requiredText(input.conversationRef, "conversationRef");
  const messageRef = requiredText(input.messageRef, "messageRef");
  if (typeof input.origin !== "string" || !ORIGINS.has(input.origin as ChatGPTOpportunityCaptureOriginV1)) {
    throw new Error("origin is unsupported");
  }
  if (typeof input.intent !== "string" || !INTENTS.has(input.intent as ChatGPTOpportunityCaptureIntentV1)) {
    throw new Error("intent is unsupported");
  }
  const origin = input.origin as ChatGPTOpportunityCaptureOriginV1;
  const intent = input.intent as ChatGPTOpportunityCaptureIntentV1;
  const intentEvidenceRefs = refs(input.intentEvidenceRefs, "intentEvidenceRefs", true);

  assertKeys(input.candidate, CANDIDATE_KEYS, "candidate");
  const sourceCandidateKey = requiredText(input.candidate.sourceCandidateKey, "candidate.sourceCandidateKey");
  const title = normalizeField(input.candidate.title, "candidate.title", true);
  if (!title || title.value == null) throw new Error("candidate.title.value is required");
  if (
    typeof input.candidate.truthState !== "string" ||
    !TRUTH_STATES.has(input.candidate.truthState as OpportunityHandoffTruthStateV1)
  ) {
    throw new Error("candidate.truthState is unsupported");
  }
  const truthState = input.candidate.truthState as OpportunityHandoffTruthStateV1;
  const candidateEvidenceRefs = refs(input.candidate.evidenceRefs, "candidate.evidenceRefs", true);
  const personRefs = refs(input.candidate.personRefs, "candidate.personRefs");
  const organizationRefs = refs(input.candidate.organizationRefs, "candidate.organizationRefs");
  const existingOpportunityRef = optionalText(input.candidate.existingOpportunityRef, "candidate.existingOpportunityRef");
  const summary = normalizeField(input.candidate.summary, "candidate.summary");
  const whyNow = normalizeField(input.candidate.whyNow, "candidate.whyNow");
  const recommendedNextAction = normalizeField(input.candidate.recommendedNextAction, "candidate.recommendedNextAction");
  const planningWindow = normalizeField(input.candidate.planningWindow, "candidate.planningWindow");

  const requested = requestedQualification(intent);
  let effective = requested;
  const reasons: string[] = [];

  if (requested === "QUALIFIED" && origin !== "USER_EXPLICIT") {
    effective = "CANDIDATE";
    reasons.push("QUALIFICATION_REQUIRES_EXPLICIT_USER_DIRECTIVE");
  }
  if (requested === "QUALIFIED" && title.state !== "KNOWN") {
    effective = "CANDIDATE";
    reasons.push("QUALIFICATION_REQUIRES_KNOWN_TITLE_EVIDENCE");
  }
  if (intent === "LINK_EXISTING" && existingOpportunityRef == null) {
    effective = "CANDIDATE";
    reasons.push("LINK_EXISTING_REQUIRES_EXPLICIT_CANONICAL_OPPORTUNITY_REF");
  }
  if (intent !== "LINK_EXISTING" && existingOpportunityRef != null) {
    reasons.push("EXISTING_OPPORTUNITY_REF_PRESERVED_WITHOUT_IMPLYING_LINK_INTENT");
  }
  if (origin === "ASSISTANT_SUGGESTED") {
    reasons.push("ASSISTANT_SUGGESTION_CANNOT_SELF_QUALIFY_OPPORTUNITY");
  }

  const evidenceRefs = refs(
    [...candidateEvidenceRefs, ...title.evidenceRefs, ...intentEvidenceRefs],
    "combinedEvidenceRefs",
    true
  );
  const sourceInteractionRef = `${conversationRef}#${messageRef}`;
  const handoff = compileOpportunityImportHandoffV1({
    source: "CHATGPT",
    sourceInteractionRef,
    candidate: {
      sourceCandidateKey,
      title: title.value,
      qualification: effective,
      truthState,
      evidenceRefs,
      personRefs,
      organizationRefs,
      existingOpportunityRef,
      summary,
      whyNow,
      recommendedNextAction,
      planningWindow
    }
  });

  reasons.push(...handoff.reasonCodes);
  return freezeDeep({
    version: CHATGPT_OPPORTUNITY_CAPTURE_VERSION,
    origin,
    intent,
    conversationRef,
    messageRef,
    requestedQualification: requested,
    effectiveQualification: effective,
    reasonCodes: [...uniqueReasons(reasons)],
    handoff,
    inferredContactInfo: false as const,
    inferredRelationship: false as const,
    inferredSponsorship: false as const,
    inferredTiming: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
