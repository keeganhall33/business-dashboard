import type { EarlyPlanningTruthStateV1 } from "./early-planning-window-v1";

export const PLANNING_WINDOW_LEAD_TIME_LEARNING_V1_VERSION = "PLANNING_WINDOW_LEAD_TIME_LEARNING_V1" as const;

export type PlanningWindowLeadTimeClassificationV1 = "EARLY_ENOUGH" | "ON_TIME" | "LATE";

export type PlanningWindowLeadTimeRejectionReasonV1 =
  | "MISSING_CANONICAL_ANCHOR"
  | "ANCHOR_MISMATCH"
  | "DETECTION_NOT_KNOWN"
  | "WINDOW_NOT_KNOWN"
  | "MISSING_DETECTION_EVIDENCE"
  | "MISSING_WINDOW_EVIDENCE"
  | "FUTURE_DETECTION"
  | "FUTURE_WINDOW_OPEN"
  | "FUTURE_EVIDENCE_RECORD"
  | "DETECTION_RECORDED_BEFORE_DETECTED";

export type PlanningWindowLeadTimeEvidencePointV1 = Readonly<{
  state: EarlyPlanningTruthStateV1;
  candidateId: string;
  canonicalOrganizationRef?: string | null;
  canonicalOpportunityRef?: string | null;
  recordedAt: string | Date;
  evidenceRefs: readonly string[];
}>;

export type PlanningWindowFirstDetectionV1 = PlanningWindowLeadTimeEvidencePointV1 &
  Readonly<{
    firstDetectedAt: string | Date;
  }>;

export type PlanningWindowConfirmedOpenV1 = PlanningWindowLeadTimeEvidencePointV1 &
  Readonly<{
    windowOpensAt: string | Date;
  }>;

export type PlanningWindowLeadTimeHistoricalSampleV1 = Readonly<{
  sampleId: string;
  cohortKey: string;
  detection: PlanningWindowFirstDetectionV1;
  confirmedWindow: PlanningWindowConfirmedOpenV1;
}>;

export type PlanningWindowLeadTimeThresholdsV1 = Readonly<{
  earlyEnoughMinDays: number;
  onTimeMinDays: number;
  minimumCohortSamples: number;
}>;

export type PlanningWindowLeadTimeAcceptedSampleV1 = Readonly<{
  sampleId: string;
  cohortKey: string;
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  firstDetectedAt: string;
  windowOpensAt: string;
  observedLeadTimeDays: number;
  classification: PlanningWindowLeadTimeClassificationV1;
  evidenceRefs: readonly string[];
}>;

export type PlanningWindowLeadTimeWithheldSampleV1 = Readonly<{
  sampleId: string;
  cohortKey: string;
  reason: PlanningWindowLeadTimeRejectionReasonV1;
  evidenceRefs: readonly string[];
}>;

export type PlanningWindowLeadTimeCohortV1 = Readonly<{
  cohortKey: string;
  status: "ESTABLISHED" | "NOT_ESTABLISHED";
  sampleCount: number;
  minimumRequiredSamples: number;
  observedMinLeadTimeDays: number | null;
  observedMedianLeadTimeDays: number | null;
  observedMaxLeadTimeDays: number | null;
  classificationCounts:
    | Readonly<{
        earlyEnough: number;
        onTime: number;
        late: number;
      }>
    | null;
  evidenceRefs: readonly string[];
  historicalObservationOnly: true;
}>;

export type PlanningWindowLeadTimeLearningInputV1 = Readonly<{
  samples: readonly PlanningWindowLeadTimeHistoricalSampleV1[];
  now: string | Date;
  thresholds: PlanningWindowLeadTimeThresholdsV1;
}>;

