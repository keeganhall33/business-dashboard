import type { CheckoutSourceReconciliationV1 } from "@/lib/checkout-diagnostics/source-reconciliation-v1";
import type {
  ClarityBehaviorNormalizerResultV1,
  ClarityFrictionFindingV1,
} from "@/lib/website-conversion/clarity-behavior-normalizer-v1";
import type { ClarityExportAdapterResultV1 } from "@/lib/website-conversion/clarity-export-adapter-v1";

export const CONVERSION_FRICTION_DECISION_BRIEF_VERSION_V1 =
  "ConversionFrictionDecisionBriefV1" as const;

export type ConversionFrictionDecisionStatusV1 =
  | "READY_FOR_INTERNAL_REVIEW"
  | "VERIFY_TRACKING"
  | "NO_MATERIAL_FRICTION"
  | "INSUFFICIENT_EVIDENCE"
  | "STALE"
  | "BLOCKED";

export type ConversionFrictionNextActionV1 =
  | "REVIEW_SUPPORTING_BEHAVIOR_EVIDENCE"
  | "VERIFY_CHECKOUT_MEASUREMENT_BEFORE_CRO_CHANGE";

export type ConversionFrictionCheckoutEvidenceStateV1 =
  | CheckoutSourceReconciliationV1["status"]
  | "NOT_SUPPLIED";

export type ConversionFrictionCandidateV1 = Readonly<{
  findingId: string;
  severity: ClarityFrictionFindingV1["severity"];
  reasonCode: ClarityFrictionFindingV1["reasonCode"];
  actionCategory: ClarityFrictionFindingV1["actionCategory"];
  observedValue: number;
  threshold: number;
  clarityEvidenceRefs: readonly string[];
  checkoutEvidenceState: ConversionFrictionCheckoutEvidenceStateV1;
  checkoutEvidenceRefs: readonly string[];
  nextInternalAction: ConversionFrictionNextActionV1;
  experimentReadiness: "NEEDS_LOCALIZATION_AND_MEASUREMENT_PLAN";
  causality: "NOT_ESTABLISHED";
  conversionAttribution: "NOT_ESTABLISHED";
  revenueImpact: null;
  confidence: "NOT_ESTABLISHED";
  externalActionAllowed: false;
}>;

export type ConversionFrictionDecisionBriefV1 = Readonly<{
  contractVersion: typeof CONVERSION_FRICTION_DECISION_BRIEF_VERSION_V1;
  status: ConversionFrictionDecisionStatusV1;
  generatedAt: string;
  periodId: string | null;
  claritySourceState: ClarityExportAdapterResultV1["sourceState"] | "UNAVAILABLE";
  checkoutEvidenceState: ConversionFrictionCheckoutEvidenceStateV1;
  candidates: readonly ConversionFrictionCandidateV1[];
  reasonCodes: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    draftExperimentAllowed: true;
    websiteMutationAllowed: false;
    trackingMutationAllowed: false;
    pricingMutationAllowed: false;
    metaWriteAllowed: false;
    approvalBypassAllowed: false;
    externalActionAllowed: false;
  }>;
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type ConversionFrictionDecisionBriefInputV1 = Readonly<{
  generatedAt: string;
  clarity: ClarityBehaviorNormalizerResultV1 | null;
  exportEvidence: ClarityExportAdapterResultV1 | null;
  checkoutReconciliation?: CheckoutSourceReconciliationV1 | null;
  maxAgeMs?: number;
}>;

const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1_000;
const MAX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  draftExperimentAllowed: true as const,
  websiteMutationAllowed: false as const,
  trackingMutationAllowed: false as const,
  pricingMutationAllowed: false as const,
  metaWriteAllowed: false as const,
  approvalBypassAllowed: false as const,
  externalActionAllowed: false as const,
});

const LIMITATIONS = Object.freeze([
  "Clarity friction thresholds establish observed behavioral signals only. They do not establish that the signal caused checkout abandonment, purchase loss, or revenue impact.",
  "Checkout reconciliation can establish measurement agreement or disagreement only when definitions and periods are comparable. It does not identify which source is correct and does not create attribution.",
  "Revenue impact, conversion attribution, causal effect, and confidence remain NOT_ESTABLISHED until separately governed evidence supports them.",
  "Recommendations produced here are internal investigation or experiment-preparation steps only. Website, tracking, pricing, Meta, and other production mutations remain approval-gated.",
] as const);

const pacificFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function timestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return new Date(parsed).toISOString();
}

