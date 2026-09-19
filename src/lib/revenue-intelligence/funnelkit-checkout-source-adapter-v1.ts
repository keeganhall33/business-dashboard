import type {
  CheckoutReconciliationObservationV1,
  CheckoutReconciliationTruthV1,
} from "../checkout-diagnostics/source-reconciliation-v1";

export const FUNNELKIT_CHECKOUT_SOURCE_ADAPTER_VERSION =
  "FUNNELKIT_CHECKOUT_SOURCE_ADAPTER_V1" as const;

export type FunnelKitCheckoutSourceAdapterReasonV1 =
  | "ADAPTED"
  | "INVALID_INPUT"
  | "FUTURE_EVIDENCE"
  | "FUTURE_RANGE"
  | "COMPLETE_EVIDENCE_INCOMPLETE"
  | "SECRET_LIKE_EVIDENCE_REF";

export type FunnelKitCheckoutSourceSnapshotV1 = Readonly<{
  sourceTruth: CheckoutReconciliationTruthV1;
  range: Readonly<{ startDate: string; endDate: string }>;
  observedAt: string;
  completeThrough: string | null;
  metricDefinitionId: string | null;
  completionCount: number | null;
  evidenceRefs: readonly string[];
}>;

export type FunnelKitCheckoutSourceAdapterInputV1 = Readonly<{
  generatedAt: string;
  snapshot: FunnelKitCheckoutSourceSnapshotV1;
}>;

export type FunnelKitCheckoutSourceAdapterResultV1 = Readonly<{
  version: typeof FUNNELKIT_CHECKOUT_SOURCE_ADAPTER_VERSION;
  status: "ADAPTED" | "REJECTED";
  reasonCode: FunnelKitCheckoutSourceAdapterReasonV1;
  observation: CheckoutReconciliationObservationV1 | null;
  limitations: readonly string[];
  authority: Readonly<{
    networkCallPerformed: false;
    credentialAccessPerformed: false;
    persistencePerformed: false;
    externalMutationAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

const TRUTH_STATES = new Set<CheckoutReconciliationTruthV1>([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE",
]);
const MAX_EVIDENCE_REFS = 10;
const SECRET_LIKE_REF =
  /(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i;
const LIMITATION =
  "This adapter normalizes an already-authorized FunnelKit snapshot only. It performs no provider request and does not establish attribution, causality, conversion lift, revenue impact, confidence, or monetary value.";

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function dateOnlyValue(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.NaN;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
}

function validRange(value: unknown): value is { startDate: string; endDate: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  if (Object.keys(range).some((key) => key !== "startDate" && key !== "endDate")) {
    return false;
  }
  const start = dateOnlyValue(range.startDate);
  const end = dateOnlyValue(range.endDate);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

function validMetricDefinitionId(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 100 &&
      !/[\r\n]/.test(value))
  );
}

function validCompletionCount(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) >= 0);
}

function validEvidenceRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[\r\n]/.test(value)
  );
}

function authority() {
  return {
    networkCallPerformed: false as const,
    credentialAccessPerformed: false as const,
    persistencePerformed: false as const,
    externalMutationAllowed: false as const,
    approvalBypassAllowed: false as const,
  };
}

function rejected(
  reasonCode: Exclude<FunnelKitCheckoutSourceAdapterReasonV1, "ADAPTED">,
  limitations: string[] = [LIMITATION],
): FunnelKitCheckoutSourceAdapterResultV1 {
  return Object.freeze({
    version: FUNNELKIT_CHECKOUT_SOURCE_ADAPTER_VERSION,
    status: "REJECTED" as const,
    reasonCode,
    observation: null,
    limitations: Object.freeze([...limitations]),
    authority: Object.freeze(authority()),
  });
}

export function adaptFunnelKitCheckoutSourceV1(
  input: FunnelKitCheckoutSourceAdapterInputV1,
): FunnelKitCheckoutSourceAdapterResultV1 {
  if (
    !input ||
    !canonicalInstant(input.generatedAt) ||
    !input.snapshot ||
    !TRUTH_STATES.has(input.snapshot.sourceTruth) ||
    !validRange(input.snapshot.range) ||
    !canonicalInstant(input.snapshot.observedAt) ||
    (input.snapshot.completeThrough !== null &&
      !Number.isFinite(dateOnlyValue(input.snapshot.completeThrough))) ||
    !validMetricDefinitionId(input.snapshot.metricDefinitionId) ||
    !validCompletionCount(input.snapshot.completionCount) ||
    !Array.isArray(input.snapshot.evidenceRefs) ||
    input.snapshot.evidenceRefs.length > MAX_EVIDENCE_REFS ||
    !input.snapshot.evidenceRefs.every(validEvidenceRef)
  ) {
    return rejected("INVALID_INPUT");
  }

  if (input.snapshot.evidenceRefs.some((ref) => SECRET_LIKE_REF.test(ref))) {
    return rejected("SECRET_LIKE_EVIDENCE_REF", [
      "Evidence references must contain identifiers or provenance pointers, never credentials or secret-like material.",
      LIMITATION,
    ]);
  }

  const generatedAtMs = Date.parse(input.generatedAt);
  if (Date.parse(input.snapshot.observedAt) > generatedAtMs) {
    return rejected("FUTURE_EVIDENCE", [
      "FunnelKit evidence is future-dated relative to adapter generation time.",
      LIMITATION,
    ]);
  }

  const generatedDate = input.generatedAt.slice(0, 10);
  if (dateOnlyValue(input.snapshot.range.endDate) > dateOnlyValue(generatedDate)) {
    return rejected("FUTURE_RANGE", [
      "FunnelKit evidence range extends beyond the adapter generation date.",
      LIMITATION,
    ]);
  }

  if (input.snapshot.sourceTruth === "COMPLETE") {
    const completeThrough = dateOnlyValue(input.snapshot.completeThrough);
    const rangeEnd = dateOnlyValue(input.snapshot.range.endDate);
    if (
      !Number.isFinite(completeThrough) ||
      completeThrough < rangeEnd ||
      input.snapshot.metricDefinitionId === null ||
      input.snapshot.completionCount === null ||
      input.snapshot.evidenceRefs.length === 0
    ) {
      return rejected("COMPLETE_EVIDENCE_INCOMPLETE", [
        "COMPLETE FunnelKit evidence requires coverage through the range end plus an explicit metric definition, completion count, and provenance reference.",
        LIMITATION,
      ]);
    }
  }

  const observation: CheckoutReconciliationObservationV1 = {
    source: "FUNNELKIT",
    truthState: input.snapshot.sourceTruth,
    range: {
      startDate: input.snapshot.range.startDate,
      endDate: input.snapshot.range.endDate,
    },
    observedAt: input.snapshot.observedAt,
    completeThrough: input.snapshot.completeThrough,
    metricDefinitionId: input.snapshot.metricDefinitionId?.trim() ?? null,
    completionCount: input.snapshot.completionCount,
    evidenceRefs: input.snapshot.evidenceRefs.map((ref) => ref.trim()).sort(),
  };

  Object.freeze(observation.range);
  Object.freeze(observation.evidenceRefs);
  Object.freeze(observation);

  return Object.freeze({
    version: FUNNELKIT_CHECKOUT_SOURCE_ADAPTER_VERSION,
    status: "ADAPTED" as const,
    reasonCode: "ADAPTED" as const,
    observation,
    limitations: Object.freeze([LIMITATION]),
    authority: Object.freeze(authority()),
  });
}