export type PlanningWindowLeadTimeLearningResultV1 = Readonly<{
  version: typeof PLANNING_WINDOW_LEAD_TIME_LEARNING_V1_VERSION;
  generatedAt: string;
  thresholds: PlanningWindowLeadTimeThresholdsV1;
  acceptedSamples: readonly PlanningWindowLeadTimeAcceptedSampleV1[];
  withheldSamples: readonly PlanningWindowLeadTimeWithheldSampleV1[];
  cohorts: readonly PlanningWindowLeadTimeCohortV1[];
  counts: Readonly<{
    reviewed: number;
    accepted: number;
    withheld: number;
    establishedCohorts: number;
  }>;
  historicalObservationOnly: true;
  predictionPerformed: false;
  confidenceInferred: false;
  causalityInferred: false;
  monetaryValueInferred: false;
  opportunityCertaintyInferred: false;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  outreachPerformed: false;
  externalActionAuthorized: false;
}>;

const DAY_MS = 86_400_000;
const MAX_SAMPLES = 1_000;
const MAX_THRESHOLD_DAYS = 3_650;
const MAX_MINIMUM_COHORT_SAMPLES = 100;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function evidenceRefs(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function thresholdInteger(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function roundDays(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint]!;
  return roundDays((sorted[midpoint - 1]! + sorted[midpoint]!) / 2);
}

function normalizeThresholds(value: PlanningWindowLeadTimeThresholdsV1): PlanningWindowLeadTimeThresholdsV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("thresholds must be an object");
  const earlyEnoughMinDays = thresholdInteger(
    value.earlyEnoughMinDays,
    0,
    MAX_THRESHOLD_DAYS,
    "thresholds.earlyEnoughMinDays"
  );
  const onTimeMinDays = thresholdInteger(value.onTimeMinDays, 0, MAX_THRESHOLD_DAYS, "thresholds.onTimeMinDays");
  const minimumCohortSamples = thresholdInteger(
    value.minimumCohortSamples,
    2,
    MAX_MINIMUM_COHORT_SAMPLES,
    "thresholds.minimumCohortSamples"
  );
  if (earlyEnoughMinDays <= onTimeMinDays) {
    throw new Error("thresholds.earlyEnoughMinDays must be greater than thresholds.onTimeMinDays");
  }
  return freezeDeep({ earlyEnoughMinDays, onTimeMinDays, minimumCohortSamples });
}

function classify(days: number, thresholds: PlanningWindowLeadTimeThresholdsV1): PlanningWindowLeadTimeClassificationV1 {
  if (days >= thresholds.earlyEnoughMinDays) return "EARLY_ENOUGH";
  if (days >= thresholds.onTimeMinDays) return "ON_TIME";
  return "LATE";
}

function sameAnchor(
  detection: PlanningWindowFirstDetectionV1,
  confirmedWindow: PlanningWindowConfirmedOpenV1
): boolean {
  return (
    detection.candidateId.trim() === confirmedWindow.candidateId.trim() &&
    (detection.canonicalOrganizationRef?.trim() || null) === (confirmedWindow.canonicalOrganizationRef?.trim() || null) &&
    (detection.canonicalOpportunityRef?.trim() || null) === (confirmedWindow.canonicalOpportunityRef?.trim() || null)
  );
}

