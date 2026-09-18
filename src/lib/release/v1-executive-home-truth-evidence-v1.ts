import { evaluateExecutiveApprovalEvidenceV1 } from "@/lib/executive-home/approval-truth-guard-v1";
import type { ExecutiveHomeDecisionRoomDrilldownV1 } from "@/lib/executive-home/decision-room-drilldown";
import type { ExecutiveHomeFixtureV1 } from "@/lib/executive-home/fixtures";
import type { V1ReleaseGateEvidenceV1 } from "@/lib/release/v1-release-certificate-v1";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

const SHA_40 = /^[0-9a-f]{40}$/;
const FIXTURE_PROVENANCE = /(?:^|[\s:_-])fixture(?:$|[\s:_-])/i;
const UNSAFE_EVIDENCE_REF = /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

const EXPECTED_PULSE_IDS = ["revenue", "orders", "sessions", "meta"] as const;
const EXPECTED_CARD_SECTIONS = [
  "WHAT_MATTERS_NOW",
  "WHAT_CHANGED",
  "DO_NOW_PREPARE_MONITOR",
  "KEEGAN_ACTION_REQUIRED",
  "TOP_OPPORTUNITIES",
  "CURRENT_HYPOTHESES_EXPERIMENTS",
  "LEARNING_SINCE_LAST_REVIEW",
  "DATA_COVERAGE_GAPS"
] as const;

export type V1ExecutiveHomeTruthBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "NON_PRODUCTION_OBSERVATION"
  | "INVALID_FRESHNESS_POLICY"
  | "INVALID_OBSERVED_AT"
  | "INVALID_EVALUATED_AT"
  | "FUTURE_OBSERVATION"
  | "STALE_OBSERVATION"
  | "INVALID_GENERATED_AT"
  | "GENERATED_AFTER_OBSERVATION"
  | "OVERVIEW_PROJECTION_TIMESTAMP_MISMATCH"
  | "MISSING_EXPECTED_SURFACE"
  | "DUPLICATE_EXPECTED_SURFACE"
  | "FIXTURE_PROVENANCE"
  | "NON_LIVE_DECISION_ROOM"
  | "UNAVAILABLE_VALUE_OVERSTATED"
  | "APPROVAL_TRUTH_MISMATCH"
  | "MISSING_PROVENANCE"
  | "UNSAFE_PROVENANCE";

export type V1ExecutiveHomeTruthBlockerV1 = {
  code: V1ExecutiveHomeTruthBlockerCodeV1;
  detail: string;
};

export type V1ExecutiveHomeTruthEvidenceInputV1 = {
  releaseSha: string;
  observedAt: string;
  evaluatedAt: string;
  maxObservationAgeMs: number;
  environment: "PRODUCTION" | "NON_PRODUCTION" | "UNKNOWN";
  evidenceRefs: readonly string[];
  overview: DashboardOverviewResponse;
  projection: {
    home: ExecutiveHomeFixtureV1;
    decisionRoom: ExecutiveHomeDecisionRoomDrilldownV1;
  };
};

