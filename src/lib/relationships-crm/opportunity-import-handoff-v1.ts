export const OPPORTUNITY_IMPORT_HANDOFF_VERSION = "OPPORTUNITY_IMPORT_HANDOFF_V1" as const;

export type OpportunityHandoffSourceV1 =
  | "CHATGPT"
  | "OPPORTUNITY_RADAR"
  | "BOARDROOM"
  | "ASK_JEEVES"
  | "IONOS";

export type OpportunityHandoffTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "PARTIAL";

export type OpportunityHandoffQualificationV1 = "WATCH" | "CANDIDATE" | "QUALIFIED";

export type OpportunityHandoffDispositionV1 =
  | "READY_FOR_CANONICAL_UPSERT"
  | "LINK_TO_EXISTING"
  | "NEEDS_VERIFICATION"
  | "WATCH_ONLY";

export type OpportunityHandoffEvidenceFieldV1 = {
  state: OpportunityHandoffTruthStateV1;
  value: string | null;
  evidenceRefs: readonly string[];
};

export type OpportunityImportCandidateV1 = {
  sourceCandidateKey: string;
  title: string;
  qualification: OpportunityHandoffQualificationV1;
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

export type OpportunityImportHandoffInputV1 = {
  source: OpportunityHandoffSourceV1;
  sourceInteractionRef: string;
  candidate: OpportunityImportCandidateV1;
};

export type OpportunityImportHandoffResultV1 = Readonly<{
  version: typeof OPPORTUNITY_IMPORT_HANDOFF_VERSION;
  handoffId: string;
  idempotencyKey: string;
  disposition: OpportunityHandoffDispositionV1;
  reasonCodes: readonly string[];
  source: OpportunityHandoffSourceV1;
  sourceInteractionRef: string;
  canonicalMatchPolicy: "EXPLICIT_EXISTING_REF_ONLY" | "SOURCE_IDENTITY_ONLY";
  payload: Readonly<{
    sourceCandidateKey: string;
    title: string;
    qualification: OpportunityHandoffQualificationV1;
    truthState: OpportunityHandoffTruthStateV1;
    evidenceRefs: readonly string[];
    personRefs: readonly string[];
    organizationRefs: readonly string[];
    existingOpportunityRef: string | null;
    summary: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    whyNow: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    recommendedNextAction: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
    planningWindow: Readonly<OpportunityHandoffEvidenceFieldV1> | null;
  }>;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const SOURCES = new Set<OpportunityHandoffSourceV1>([
  "CHATGPT",
  "OPPORTUNITY_RADAR",
  "BOARDROOM",
  "ASK_JEEVES",
  "IONOS"
]);
const TRUTH_STATES = new Set<OpportunityHandoffTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const QUALIFICATIONS = new Set<OpportunityHandoffQualificationV1>(["WATCH", "CANDIDATE", "QUALIFIED"]);
const INPUT_KEYS = new Set(["source", "sourceInteractionRef", "candidate"]);
const CANDIDATE_KEYS = new Set([
  "sourceCandidateKey",
  "title",
  "qualification",
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
const FIELD_KEYS = new Set(["state", "value", "evidenceRefs"]);

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

function normalizeField(value: unknown, label: string): Readonly<OpportunityHandoffEvidenceFieldV1> | null {
  if (value == null) return null;
  assertKeys(value, FIELD_KEYS, label);
  const state = value.state;
  if (typeof state !== "string" || !TRUTH_STATES.has(state as OpportunityHandoffTruthStateV1)) {
    throw new Error(`${label}.state is unsupported`);
  }
  const normalizedValue = value.value == null ? null : requiredText(value.value, `${label}.value`);
  const evidenceRefs = refs(value.evidenceRefs, `${label}.evidenceRefs`, true);
  return freezeDeep({
    state: state as OpportunityHandoffTruthStateV1,
    value: normalizedValue,
    evidenceRefs: [...evidenceRefs]
  });
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9._:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function verificationReasonCodes(
  truthState: OpportunityHandoffTruthStateV1,
  hasEntityAnchor: boolean,
  fields: readonly (Readonly<OpportunityHandoffEvidenceFieldV1> | null)[]
): string[] {
  const reasons: string[] = [];
  if (truthState !== "KNOWN") reasons.push(`TRUTH_${truthState}_REQUIRES_VERIFICATION`);
  if (!hasEntityAnchor) reasons.push("CANONICAL_ENTITY_ANCHOR_REQUIRED");
  const fieldStates = new Set(fields.filter((field): field is Readonly<OpportunityHandoffEvidenceFieldV1> => field != null).map((field) => field.state));
  for (const state of ["CONFLICTED", "STALE", "UNKNOWN", "INFERRED", "PARTIAL"] as const) {
    if (fieldStates.has(state)) reasons.push(`FIELD_${state}_REQUIRES_VERIFICATION`);
  }
  return reasons;
}

export function compileOpportunityImportHandoffV1(input: OpportunityImportHandoffInputV1): OpportunityImportHandoffResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  if (typeof input.source !== "string" || !SOURCES.has(input.source as OpportunityHandoffSourceV1)) {
    throw new Error("source is unsupported");
  }
  const source = input.source as OpportunityHandoffSourceV1;
  const sourceInteractionRef = requiredText(input.sourceInteractionRef, "sourceInteractionRef");

  assertKeys(input.candidate, CANDIDATE_KEYS, "candidate");
  const sourceCandidateKey = requiredText(input.candidate.sourceCandidateKey, "candidate.sourceCandidateKey");
  const title = requiredText(input.candidate.title, "candidate.title");
  const qualification = input.candidate.qualification;
  if (typeof qualification !== "string" || !QUALIFICATIONS.has(qualification as OpportunityHandoffQualificationV1)) {
    throw new Error("candidate.qualification is unsupported");
  }
  const truthState = input.candidate.truthState;
  if (typeof truthState !== "string" || !TRUTH_STATES.has(truthState as OpportunityHandoffTruthStateV1)) {
    throw new Error("candidate.truthState is unsupported");
  }

  const evidenceRefs = refs(input.candidate.evidenceRefs, "candidate.evidenceRefs", true);
  const personRefs = refs(input.candidate.personRefs, "candidate.personRefs");
  const organizationRefs = refs(input.candidate.organizationRefs, "candidate.organizationRefs");
  const existingOpportunityRef = optionalText(input.candidate.existingOpportunityRef, "candidate.existingOpportunityRef");
  const summary = normalizeField(input.candidate.summary, "candidate.summary");
  const whyNow = normalizeField(input.candidate.whyNow, "candidate.whyNow");
  const recommendedNextAction = normalizeField(input.candidate.recommendedNextAction, "candidate.recommendedNextAction");
  const planningWindow = normalizeField(input.candidate.planningWindow, "candidate.planningWindow");
  const fields = [summary, whyNow, recommendedNextAction, planningWindow] as const;
  const hasEntityAnchor = personRefs.length > 0 || organizationRefs.length > 0 || existingOpportunityRef != null;

  const normalizedCandidateKey = normalizeKey(sourceCandidateKey);
  if (!normalizedCandidateKey) throw new Error("candidate.sourceCandidateKey must contain a stable identity character");
  const idempotencyKey = `${OPPORTUNITY_IMPORT_HANDOFF_VERSION}:${source}:${normalizedCandidateKey}`;
  const handoffId = `handoff:${source.toLocaleLowerCase("en-US")}:${normalizedCandidateKey}`;

  let disposition: OpportunityHandoffDispositionV1;
  const reasonCodes: string[] = [];

  if (qualification === "WATCH") {
    disposition = "WATCH_ONLY";
    reasonCodes.push("SOURCE_CLASSIFIED_WATCH");
  } else if (qualification === "CANDIDATE") {
    disposition = "NEEDS_VERIFICATION";
    reasonCodes.push("SOURCE_NOT_YET_QUALIFIED");
  } else {
    reasonCodes.push(...verificationReasonCodes(truthState as OpportunityHandoffTruthStateV1, hasEntityAnchor, fields));
    if (reasonCodes.length > 0) {
      disposition = "NEEDS_VERIFICATION";
    } else if (existingOpportunityRef) {
      disposition = "LINK_TO_EXISTING";
      reasonCodes.push("EXPLICIT_EXISTING_OPPORTUNITY_REF");
    } else {
      disposition = "READY_FOR_CANONICAL_UPSERT";
      reasonCodes.push("QUALIFIED_EVIDENCE_AND_ENTITY_ANCHOR");
    }
  }

  return freezeDeep({
    version: OPPORTUNITY_IMPORT_HANDOFF_VERSION,
    handoffId,
    idempotencyKey,
    disposition,
    reasonCodes,
    source,
    sourceInteractionRef,
    canonicalMatchPolicy: existingOpportunityRef ? "EXPLICIT_EXISTING_REF_ONLY" : "SOURCE_IDENTITY_ONLY",
    payload: {
      sourceCandidateKey,
      title,
      qualification: qualification as OpportunityHandoffQualificationV1,
      truthState: truthState as OpportunityHandoffTruthStateV1,
      evidenceRefs: [...evidenceRefs],
      personRefs: [...personRefs],
      organizationRefs: [...organizationRefs],
      existingOpportunityRef,
      summary,
      whyNow,
      recommendedNextAction,
      planningWindow
    },
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