function boundedMaxAge(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_MAX_AGE_MS) {
    throw new Error("maxAgeMs must be finite, positive, and no greater than 7 days");
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function pacificDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("reporting window timestamp is invalid");
  const parts = Object.fromEntries(
    pacificFormatter
      .formatToParts(new Date(parsed))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (!parts.year || !parts.month || !parts.day) {
    throw new Error("reporting window could not be normalized to Pacific date");
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function exportEvidenceRefs(exportEvidence: ClarityExportAdapterResultV1): Set<string> {
  return new Set(
    unique([
      ...exportEvidence.period.metrics.map((metric) => metric.evidenceRef),
      ...exportEvidence.period.events.map((event) => event.evidenceRef),
      ...exportEvidence.dimensions.map((dimension) => dimension.evidenceRef),
    ]),
  );
}

function checkoutEvidenceRefs(
  reconciliation: CheckoutSourceReconciliationV1 | null | undefined,
): string[] {
  if (!reconciliation) return [];
  return unique(reconciliation.sourceCoverage.flatMap((source) => source.evidenceRefs));
}

function emptyResult(input: {
  status: Exclude<ConversionFrictionDecisionStatusV1, "READY_FOR_INTERNAL_REVIEW" | "VERIFY_TRACKING">;
  generatedAt: string;
  periodId: string | null;
  claritySourceState: ConversionFrictionDecisionBriefV1["claritySourceState"];
  checkoutEvidenceState: ConversionFrictionCheckoutEvidenceStateV1;
  reasonCodes: readonly string[];
}): ConversionFrictionDecisionBriefV1 {
  return deepFreeze({
    contractVersion: CONVERSION_FRICTION_DECISION_BRIEF_VERSION_V1,
    status: input.status,
    generatedAt: input.generatedAt,
    periodId: input.periodId,
    claritySourceState: input.claritySourceState,
    checkoutEvidenceState: input.checkoutEvidenceState,
    candidates: [],
    reasonCodes: unique(input.reasonCodes),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
    externalAccessPerformed: false,
    writesPerformed: false,
  });
}

function checkoutRangeMatches(
  exportEvidence: ClarityExportAdapterResultV1,
  reconciliation: CheckoutSourceReconciliationV1,
): boolean {
  const startDate = pacificDate(exportEvidence.reportingWindow.startAt);
  const endDate = pacificDate(exportEvidence.reportingWindow.endAt);
  return (
    reconciliation.expectedRange.startDate === startDate &&
    reconciliation.expectedRange.endDate === endDate
  );
}

function candidateFromFinding(
  finding: ClarityFrictionFindingV1,
  checkoutState: ConversionFrictionCheckoutEvidenceStateV1,
  checkoutRefs: readonly string[],
): ConversionFrictionCandidateV1 {
  return Object.freeze({
    findingId: finding.findingId,
    severity: finding.severity,
    reasonCode: finding.reasonCode,
    actionCategory: finding.actionCategory,
    observedValue: finding.currentValue,
    threshold: finding.threshold,
    clarityEvidenceRefs: Object.freeze(unique(finding.evidenceRefs)),
    checkoutEvidenceState: checkoutState,
    checkoutEvidenceRefs: Object.freeze(unique(checkoutRefs)),
    nextInternalAction:
      checkoutState === "VERIFY_TRACKING"
        ? "VERIFY_CHECKOUT_MEASUREMENT_BEFORE_CRO_CHANGE"
        : "REVIEW_SUPPORTING_BEHAVIOR_EVIDENCE",
    experimentReadiness: "NEEDS_LOCALIZATION_AND_MEASUREMENT_PLAN",
    causality: "NOT_ESTABLISHED",
    conversionAttribution: "NOT_ESTABLISHED",
    revenueImpact: null,
    confidence: "NOT_ESTABLISHED",
    externalActionAllowed: false,
  });
}

/**
 * Joins already-normalized Clarity behavioral findings to the existing checkout
 * source-reconciliation contract. The brief is deliberately read-only: it can
 * prioritize internal investigation or measurement verification, but it cannot
 * convert behavioral correlation into causal, attribution, revenue, or write
 * authority.
 */
export function buildConversionFrictionDecisionBriefV1(
  input: ConversionFrictionDecisionBriefInputV1,
): ConversionFrictionDecisionBriefV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object");
  }

  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const maxAgeMs = boundedMaxAge(input.maxAgeMs);
  const checkout = input.checkoutReconciliation ?? null;
  const checkoutState: ConversionFrictionCheckoutEvidenceStateV1 =
    checkout?.status ?? "NOT_SUPPLIED";

  if (!input.clarity || !input.exportEvidence) {
    return emptyResult({
      status: "INSUFFICIENT_EVIDENCE",
      generatedAt,
      periodId: input.clarity?.currentPeriodId ?? input.exportEvidence?.period.periodId ?? null,
      claritySourceState: input.exportEvidence?.sourceState ?? "UNAVAILABLE",
      checkoutEvidenceState: checkoutState,
      reasonCodes: [
        !input.clarity ? "CLARITY_NORMALIZED_EVIDENCE_MISSING" : "",
        !input.exportEvidence ? "CLARITY_EXPORT_EVIDENCE_MISSING" : "",
      ],
    });
  }

  const clarity = input.clarity;
  const exportEvidence = input.exportEvidence;
  const periodId = clarity.currentPeriodId;

  if (
    clarity.externalAccessPerformed !== false ||
    clarity.writesPerformed !== false ||
    exportEvidence.externalAccessPerformed !== false ||
    exportEvidence.writesPerformed !== false
  ) {
    return emptyResult({
      status: "BLOCKED",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["UPSTREAM_AUTHORITY_WIDENED"],
    });
  }

  if (periodId !== exportEvidence.period.periodId) {
    return emptyResult({
      status: "BLOCKED",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["CLARITY_PERIOD_ID_MISMATCH"],
    });
  }

  const extractedAt = timestamp(exportEvidence.extractedAt, "exportEvidence.extractedAt");
  const extractedAtMs = Date.parse(extractedAt);
  if (extractedAtMs > generatedAtMs) {
    return emptyResult({
      status: "BLOCKED",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["CLARITY_EVIDENCE_FUTURE_DATED"],
    });
  }

  if (exportEvidence.sourceState === "STALE" || generatedAtMs - extractedAtMs > maxAgeMs) {
    return emptyResult({
      status: "STALE",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["CLARITY_EVIDENCE_STALE"],
    });
  }

  if (["PARTIAL", "UNKNOWN", "UNAVAILABLE"].includes(exportEvidence.sourceState)) {
    return emptyResult({
      status: "INSUFFICIENT_EVIDENCE",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: [`CLARITY_SOURCE_${exportEvidence.sourceState}`],
    });
  }

  const allowedEvidenceRefs = exportEvidenceRefs(exportEvidence);
  const provenanceMismatch = clarity.findings.some((finding) =>
    finding.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref)),
  );
  if (provenanceMismatch) {
    return emptyResult({
      status: "BLOCKED",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["CLARITY_FINDING_PROVENANCE_MISMATCH"],
    });
  }

  if (checkout) {
    if (!Number.isFinite(Date.parse(checkout.generatedAt)) || Date.parse(checkout.generatedAt) > generatedAtMs) {
      return emptyResult({
        status: "BLOCKED",
        generatedAt,
        periodId,
        claritySourceState: exportEvidence.sourceState,
        checkoutEvidenceState: checkoutState,
        reasonCodes: ["CHECKOUT_RECONCILIATION_TIME_INVALID"],
      });
    }
    if (!checkoutRangeMatches(exportEvidence, checkout)) {
      return emptyResult({
        status: "BLOCKED",
        generatedAt,
        periodId,
        claritySourceState: exportEvidence.sourceState,
        checkoutEvidenceState: checkoutState,
        reasonCodes: ["CHECKOUT_RANGE_MISMATCH"],
      });
    }
    if (["CONFLICTED", "INVALID_INPUT"].includes(checkout.status)) {
      return emptyResult({
        status: "BLOCKED",
        generatedAt,
        periodId,
        claritySourceState: exportEvidence.sourceState,
        checkoutEvidenceState: checkoutState,
        reasonCodes: [`CHECKOUT_${checkout.status}`],
      });
    }
  }

  if (clarity.findings.length === 0) {
    return emptyResult({
      status: "NO_MATERIAL_FRICTION",
      generatedAt,
      periodId,
      claritySourceState: exportEvidence.sourceState,
      checkoutEvidenceState: checkoutState,
      reasonCodes: ["NO_THRESHOLD_BREACHES_IN_CURRENT_CLARITY_EVIDENCE"],
    });
  }

  const checkoutRefs = checkoutEvidenceRefs(checkout);
  const candidates = clarity.findings.map((finding) =>
    candidateFromFinding(finding, checkoutState, checkoutRefs),
  );
  const verifyTracking = checkout?.status === "VERIFY_TRACKING";

  return deepFreeze({
    contractVersion: CONVERSION_FRICTION_DECISION_BRIEF_VERSION_V1,
    status: verifyTracking ? "VERIFY_TRACKING" : "READY_FOR_INTERNAL_REVIEW",
    generatedAt,
    periodId,
    claritySourceState: exportEvidence.sourceState,
    checkoutEvidenceState: checkoutState,
    candidates,
    reasonCodes: verifyTracking
      ? ["CHECKOUT_MEASUREMENT_DISAGREEMENT_REQUIRES_VERIFICATION"]
      : [
          checkout?.status === "READY"
            ? "BEHAVIORAL_FRICTION_WITH_COMPARABLE_CHECKOUT_MEASUREMENT"
            : "BEHAVIORAL_FRICTION_ONLY_CONVERSION_EFFECT_NOT_ESTABLISHED",
        ],
    limitations: LIMITATIONS,
    authority: AUTHORITY,
    externalAccessPerformed: false,
    writesPerformed: false,
  });
}