export type V1ExecutiveHomeTruthEvidenceResultV1 = {
  contractVersion: "V1_EXECUTIVE_HOME_TRUTH_EVIDENCE_V1";
  status: "PASS" | "BLOCKED";
  blockers: readonly V1ExecutiveHomeTruthBlockerV1[];
  gateEvidence: V1ReleaseGateEvidenceV1;
  authority: {
    canDeploy: false;
    canMutateProduction: false;
    canApprove: false;
    canSendEmail: false;
  };
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function push(
  blockers: V1ExecutiveHomeTruthBlockerV1[],
  code: V1ExecutiveHomeTruthBlockerCodeV1,
  detail: string
) {
  blockers.push({ code, detail });
}

function cleanEvidenceRefs(refs: readonly string[]): { refs: string[]; unsafe: boolean } {
  const cleaned = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
  const unsafe = cleaned.some((ref) => UNSAFE_EVIDENCE_REF.test(ref));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function fixtureProvenance(projection: V1ExecutiveHomeTruthEvidenceInputV1["projection"]): string[] {
  const home = projection.home;
  const values = [
    ...home.command_center.business_pulse.map((entry) => entry.source),
    ...home.command_center.kpis.map((entry) => entry.source),
    ...home.command_center.system_glance.map((entry) => entry.source),
    ...home.command_center.strategy_path.steps.map((entry) => entry.provenance),
    ...projection.decisionRoom.evidence_refs.map((entry) => entry.provenance)
  ];
  return values.filter((value) => FIXTURE_PROVENANCE.test(value));
}

function validateExpectedSurfaces(
  projection: V1ExecutiveHomeTruthEvidenceInputV1["projection"],
  blockers: V1ExecutiveHomeTruthBlockerV1[]
) {
  const pulseIds = projection.home.command_center.business_pulse.map((entry) => entry.id);
  const duplicatePulseIds = duplicateValues(pulseIds);
  const missingPulseIds = EXPECTED_PULSE_IDS.filter((id) => !pulseIds.includes(id));

  if (missingPulseIds.length > 0) {
    push(
      blockers,
      "MISSING_EXPECTED_SURFACE",
      `Executive Home business pulse is missing required metric(s): ${missingPulseIds.join(", ")}.`
    );
  }
  if (duplicatePulseIds.length > 0) {
    push(
      blockers,
      "DUPLICATE_EXPECTED_SURFACE",
      `Executive Home business pulse contains duplicate metric id(s): ${duplicatePulseIds.join(", ")}.`
    );
  }

  const cardSections = projection.home.cards.map((card) => card.section);
  const duplicateCardSections = duplicateValues(cardSections);
  const missingCardSections = EXPECTED_CARD_SECTIONS.filter((section) => !cardSections.includes(section));

  if (missingCardSections.length > 0) {
    push(
      blockers,
      "MISSING_EXPECTED_SURFACE",
      `Executive Home is missing required decision section(s): ${missingCardSections.join(", ")}.`
    );
  }
  if (duplicateCardSections.length > 0) {
    push(
      blockers,
      "DUPLICATE_EXPECTED_SURFACE",
      `Executive Home contains duplicate decision section(s): ${duplicateCardSections.join(", ")}.`
    );
  }
}

function validateUnavailableSemantics(
  home: ExecutiveHomeFixtureV1,
  blockers: V1ExecutiveHomeTruthBlockerV1[]
) {
  for (const metric of home.command_center.business_pulse) {
    if (metric.value === "Unavailable" && metric.truth_state !== "UNKNOWN") {
      push(
        blockers,
        "UNAVAILABLE_VALUE_OVERSTATED",
        `${metric.id} is unavailable but is labeled ${metric.truth_state}; unavailable production data must remain UNKNOWN.`
      );
    }
  }

  for (const item of home.command_center.system_glance) {
    if (item.value === "Unavailable" && item.truth_state !== "UNKNOWN") {
      push(
        blockers,
        "UNAVAILABLE_VALUE_OVERSTATED",
        `${item.id} is unavailable but is labeled ${item.truth_state}; unavailable canonical state must remain UNKNOWN.`
      );
    }
  }
}

function validateApprovalTruth(
  input: V1ExecutiveHomeTruthEvidenceInputV1,
  blockers: V1ExecutiveHomeTruthBlockerV1[]
) {
  const evidence = evaluateExecutiveApprovalEvidenceV1(input.overview);
  const home = input.projection.home;
  const kpi = home.command_center.kpis.find((entry) => entry.id === "keegan-review");
  const card = home.cards.find((entry) => entry.section === "KEEGAN_ACTION_REQUIRED");
  const action = home.command_center.keegan_actions.find((entry) => entry.id === "approval-queue");
  const executionLane = home.command_center.intelligence_engine.find((entry) => entry.id === "execution");

  if (!kpi || !card || !action || !executionLane) {
    push(
      blockers,
      "MISSING_EXPECTED_SURFACE",
      "Executive Home is missing one or more canonical approval surfaces required for truth verification."
    );
    return;
  }

  if (evidence.state === "UNKNOWN" || evidence.state === "CONFLICTED") {
    const expectedTruth = evidence.state === "CONFLICTED" ? "CONFLICTED" : "UNKNOWN";
    const anyPositive = (evidence.actionQueueCount ?? 0) > 0 || (evidence.bottleneckCount ?? 0) > 0;
    const expectedApproval = anyPositive ? "KEEGAN_ACTION_REQUIRED" : "NONE";

    if (
      kpi.truth_state !== expectedTruth ||
      card.state !== expectedTruth ||
      card.freshness !== "UNKNOWN" ||
      card.approval_state !== expectedApproval ||
      action.approval_state !== expectedApproval ||
      executionLane.truth_state !== expectedTruth
    ) {
      push(
        blockers,
        "APPROVAL_TRUTH_MISMATCH",
        `Approval evidence is ${evidence.state}, but Executive Home does not preserve that fail-closed state consistently.`
      );
    }
    return;
  }

  const count = evidence.actionQueueCount ?? evidence.bottleneckCount;
  const expectedApproval = (count ?? 0) > 0 ? "KEEGAN_ACTION_REQUIRED" : "NONE";
  if (
    kpi.truth_state !== "KNOWN" ||
    card.state !== "FACT" ||
    card.approval_state !== expectedApproval ||
    action.approval_state !== expectedApproval
  ) {
    push(
      blockers,
      "APPROVAL_TRUTH_MISMATCH",
      "Known canonical approval evidence is not represented consistently across Executive Home approval surfaces."
    );
  }
}

/**
 * Compiles one current production Executive Home observation into the canonical
 * Useful V1 `EXECUTIVE_HOME_TRUTH` release gate.
 *
 * This function does not fetch production, authenticate, mutate state, approve an
 * action, or infer missing business facts. It verifies a projection that has already
 * been observed through the production path and fails closed when provenance,
 * freshness, fixture isolation, approval truth, or expected surfaces are ambiguous.
 */
export function compileV1ExecutiveHomeTruthEvidenceV1(
  input: V1ExecutiveHomeTruthEvidenceInputV1
): V1ExecutiveHomeTruthEvidenceResultV1 {
  const blockers: V1ExecutiveHomeTruthBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const observedAtMs = timestamp(input.observedAt);
  const evaluatedAtMs = timestamp(input.evaluatedAt);
  const generatedAtMs = timestamp(input.projection.home.generated_at);
  const overviewTimestampMs = timestamp(input.overview.timestamp);
  const safeRefs = cleanEvidenceRefs(input.evidenceRefs);

  if (!releaseShaValid) {
    push(blockers, "INVALID_RELEASE_SHA", "Executive Home truth evidence requires an exact lowercase 40-character release SHA.");
  }
  if (input.environment !== "PRODUCTION") {
    push(blockers, "NON_PRODUCTION_OBSERVATION", "Only an explicitly observed production Executive Home can satisfy the release truth gate.");
  }
  if (!Number.isSafeInteger(input.maxObservationAgeMs) || input.maxObservationAgeMs < 0) {
    push(blockers, "INVALID_FRESHNESS_POLICY", "maxObservationAgeMs must be a non-negative safe integer supplied by the release caller.");
  }
  if (observedAtMs == null) {
    push(blockers, "INVALID_OBSERVED_AT", "observedAt must be a valid timestamp.");
  }
  if (evaluatedAtMs == null) {
    push(blockers, "INVALID_EVALUATED_AT", "evaluatedAt must be a valid timestamp.");
  }
  if (observedAtMs != null && evaluatedAtMs != null) {
    if (observedAtMs > evaluatedAtMs) {
      push(blockers, "FUTURE_OBSERVATION", "Executive Home observation cannot occur after evaluation time.");
    } else if (
      Number.isSafeInteger(input.maxObservationAgeMs) &&
      input.maxObservationAgeMs >= 0 &&
      evaluatedAtMs - observedAtMs > input.maxObservationAgeMs
    ) {
      push(blockers, "STALE_OBSERVATION", "Executive Home observation exceeds the caller-declared release freshness window.");
    }
  }

  if (generatedAtMs == null || overviewTimestampMs == null) {
    push(blockers, "INVALID_GENERATED_AT", "Executive Home and overview generation timestamps must both be valid.");
  } else {
    if (input.projection.home.generated_at !== input.overview.timestamp || input.projection.decisionRoom.generated_at !== input.overview.timestamp) {
      push(
        blockers,
        "OVERVIEW_PROJECTION_TIMESTAMP_MISMATCH",
        "Executive Home, Decision Room, and source overview must share the same canonical generation timestamp."
      );
    }
    if (observedAtMs != null && generatedAtMs > observedAtMs) {
      push(blockers, "GENERATED_AFTER_OBSERVATION", "Executive Home cannot be generated after the claimed production observation.");
    }
  }

  validateExpectedSurfaces(input.projection, blockers);
  validateUnavailableSemantics(input.projection.home, blockers);
  validateApprovalTruth(input, blockers);

  if (input.projection.decisionRoom.source_mode !== "LIVE_DASHBOARD_OVERVIEW") {
    push(
      blockers,
      "NON_LIVE_DECISION_ROOM",
      "Executive Home Decision Room must be sourced from LIVE_DASHBOARD_OVERVIEW for release truth evidence."
    );
  }

  const fixtureSources = fixtureProvenance(input.projection);
  if (fixtureSources.length > 0) {
    push(
      blockers,
      "FIXTURE_PROVENANCE",
      "Fixture provenance is present in a production Executive Home observation and cannot certify release truth."
    );
  }

  if (safeRefs.unsafe) {
    push(blockers, "UNSAFE_PROVENANCE", "Executive Home evidence references contain secret-like material and were removed from release evidence.");
  } else if (safeRefs.refs.length === 0) {
    push(blockers, "MISSING_PROVENANCE", "Executive Home release truth requires at least one privacy-safe evidence reference.");
  }

  const status = blockers.length === 0 ? "PASS" : "BLOCKED";
  const stale = blockers.some((entry) => entry.code === "STALE_OBSERVATION");

  return {
    contractVersion: "V1_EXECUTIVE_HOME_TRUTH_EVIDENCE_V1",
    status,
    blockers,
    gateEvidence: {
      gateId: "EXECUTIVE_HOME_TRUTH",
      state: status === "PASS" ? "PASS" : "BLOCKED",
      freshness: status === "PASS" ? "CURRENT" : stale ? "STALE" : "UNKNOWN",
      observedAt: input.observedAt,
      evidenceRefs: safeRefs.refs,
      releaseSha: releaseShaValid ? input.releaseSha : null,
      actionRequirement: "NONE",
      detail: status === "PASS"
        ? "Observed production Executive Home preserved canonical truth, unavailable states, approval uncertainty, live provenance, and fixture isolation."
        : "Executive Home release truth remains blocked until every production-truth verification passes."
    },
    authority: {
      canDeploy: false,
      canMutateProduction: false,
      canApprove: false,
      canSendEmail: false
    }
  };
}
