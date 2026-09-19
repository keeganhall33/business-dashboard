import type {
  EarlyPlanningDecisionV1,
  EarlyPlanningTruthStateV1,
  EarlyPlanningWindowResultV1,
  EarlyPlanningWindowV1,
} from "@/lib/relationship-intelligence/early-planning-window-v1";

export const NEXT_PLANNING_CYCLE_REVIEW_VERSION_V1 = "NextPlanningCycleReviewV1" as const;

export type PlanningCycleRecurrenceEvidenceV1 = Readonly<{
  candidateId: string;
  canonicalOpportunityRef: string;
  canonicalOrganizationRef: string | null;
  state: EarlyPlanningTruthStateV1;
  intervalMonths: number | null;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type NextPlanningCycleDispositionV1 =
  | "NEXT_CYCLE_CANDIDATE"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED";

export type NextPlanningCycleStateV1 = "PLAN_AHEAD" | "WINDOW_OPEN" | null;

export type NextPlanningCycleDecisionV1 = Readonly<{
  candidateId: string;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  disposition: NextPlanningCycleDispositionV1;
  cycleState: NextPlanningCycleStateV1;
  previousIdealOutreachDateRange: EarlyPlanningWindowV1 | null;
  nextIdealOutreachDateRange: EarlyPlanningWindowV1 | null;
  cyclesAdvanced: number | null;
  recurrenceIntervalMonths: number | null;
  derivation: "EVIDENCED_RECURRENCE_FROM_PRIOR_WINDOW" | null;
  whyThisWindow: string;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  confidence: "NOT_ESTABLISHED";
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  outreachAuthority: "NOT_GRANTED";
}>;

export type NextPlanningCycleReviewV1 = Readonly<{
  contractVersion: typeof NEXT_PLANNING_CYCLE_REVIEW_VERSION_V1;
  status: "READY" | "NO_MISSED_WINDOWS" | "VERIFY_REQUIRED" | "UNAVAILABLE" | "STALE";
  evaluatedAt: string;
  decisions: readonly NextPlanningCycleDecisionV1[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    crmMutationAllowed: false;
    opportunityMutationAllowed: false;
    relationshipMutationAllowed: false;
    contactDiscoveryAllowed: false;
    outreachAllowed: false;
    spendAllowed: false;
    contractAllowed: false;
    approvalBypassAllowed: false;
    externalActionAllowed: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  crmMutationAllowed: false as const,
  opportunityMutationAllowed: false as const,
  relationshipMutationAllowed: false as const,
  contactDiscoveryAllowed: false as const,
  outreachAllowed: false as const,
  spendAllowed: false as const,
  contractAllowed: false as const,
  approvalBypassAllowed: false as const,
  externalActionAllowed: false as const,
});

const LIMITATIONS = Object.freeze([
  "A next-cycle date range is projected only from a prior evidence-backed planning window plus an exact KNOWN recurrence interval for the same canonical opportunity identity.",
  "Recurring timing does not establish sponsor interest, budget availability, buyer authority, relationship access, confidence, opportunity certainty, or monetary value.",
  "A projected next-cycle range is an internal review candidate only. External outreach remains approval-gated.",
] as const);

const DEFAULT_MAX_PLANNING_AGE_MS = 36 * 60 * 60 * 1_000;
const DEFAULT_MAX_RECURRENCE_AGE_DAYS = 365;
const DAY_MS = 86_400_000;

function timestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function boundedMaxPlanningAge(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_PLANNING_AGE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > 30 * DAY_MS) {
    throw new Error("maxPlanningAgeMs must be finite, positive, and no greater than 30 days");
  }
  return value;
}

function boundedRecurrenceAgeDays(value: number | undefined): number {
  if (value == null) return DEFAULT_MAX_RECURRENCE_AGE_DAYS;
  if (!Number.isInteger(value) || value <= 0 || value > 730) {
    throw new Error("maxRecurrenceAgeDays must be an integer between 1 and 730");
  }
  return value;
}

function frozenWindow(window: EarlyPlanningWindowV1 | null): EarlyPlanningWindowV1 | null {
  if (!window) return null;
  return Object.freeze({ startDate: window.startDate, endDate: window.endDate });
}

function freezeDecision(decision: NextPlanningCycleDecisionV1): NextPlanningCycleDecisionV1 {
  return Object.freeze({
    ...decision,
    previousIdealOutreachDateRange: frozenWindow(decision.previousIdealOutreachDateRange),
    nextIdealOutreachDateRange: frozenWindow(decision.nextIdealOutreachDateRange),
    reasonCodes: Object.freeze([...decision.reasonCodes]),
    evidenceRefs: Object.freeze([...decision.evidenceRefs]),
  });
}