function combinedRefs(sample: PlanningWindowLeadTimeHistoricalSampleV1): readonly string[] {
  return Object.freeze(
    [...new Set([...sample.detection.evidenceRefs, ...sample.confirmedWindow.evidenceRefs].map((value) => value.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    )
  );
}

function withheld(
  sampleId: string,
  cohortKey: string,
  reason: PlanningWindowLeadTimeRejectionReasonV1,
  refs: readonly string[]
): PlanningWindowLeadTimeWithheldSampleV1 {
  return freezeDeep({ sampleId, cohortKey, reason, evidenceRefs: [...refs] });
}

export function learnPlanningWindowLeadTimesV1(
  input: PlanningWindowLeadTimeLearningInputV1
): PlanningWindowLeadTimeLearningResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.samples)) throw new Error("samples must be an array");
  if (input.samples.length > MAX_SAMPLES) throw new Error(`samples must contain at most ${MAX_SAMPLES} items`);

  const now = timestamp(input.now, "now");
  const nowMs = Date.parse(now);
  const thresholds = normalizeThresholds(input.thresholds);
  const acceptedSamples: PlanningWindowLeadTimeAcceptedSampleV1[] = [];
  const withheldSamples: PlanningWindowLeadTimeWithheldSampleV1[] = [];
  const seenSampleIds = new Set<string>();

  input.samples.forEach((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) throw new Error(`samples[${index}] must be an object`);
    const sampleId = requiredText(sample.sampleId, `samples[${index}].sampleId`);
    if (seenSampleIds.has(sampleId)) throw new Error(`duplicate sampleId: ${sampleId}`);
    seenSampleIds.add(sampleId);
    const cohortKey = requiredText(sample.cohortKey, `samples[${index}].cohortKey`);
    if (!sample.detection || typeof sample.detection !== "object") throw new Error(`samples[${index}].detection must be an object`);
    if (!sample.confirmedWindow || typeof sample.confirmedWindow !== "object") {
      throw new Error(`samples[${index}].confirmedWindow must be an object`);
    }

    const detectionRefs = evidenceRefs(sample.detection.evidenceRefs, `samples[${index}].detection.evidenceRefs`);
    const windowRefs = evidenceRefs(sample.confirmedWindow.evidenceRefs, `samples[${index}].confirmedWindow.evidenceRefs`);
    const refs = Object.freeze([...new Set([...detectionRefs, ...windowRefs])].sort((a, b) => a.localeCompare(b)));

    const candidateId = requiredText(sample.detection.candidateId, `samples[${index}].detection.candidateId`);
    requiredText(sample.confirmedWindow.candidateId, `samples[${index}].confirmedWindow.candidateId`);
    const organizationRef = optionalText(
      sample.detection.canonicalOrganizationRef,
      `samples[${index}].detection.canonicalOrganizationRef`
    );
    const opportunityRef = optionalText(
      sample.detection.canonicalOpportunityRef,
      `samples[${index}].detection.canonicalOpportunityRef`
    );
    optionalText(
      sample.confirmedWindow.canonicalOrganizationRef,
      `samples[${index}].confirmedWindow.canonicalOrganizationRef`
    );
    optionalText(
      sample.confirmedWindow.canonicalOpportunityRef,
      `samples[${index}].confirmedWindow.canonicalOpportunityRef`
    );

    if (!organizationRef && !opportunityRef) {
      withheldSamples.push(withheld(sampleId, cohortKey, "MISSING_CANONICAL_ANCHOR", refs));
      return;
    }
    if (!sameAnchor(sample.detection, sample.confirmedWindow)) {
      withheldSamples.push(withheld(sampleId, cohortKey, "ANCHOR_MISMATCH", refs));
      return;
    }
    if (sample.detection.state !== "KNOWN") {
      withheldSamples.push(withheld(sampleId, cohortKey, "DETECTION_NOT_KNOWN", refs));
      return;
    }
    if (sample.confirmedWindow.state !== "KNOWN") {
      withheldSamples.push(withheld(sampleId, cohortKey, "WINDOW_NOT_KNOWN", refs));
      return;
    }
    if (detectionRefs.length === 0) {
      withheldSamples.push(withheld(sampleId, cohortKey, "MISSING_DETECTION_EVIDENCE", refs));
      return;
    }
    if (windowRefs.length === 0) {
      withheldSamples.push(withheld(sampleId, cohortKey, "MISSING_WINDOW_EVIDENCE", refs));
      return;
    }

    const firstDetectedAt = timestamp(sample.detection.firstDetectedAt, `samples[${index}].detection.firstDetectedAt`);
    const detectionRecordedAt = timestamp(sample.detection.recordedAt, `samples[${index}].detection.recordedAt`);
    const windowOpensAt = timestamp(sample.confirmedWindow.windowOpensAt, `samples[${index}].confirmedWindow.windowOpensAt`);
    const windowRecordedAt = timestamp(sample.confirmedWindow.recordedAt, `samples[${index}].confirmedWindow.recordedAt`);

    if (Date.parse(firstDetectedAt) > nowMs) {
      withheldSamples.push(withheld(sampleId, cohortKey, "FUTURE_DETECTION", refs));
      return;
    }
    if (Date.parse(windowOpensAt) > nowMs) {
      withheldSamples.push(withheld(sampleId, cohortKey, "FUTURE_WINDOW_OPEN", refs));
      return;
    }
    if (Date.parse(detectionRecordedAt) > nowMs || Date.parse(windowRecordedAt) > nowMs) {
      withheldSamples.push(withheld(sampleId, cohortKey, "FUTURE_EVIDENCE_RECORD", refs));
      return;
    }
    if (Date.parse(detectionRecordedAt) < Date.parse(firstDetectedAt)) {
      withheldSamples.push(withheld(sampleId, cohortKey, "DETECTION_RECORDED_BEFORE_DETECTED", refs));
      return;
    }

    const observedLeadTimeDays = roundDays((Date.parse(windowOpensAt) - Date.parse(firstDetectedAt)) / DAY_MS);
    acceptedSamples.push(
      freezeDeep({
        sampleId,
        cohortKey,
        candidateId,
        canonicalOrganizationRef: organizationRef,
        canonicalOpportunityRef: opportunityRef,
        firstDetectedAt,
        windowOpensAt,
        observedLeadTimeDays,
        classification: classify(observedLeadTimeDays, thresholds),
        evidenceRefs: [...refs]
      })
    );
  });

  acceptedSamples.sort((a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.sampleId.localeCompare(b.sampleId));
  withheldSamples.sort((a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.sampleId.localeCompare(b.sampleId));

  const grouped = new Map<string, PlanningWindowLeadTimeAcceptedSampleV1[]>();
  for (const sample of acceptedSamples) {
    const values = grouped.get(sample.cohortKey) ?? [];
    values.push(sample);
    grouped.set(sample.cohortKey, values);
  }

  const cohorts: PlanningWindowLeadTimeCohortV1[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortKey, samples]) => {
      const refs = Object.freeze(
        [...new Set(samples.flatMap((sample) => sample.evidenceRefs))].sort((a, b) => a.localeCompare(b))
      );
      if (samples.length < thresholds.minimumCohortSamples) {
        return freezeDeep({
          cohortKey,
          status: "NOT_ESTABLISHED" as const,
          sampleCount: samples.length,
          minimumRequiredSamples: thresholds.minimumCohortSamples,
          observedMinLeadTimeDays: null,
          observedMedianLeadTimeDays: null,
          observedMaxLeadTimeDays: null,
          classificationCounts: null,
          evidenceRefs: [...refs],
          historicalObservationOnly: true as const
        });
      }

      const leadTimes = samples.map((sample) => sample.observedLeadTimeDays);
      return freezeDeep({
        cohortKey,
        status: "ESTABLISHED" as const,
        sampleCount: samples.length,
        minimumRequiredSamples: thresholds.minimumCohortSamples,
        observedMinLeadTimeDays: Math.min(...leadTimes),
        observedMedianLeadTimeDays: median(leadTimes),
        observedMaxLeadTimeDays: Math.max(...leadTimes),
        classificationCounts: {
          earlyEnough: samples.filter((sample) => sample.classification === "EARLY_ENOUGH").length,
          onTime: samples.filter((sample) => sample.classification === "ON_TIME").length,
          late: samples.filter((sample) => sample.classification === "LATE").length
        },
        evidenceRefs: [...refs],
        historicalObservationOnly: true as const
      });
    });

  return freezeDeep({
    version: PLANNING_WINDOW_LEAD_TIME_LEARNING_V1_VERSION,
    generatedAt: now,
    thresholds,
    acceptedSamples,
    withheldSamples,
    cohorts,
    counts: {
      reviewed: input.samples.length,
      accepted: acceptedSamples.length,
      withheld: withheldSamples.length,
      establishedCohorts: cohorts.filter((cohort) => cohort.status === "ESTABLISHED").length
    },
    historicalObservationOnly: true,
    predictionPerformed: false,
    confidenceInferred: false,
    causalityInferred: false,
    monetaryValueInferred: false,
    opportunityCertaintyInferred: false,
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    outreachPerformed: false,
    externalActionAuthorized: false
  });
}
