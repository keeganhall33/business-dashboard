import {
  CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1,
  type CrossSourceOpportunityBindingResultV1
} from "@/lib/relationship-intelligence/cross-source-opportunity-binding-v1";
import {
  OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
  normalizeOpportunitySignalsV1,
  type OpportunitySignalIntakeResultV1,
  type OpportunitySignalSourceKindV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const CROSS_SOURCE_OPPORTUNITY_CAPTURE_CERTIFICATION_V1_VERSION =
  "CROSS_SOURCE_OPPORTUNITY_CAPTURE_CERTIFICATION_V1" as const;

export type CrossSourceOpportunityCaptureCertificationIssueV1 =
  | "BINDING_RESULT_BLOCKED"
  | "BINDING_ARTIFACT_STALE"
  | "BINDING_ARTIFACT_FROM_FUTURE"
  | "INTAKE_ARTIFACT_STALE"
  | "INTAKE_ARTIFACT_FROM_FUTURE"
  | "INTAKE_RESULT_DRIFT"
  | "BINDING_RECORD_OBSERVATION_MISSING"
  | "BINDING_RECORD_PROJECTION_MISMATCH"
  | "UNBOUND_RECORD_PROJECTED_OPPORTUNITY"
  | "VERIFY_REQUIRED_RECORD_MUTATED"
  | "CANONICAL_GROUP_MISSING";

export type CrossSourceOpportunityCaptureRecordV1 = Readonly<{
  canonicalOpportunityRef: string;
  disposition: "MULTI_SOURCE_CAPTURED" | "SINGLE_SOURCE_CAPTURED" | "VERIFY_REQUIRED" | "RESEARCH_REQUIRED" | "SUPPRESSED";
  sourceKinds: readonly OpportunitySignalSourceKindV1[];
  sourceEventKeys: readonly string[];
  captureIds: readonly string[];
  evidenceRefs: readonly string[];
  signalType: string;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  opportunityCertainty: "NOT_ESTABLISHED";
  confidenceFromSourceCount: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CrossSourceOpportunityCaptureCertificationInputV1 = Readonly<{
  bindingResult: CrossSourceOpportunityBindingResultV1;
  intakeResult: OpportunitySignalIntakeResultV1;
  evaluatedAt: string | Date;
  maximumArtifactAgeMinutes: number;
  maximumSignalAgeDays?: number;
}>;

export type CrossSourceOpportunityCaptureCertificationResultV1 = Readonly<{
  version: typeof CROSS_SOURCE_OPPORTUNITY_CAPTURE_CERTIFICATION_V1_VERSION;
  generatedAt: string;
  status: "VERIFIED" | "BLOCKED";
  issues: readonly CrossSourceOpportunityCaptureCertificationIssueV1[];
  records: readonly CrossSourceOpportunityCaptureRecordV1[];
  sourceCountConfidence: "NOT_ESTABLISHED";
  inferencePolicy: "EXACT_CANONICAL_OPPORTUNITY_LINEAGE_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    persistenceMutationAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_ARTIFACT_AGE_MINUTES = 10_080;

const LIMITATIONS = Object.freeze([
  "This certification proves only that an already-governed cross-source binding projection is carried into the canonical opportunity intake without hidden fuzzy merging, dropped canonical groups, or source-count confidence inflation.",
  "Multiple Boardroom, ChatGPT, or email observations on one exact canonical opportunity do not establish opportunity quality, sponsor interest, authority, warm access, budget, likelihood, confidence, monetary value, causality, or expected outcome.",
  "This layer is read-only analysis. It cannot create or merge CRM records, mutate the relationship graph, persist opportunities, discover private contacts, perform outreach, spend, contract, or bypass approval."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  persistenceMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

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

function boundedAge(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_ARTIFACT_AGE_MINUTES) {
    throw new Error(`maximumArtifactAgeMinutes must be an integer between 1 and ${MAX_ARTIFACT_AGE_MINUTES}`);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function blocked(generatedAt: string, issues: readonly CrossSourceOpportunityCaptureCertificationIssueV1[]): CrossSourceOpportunityCaptureCertificationResultV1 {
  return freezeDeep({
    version: CROSS_SOURCE_OPPORTUNITY_CAPTURE_CERTIFICATION_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues) as readonly CrossSourceOpportunityCaptureCertificationIssueV1[],
    records: Object.freeze([]),
    sourceCountConfidence: "NOT_ESTABLISHED" as const,
    inferencePolicy: "EXACT_CANONICAL_OPPORTUNITY_LINEAGE_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}

function artifactIssue(
  artifactAt: string,
  evaluatedAtMs: number,
  maximumAgeMs: number,
  futureIssue: CrossSourceOpportunityCaptureCertificationIssueV1,
  staleIssue: CrossSourceOpportunityCaptureCertificationIssueV1
): CrossSourceOpportunityCaptureCertificationIssueV1 | null {
  const artifactAtMs = Date.parse(artifactAt);
  if (!Number.isFinite(artifactAtMs)) throw new Error("artifact generatedAt must be a valid timestamp");
  if (artifactAtMs > evaluatedAtMs) return futureIssue;
  if (evaluatedAtMs - artifactAtMs > maximumAgeMs) return staleIssue;
  return null;
}

export function certifyCrossSourceOpportunityCaptureV1(
  input: CrossSourceOpportunityCaptureCertificationInputV1
): CrossSourceOpportunityCaptureCertificationResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = instant(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumAgeMs = boundedAge(input.maximumArtifactAgeMinutes) * MINUTE_MS;
  const issues: CrossSourceOpportunityCaptureCertificationIssueV1[] = [];

  if (input.bindingResult.version !== CROSS_SOURCE_OPPORTUNITY_BINDING_VERSION_V1 || input.bindingResult.status !== "READY") {
    issues.push("BINDING_RESULT_BLOCKED");
  }
  const bindingAgeIssue = artifactIssue(
    input.bindingResult.generatedAt,
    evaluatedAtMs,
    maximumAgeMs,
    "BINDING_ARTIFACT_FROM_FUTURE",
    "BINDING_ARTIFACT_STALE"
  );
  if (bindingAgeIssue) issues.push(bindingAgeIssue);
  if (input.intakeResult.version !== OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1) issues.push("INTAKE_RESULT_DRIFT");
  const intakeAgeIssue = artifactIssue(
    input.intakeResult.generatedAt,
    evaluatedAtMs,
    maximumAgeMs,
    "INTAKE_ARTIFACT_FROM_FUTURE",
    "INTAKE_ARTIFACT_STALE"
  );
  if (intakeAgeIssue) issues.push(intakeAgeIssue);

  if (issues.length > 0) return blocked(generatedAt, issues);

  const observationByCaptureId = new Map(input.bindingResult.observations.map((observation) => [observation.captureId, observation] as const));
  for (const record of input.bindingResult.records) {
    const observation = observationByCaptureId.get(record.captureId);
    if (!observation) {
      issues.push("BINDING_RECORD_OBSERVATION_MISSING");
      continue;
    }
    const observedOpportunityRef = observation.opportunityRef ?? null;
    if (record.disposition === "UNBOUND" && record.projectedOpportunityRef !== null) issues.push("UNBOUND_RECORD_PROJECTED_OPPORTUNITY");
    if (record.disposition === "VERIFY_REQUIRED" && observedOpportunityRef !== record.existingOpportunityRef) issues.push("VERIFY_REQUIRED_RECORD_MUTATED");
    if ((record.disposition === "BOUND" || record.disposition === "ALREADY_BOUND") && observedOpportunityRef !== record.projectedOpportunityRef) {
      issues.push("BINDING_RECORD_PROJECTION_MISMATCH");
    }
  }

  const recomputed = normalizeOpportunitySignalsV1({
    observations: input.bindingResult.observations,
    evaluatedAt: input.intakeResult.generatedAt,
    maximumSignalAgeDays: input.maximumSignalAgeDays
  });
  if (stable(recomputed) !== stable(input.intakeResult)) issues.push("INTAKE_RESULT_DRIFT");

  const decisionsByOpportunity = new Map(
    input.intakeResult.decisions
      .filter((decision) => decision.canonicalOpportunityRef)
      .map((decision) => [decision.canonicalOpportunityRef as string, decision] as const)
  );
  const expectedOpportunityRefs = uniqueSorted(
    input.bindingResult.observations
      .map((observation) => observation.opportunityRef ?? null)
      .filter((value): value is string => Boolean(value))
  );
  for (const opportunityRef of expectedOpportunityRefs) {
    if (!decisionsByOpportunity.has(opportunityRef)) issues.push("CANONICAL_GROUP_MISSING");
  }

  if (issues.length > 0) return blocked(generatedAt, issues);

  const records = expectedOpportunityRefs.map((canonicalOpportunityRef): CrossSourceOpportunityCaptureRecordV1 => {
    const decision = decisionsByOpportunity.get(canonicalOpportunityRef);
    if (!decision) throw new Error("canonical intake group disappeared after certification");
    let disposition: CrossSourceOpportunityCaptureRecordV1["disposition"];
    if (decision.disposition === "VERIFY_REQUIRED") disposition = "VERIFY_REQUIRED";
    else if (decision.disposition === "RESEARCH_REQUIRED") disposition = "RESEARCH_REQUIRED";
    else if (decision.disposition === "SUPPRESS") disposition = "SUPPRESSED";
    else disposition = decision.sourceKinds.length > 1 ? "MULTI_SOURCE_CAPTURED" : "SINGLE_SOURCE_CAPTURED";

    return freezeDeep({
      canonicalOpportunityRef,
      disposition,
      sourceKinds: [...decision.sourceKinds],
      sourceEventKeys: [...decision.sourceEventKeys],
      captureIds: [...decision.captureIds],
      evidenceRefs: [...decision.evidenceRefs],
      signalType: decision.signalType,
      canonicalOrganizationRef: decision.canonicalOrganizationRef,
      canonicalPersonRef: decision.canonicalPersonRef,
      opportunityCertainty: "NOT_ESTABLISHED" as const,
      confidenceFromSourceCount: "NOT_ESTABLISHED" as const,
      monetaryValue: null
    });
  });

  return freezeDeep({
    version: CROSS_SOURCE_OPPORTUNITY_CAPTURE_CERTIFICATION_V1_VERSION,
    generatedAt,
    status: "VERIFIED" as const,
    issues: Object.freeze([]),
    records,
    sourceCountConfidence: "NOT_ESTABLISHED" as const,
    inferencePolicy: "EXACT_CANONICAL_OPPORTUNITY_LINEAGE_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