function empty(
  status: Exclude<NextPlanningCycleReviewV1["status"], "READY">,
  evaluatedAt: string,
  issues: readonly string[],
): NextPlanningCycleReviewV1 {
  return Object.freeze({
    contractVersion: NEXT_PLANNING_CYCLE_REVIEW_VERSION_V1,
    status,
    evaluatedAt,
    decisions: Object.freeze([]),
    issues: Object.freeze(unique(issues)),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}

function addUtcMonths(value: string, months: number): string {
  const source = new Date(value);
  const day = source.getUTCDate();
  const target = new Date(source.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

function advancePastWindow(
  prior: EarlyPlanningWindowV1,
  intervalMonths: number,
  evaluatedAtMs: number,
): Readonly<{ window: EarlyPlanningWindowV1; cyclesAdvanced: number }> {
  let startDate = prior.startDate;
  let endDate = prior.endDate;
  let cyclesAdvanced = 0;

  while (Date.parse(endDate) < evaluatedAtMs) {
    startDate = addUtcMonths(startDate, intervalMonths);
    endDate = addUtcMonths(endDate, intervalMonths);
    cyclesAdvanced += 1;
    if (cyclesAdvanced > 120) throw new Error("recurrence projection exceeded bounded cycle limit");
  }

  return Object.freeze({
    window: Object.freeze({ startDate, endDate }),
    cyclesAdvanced,
  });
}

function baseDecision(
  planningDecision: EarlyPlanningDecisionV1,
  overrides: Partial<NextPlanningCycleDecisionV1>,
): NextPlanningCycleDecisionV1 {
  return freezeDecision({
    candidateId: planningDecision.candidateId,
    canonicalOpportunityRef: planningDecision.canonicalOpportunityRef,
    canonicalOrganizationRef: planningDecision.canonicalOrganizationRef,
    disposition: "RESEARCH_REQUIRED",
    cycleState: null,
    previousIdealOutreachDateRange: planningDecision.idealOutreachDateRange,
    nextIdealOutreachDateRange: null,
    cyclesAdvanced: null,
    recurrenceIntervalMonths: null,
    derivation: null,
    whyThisWindow: "No evidence-backed recurrence is available for the next planning cycle.",
    reasonCodes: Object.freeze(["RECURRENCE_EVIDENCE_MISSING"]),
    evidenceRefs: Object.freeze([...planningDecision.evidenceRefs]),
    confidence: "NOT_ESTABLISHED",
    sponsorInterest: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    outreachAuthority: "NOT_GRANTED",
    ...overrides,
  });
}

function normalizeRecurrence(
  evidence: PlanningCycleRecurrenceEvidenceV1,
  index: number,
): PlanningCycleRecurrenceEvidenceV1 {
  const candidateId = requiredText(evidence.candidateId, `recurrenceEvidence[${index}].candidateId`);
  const canonicalOpportunityRef = requiredText(
    evidence.canonicalOpportunityRef,
    `recurrenceEvidence[${index}].canonicalOpportunityRef`,
  );
  const canonicalOrganizationRef = optionalText(
    evidence.canonicalOrganizationRef,
    `recurrenceEvidence[${index}].canonicalOrganizationRef`,
  );
  const observedAt = timestamp(evidence.observedAt, `recurrenceEvidence[${index}].observedAt`);
  const evidenceRefs = unique(evidence.evidenceRefs ?? []);
  const supportedStates: readonly EarlyPlanningTruthStateV1[] = [
    "KNOWN",
    "INFERRED",
    "UNKNOWN",
    "STALE",
    "CONFLICTED",
    "PARTIAL",
  ];
  if (!supportedStates.includes(evidence.state)) {
    throw new Error(`recurrenceEvidence[${index}].state is unsupported`);
  }

  if (evidence.state === "KNOWN") {
    if (!Number.isInteger(evidence.intervalMonths) || (evidence.intervalMonths ?? 0) <= 0 || (evidence.intervalMonths ?? 0) > 60) {
      throw new Error(`recurrenceEvidence[${index}].intervalMonths must be an integer between 1 and 60 for KNOWN evidence`);
    }
    if (evidenceRefs.length === 0) {
      throw new Error(`recurrenceEvidence[${index}] KNOWN evidence requires evidenceRefs`);
    }
  } else if (evidence.intervalMonths != null && (!Number.isInteger(evidence.intervalMonths) || evidence.intervalMonths <= 0 || evidence.intervalMonths > 60)) {
    throw new Error(`recurrenceEvidence[${index}].intervalMonths must be null or an integer between 1 and 60`);
  }

  return Object.freeze({
    candidateId,
    canonicalOpportunityRef,
    canonicalOrganizationRef,
    state: evidence.state,
    intervalMonths: evidence.intervalMonths,
    observedAt,
    evidenceRefs: Object.freeze(evidenceRefs),
  });
}

/**
 * Reviews only already-missed canonical planning windows and surfaces a next
 * cycle candidate when an exact, fresh, KNOWN recurrence interval exists for
 * that same opportunity identity. It never assumes an annual cycle from an
 * event, season, sponsor, or old opportunity merely because one looks likely.
 */
export function reviewNextPlanningCyclesV1(input: Readonly<{
  planning: EarlyPlanningWindowResultV1 | null;
  recurrenceEvidence: readonly PlanningCycleRecurrenceEvidenceV1[];
  evaluatedAt: string;
  maxPlanningAgeMs?: number;
  maxRecurrenceAgeDays?: number;
}>): NextPlanningCycleReviewV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maximumPlanningAgeMs = boundedMaxPlanningAge(input.maxPlanningAgeMs);
  const maximumRecurrenceAgeDays = boundedRecurrenceAgeDays(input.maxRecurrenceAgeDays);

  if (!input.planning) return empty("UNAVAILABLE", evaluatedAt, ["PLANNING_REVIEW_UNAVAILABLE"]);

  const planningGeneratedAt = timestamp(input.planning.generatedAt, "planning.generatedAt");
  const planningGeneratedAtMs = Date.parse(planningGeneratedAt);
  if (planningGeneratedAtMs > evaluatedAtMs || evaluatedAtMs - planningGeneratedAtMs > maximumPlanningAgeMs) {
    return empty("STALE", evaluatedAt, ["PLANNING_REVIEW_OUTSIDE_FRESHNESS_BOUND"]);
  }

  if (
    input.planning.externalResearchPerformed !== false ||
    input.planning.crmMutationPerformed !== false ||
    input.planning.outreachPerformed !== false ||
    input.planning.externalActionAuthorized !== false
  ) {
    return empty("VERIFY_REQUIRED", evaluatedAt, ["PLANNING_REVIEW_AUTHORITY_WIDENED"]);
  }

  const missed = input.planning.decisions.filter((decision) => decision.disposition === "MISSED_PLANNING_WINDOW");
  if (missed.length === 0) return empty("NO_MISSED_WINDOWS", evaluatedAt, []);

  const normalized = input.recurrenceEvidence.map((evidence, index) => normalizeRecurrence(evidence, index));
  const byCandidate = new Map<string, PlanningCycleRecurrenceEvidenceV1[]>();
  for (const evidence of normalized) {
    const current = byCandidate.get(evidence.candidateId) ?? [];
    current.push(evidence);
    byCandidate.set(evidence.candidateId, current);
  }

  const duplicateCandidates = missed
    .filter((decision) => (byCandidate.get(decision.candidateId)?.length ?? 0) > 1)
    .map((decision) => decision.candidateId);
  if (duplicateCandidates.length > 0) {
    return empty(
      "VERIFY_REQUIRED",
      evaluatedAt,
      duplicateCandidates.map((candidateId) => `AMBIGUOUS_RECURRENCE_EVIDENCE:${candidateId}`),
    );
  }

  const decisions: NextPlanningCycleDecisionV1[] = [];
  let verificationRequired = false;

  for (const planningDecision of missed) {
    if (!planningDecision.idealOutreachDateRange || !planningDecision.canonicalOpportunityRef) {
      decisions.push(
        baseDecision(planningDecision, {
          reasonCodes: Object.freeze([
            !planningDecision.idealOutreachDateRange ? "PRIOR_PLANNING_WINDOW_MISSING" : "",
            !planningDecision.canonicalOpportunityRef ? "CANONICAL_OPPORTUNITY_IDENTITY_MISSING" : "",
          ].filter(Boolean)),
          whyThisWindow: "A missed planning window needs both an exact prior range and canonical opportunity identity before a recurrence can be reviewed.",
        }),
      );
      continue;
    }

    const recurrence = byCandidate.get(planningDecision.candidateId)?.[0];
    if (!recurrence) {
      decisions.push(baseDecision(planningDecision, {}));
      continue;
    }

    const identityMismatch =
      recurrence.canonicalOpportunityRef !== planningDecision.canonicalOpportunityRef ||
      recurrence.canonicalOrganizationRef !== planningDecision.canonicalOrganizationRef;
    if (identityMismatch) {
      verificationRequired = true;
      decisions.push(
        baseDecision(planningDecision, {
          disposition: "VERIFY_REQUIRED",
          reasonCodes: Object.freeze(["RECURRENCE_CANONICAL_IDENTITY_MISMATCH"]),
          evidenceRefs: Object.freeze(unique([...planningDecision.evidenceRefs, ...recurrence.evidenceRefs])),
          whyThisWindow: "Recurrence evidence does not match the exact canonical opportunity and organization identity of the missed planning window.",
        }),
      );
      continue;
    }

    const recurrenceObservedAtMs = Date.parse(recurrence.observedAt);
    const recurrenceTooOld = evaluatedAtMs - recurrenceObservedAtMs > maximumRecurrenceAgeDays * DAY_MS;
    if (recurrenceObservedAtMs > evaluatedAtMs || recurrenceTooOld) {
      verificationRequired = true;
      decisions.push(
        baseDecision(planningDecision, {
          disposition: "VERIFY_REQUIRED",
          recurrenceIntervalMonths: recurrence.intervalMonths,
          reasonCodes: Object.freeze([
            recurrenceObservedAtMs > evaluatedAtMs ? "RECURRENCE_EVIDENCE_FUTURE_DATED" : "RECURRENCE_EVIDENCE_STALE",
          ]),
          evidenceRefs: Object.freeze(unique([...planningDecision.evidenceRefs, ...recurrence.evidenceRefs])),
          whyThisWindow: "Recurrence evidence is outside the allowed observation window and cannot support a projected next cycle.",
        }),
      );
      continue;
    }

    if (recurrence.state === "UNKNOWN") {
      decisions.push(
        baseDecision(planningDecision, {
          recurrenceIntervalMonths: recurrence.intervalMonths,
          reasonCodes: Object.freeze(["RECURRENCE_INTERVAL_UNKNOWN"]),
          evidenceRefs: Object.freeze(unique([...planningDecision.evidenceRefs, ...recurrence.evidenceRefs])),
          whyThisWindow: "The recurrence interval is explicitly unknown, so the next planning cycle remains a research task.",
        }),
      );
      continue;
    }

    if (recurrence.state !== "KNOWN" || recurrence.intervalMonths == null) {
      verificationRequired = true;
      decisions.push(
        baseDecision(planningDecision, {
          disposition: "VERIFY_REQUIRED",
          recurrenceIntervalMonths: recurrence.intervalMonths,
          reasonCodes: Object.freeze([`RECURRENCE_EVIDENCE_${recurrence.state}`]),
          evidenceRefs: Object.freeze(unique([...planningDecision.evidenceRefs, ...recurrence.evidenceRefs])),
          whyThisWindow: "Only exact KNOWN recurrence evidence can support a projected next planning cycle.",
        }),
      );
      continue;
    }

    const projected = advancePastWindow(planningDecision.idealOutreachDateRange, recurrence.intervalMonths, evaluatedAtMs);
    const cycleState: Exclude<NextPlanningCycleStateV1, null> =
      evaluatedAtMs < Date.parse(projected.window.startDate) ? "PLAN_AHEAD" : "WINDOW_OPEN";

    decisions.push(
      baseDecision(planningDecision, {
        disposition: "NEXT_CYCLE_CANDIDATE",
        cycleState,
        nextIdealOutreachDateRange: projected.window,
        cyclesAdvanced: projected.cyclesAdvanced,
        recurrenceIntervalMonths: recurrence.intervalMonths,
        derivation: "EVIDENCED_RECURRENCE_FROM_PRIOR_WINDOW",
        reasonCodes: Object.freeze(["EXACT_EVIDENCED_RECURRENCE_AVAILABLE"]),
        evidenceRefs: Object.freeze(unique([...planningDecision.evidenceRefs, ...recurrence.evidenceRefs])),
        whyThisWindow: "Projects the prior evidence-backed planning window forward only by the exact KNOWN recurrence interval evidenced for this canonical opportunity identity.",
      }),
    );
  }

  decisions.sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  return Object.freeze({
    contractVersion: NEXT_PLANNING_CYCLE_REVIEW_VERSION_V1,
    status: verificationRequired ? "VERIFY_REQUIRED" : "READY",
    evaluatedAt,
    decisions: Object.freeze(decisions),
    issues: Object.freeze(
      verificationRequired
        ? unique(decisions.flatMap((decision) =>
            decision.disposition === "VERIFY_REQUIRED" ? decision.reasonCodes : [],
          ))
        : [],
    ),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}
