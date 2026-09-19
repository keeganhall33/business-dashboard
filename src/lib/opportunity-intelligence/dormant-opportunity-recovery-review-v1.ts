export const DORMANT_OPPORTUNITY_RECOVERY_REVIEW_VERSION_V1 = "DormantOpportunityRecoveryReviewV1" as const;

export type DormantOpportunityLifecycleStateV1 =
  | "ACTIVE"
  | "DORMANT"
  | "PAUSED"
  | "DECLINED"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "WITHDRAWN";

export type DormantOpportunityEvidenceIntegrityV1 = "SUPPORTED" | "PARTIAL" | "CONFLICTED";

export type DormantOpportunityRecoverySignalTypeV1 =
  | "INBOUND_ACTIVITY"
  | "EMAIL_ACTIVITY"
  | "RELATIONSHIP_CHANGE"
  | "DECISION_MAKER_CHANGE"
  | "PLANNING_WINDOW"
  | "BOARDROOM_SIGNAL"
  | "CHATGPT_CAPTURE"
  | "MARKET_SIGNAL";

export type DormantOpportunityRecoverySignalV1 = Readonly<{
  signalId: string;
  opportunityId: string;
  signalType: DormantOpportunityRecoverySignalTypeV1;
  observedAt: string;
  sourceRef: string;
  evidenceRefs: readonly string[];
  integrity: DormantOpportunityEvidenceIntegrityV1;
  requiresVerification: boolean;
}>;

export type DormantOpportunityHistoryV1 = Readonly<{
  opportunityId: string;
  lifecycleState: DormantOpportunityLifecycleStateV1;
  lastMeaningfulActivityAt: string;
  recordObservedAt: string;
  evidenceRefs: readonly string[];
  integrity: DormantOpportunityEvidenceIntegrityV1;
  doNotContact: boolean;
}>;

export type DormantOpportunityRecoveryDispositionV1 =
  | "RECOVERY_CANDIDATE"
  | "VERIFY_REQUIRED"
  | "DORMANT_NO_RECOVERY_SIGNAL"
  | "NOT_DORMANT"
  | "SUPPRESSED"
  | "UNAVAILABLE";

export type DormantOpportunityRecoveryReviewV1 = Readonly<{
  contractVersion: typeof DORMANT_OPPORTUNITY_RECOVERY_REVIEW_VERSION_V1;
  status: "LIVE" | "BLOCKED" | "UNAVAILABLE";
  opportunityId: string | null;
  evaluatedAt: string;
  disposition: DormantOpportunityRecoveryDispositionV1;
  dormantForDays: number | null;
  qualifyingSignalIds: readonly string[];
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  limitations: readonly string[];
  currentInterest: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  buyerAuthority: "NOT_ESTABLISHED";
  introductionWillingness: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  timingCertainty: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    opportunityMutationAllowed: false;
    relationshipMutationAllowed: false;
    crmMutationAllowed: false;
    contactDiscoveryAllowed: false;
    outreachAllowed: false;
    spendAllowed: false;
    contractAllowed: false;
    approvalBypassAllowed: false;
    externalActionAllowed: false;
  }>;
}>;

const DAY_MS = 86_400_000;
const DEFAULT_DORMANCY_MS = 60 * DAY_MS;
const DEFAULT_SIGNAL_MAX_AGE_MS = 30 * DAY_MS;
const TERMINAL_STATES = new Set<DormantOpportunityLifecycleStateV1>([
  "DECLINED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "WITHDRAWN",
]);
const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  opportunityMutationAllowed: false as const,
  relationshipMutationAllowed: false as const,
  crmMutationAllowed: false as const,
  contactDiscoveryAllowed: false as const,
  outreachAllowed: false as const,
  spendAllowed: false as const,
  contractAllowed: false as const,
  approvalBypassAllowed: false as const,
  externalActionAllowed: false as const,
});
const LIMITATIONS = Object.freeze([
  "Recovery candidates are evidence-review prompts only. They do not establish renewed interest, available budget, buyer authority, introduction willingness, or opportunity certainty.",
  "A planning-window or market signal records only the supplied observation. It does not establish a sponsorship link, commitment, or timing certainty.",
  "Email, Boardroom, ChatGPT, relationship, and market observations must already be governed evidence tied to the exact canonical opportunity. This contract does not discover or fabricate relationships or contact information.",
  "No external outreach or consequential action is authorized by this review. Any such action remains subject to existing approval policy.",
] as const);

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function duration(value: number | undefined, fallback: number, label: string, maximum: number): number {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be finite, positive, and no greater than ${maximum}ms`);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function build(input: Readonly<{
  status: DormantOpportunityRecoveryReviewV1["status"];
  opportunityId: string | null;
  evaluatedAt: string;
  disposition: DormantOpportunityRecoveryDispositionV1;
  dormantForDays: number | null;
  qualifyingSignalIds?: readonly string[];
  evidenceRefs?: readonly string[];
  reasonCodes: readonly string[];
}>): DormantOpportunityRecoveryReviewV1 {
  return Object.freeze({
    contractVersion: DORMANT_OPPORTUNITY_RECOVERY_REVIEW_VERSION_V1,
    status: input.status,
    opportunityId: input.opportunityId,
    evaluatedAt: input.evaluatedAt,
    disposition: input.disposition,
    dormantForDays: input.dormantForDays,
    qualifyingSignalIds: Object.freeze(unique(input.qualifyingSignalIds ?? [])),
    evidenceRefs: Object.freeze(unique(input.evidenceRefs ?? [])),
    reasonCodes: Object.freeze(unique(input.reasonCodes)),
    limitations: LIMITATIONS,
    currentInterest: "NOT_ESTABLISHED",
    opportunityCertainty: "NOT_ESTABLISHED",
    buyerAuthority: "NOT_ESTABLISHED",
    introductionWillingness: "NOT_ESTABLISHED",
    budgetAvailability: "NOT_ESTABLISHED",
    timingCertainty: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    authority: AUTHORITY,
  });
}

/** Reviews already-canonical historical opportunities for evidence-backed recovery. */
export function reviewDormantOpportunityRecoveryV1(input: Readonly<{
  history: DormantOpportunityHistoryV1 | null;
  signals: readonly DormantOpportunityRecoverySignalV1[];
  evaluatedAt: string;
  dormancyMs?: number;
  signalMaxAgeMs?: number;
}>): DormantOpportunityRecoveryReviewV1 {
  const evaluatedAtMs = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();
  const dormancyMs = duration(input.dormancyMs, DEFAULT_DORMANCY_MS, "dormancyMs", 365 * DAY_MS);
  const signalMaxAgeMs = duration(input.signalMaxAgeMs, DEFAULT_SIGNAL_MAX_AGE_MS, "signalMaxAgeMs", 180 * DAY_MS);

  if (!input.history) {
    return build({ status: "UNAVAILABLE", opportunityId: null, evaluatedAt, disposition: "UNAVAILABLE", dormantForDays: null, reasonCodes: ["CANONICAL_OPPORTUNITY_HISTORY_UNAVAILABLE"] });
  }

  const history = input.history;
  const opportunityId = history.opportunityId.trim();
  if (!opportunityId) {
    return build({ status: "BLOCKED", opportunityId: null, evaluatedAt, disposition: "UNAVAILABLE", dormantForDays: null, reasonCodes: ["CANONICAL_OPPORTUNITY_ID_MISSING"] });
  }

  const lastActivityMs = timestamp(history.lastMeaningfulActivityAt, "history.lastMeaningfulActivityAt");
  const recordObservedAtMs = timestamp(history.recordObservedAt, "history.recordObservedAt");
  if (lastActivityMs > evaluatedAtMs || recordObservedAtMs > evaluatedAtMs) {
    return build({ status: "BLOCKED", opportunityId, evaluatedAt, disposition: "VERIFY_REQUIRED", dormantForDays: null, evidenceRefs: history.evidenceRefs, reasonCodes: ["HISTORY_FUTURE_DATED"] });
  }

  const dormantForMs = evaluatedAtMs - lastActivityMs;
  const dormantForDays = Math.floor(dormantForMs / DAY_MS);
  if (history.doNotContact || TERMINAL_STATES.has(history.lifecycleState)) {
    return build({ status: "LIVE", opportunityId, evaluatedAt, disposition: "SUPPRESSED", dormantForDays, evidenceRefs: history.evidenceRefs, reasonCodes: [history.doNotContact ? "DO_NOT_CONTACT" : "TERMINAL_OPPORTUNITY_STATE"] });
  }
  if (history.integrity !== "SUPPORTED" || history.evidenceRefs.length === 0) {
    return build({ status: "BLOCKED", opportunityId, evaluatedAt, disposition: "VERIFY_REQUIRED", dormantForDays, evidenceRefs: history.evidenceRefs, reasonCodes: [history.integrity === "CONFLICTED" ? "HISTORY_EVIDENCE_CONFLICTED" : "HISTORY_EVIDENCE_INCOMPLETE"] });
  }
  if (dormantForMs < dormancyMs) {
    return build({ status: "LIVE", opportunityId, evaluatedAt, disposition: "NOT_DORMANT", dormantForDays, evidenceRefs: history.evidenceRefs, reasonCodes: ["DORMANCY_THRESHOLD_NOT_MET"] });
  }

  const exactSignals = input.signals.filter((signal) => signal.opportunityId.trim() === opportunityId);
  const wrongOpportunitySignalPresent = input.signals.some((signal) => signal.opportunityId.trim() !== opportunityId);
  const qualifying: DormantOpportunityRecoverySignalV1[] = [];
  let stale = false;
  let future = false;
  let verify = false;
  let conflicted = false;
  let incomplete = false;

  for (const signal of exactSignals) {
    const observedAtMs = timestamp(signal.observedAt, `signal.${signal.signalId}.observedAt`);
    if (observedAtMs > evaluatedAtMs) { future = true; continue; }
    if (evaluatedAtMs - observedAtMs > signalMaxAgeMs) { stale = true; continue; }
    if (signal.integrity === "CONFLICTED") { conflicted = true; continue; }
    if (signal.integrity !== "SUPPORTED" || !signal.sourceRef.trim() || signal.evidenceRefs.length === 0) { incomplete = true; continue; }
    if (signal.requiresVerification) { verify = true; continue; }
    qualifying.push(signal);
  }

  const evidenceRefs = unique([
    ...history.evidenceRefs,
    ...qualifying.flatMap((signal) => signal.evidenceRefs),
    ...qualifying.map((signal) => signal.sourceRef),
  ]);

  if (future || conflicted || verify) {
    return build({
      status: "BLOCKED",
      opportunityId,
      evaluatedAt,
      disposition: "VERIFY_REQUIRED",
      dormantForDays,
      evidenceRefs,
      reasonCodes: [future ? "RECOVERY_SIGNAL_FUTURE_DATED" : "", conflicted ? "RECOVERY_SIGNAL_CONFLICTED" : "", verify ? "RECOVERY_SIGNAL_REQUIRES_VERIFICATION" : ""],
    });
  }

  if (qualifying.length === 0) {
    return build({
      status: incomplete ? "BLOCKED" : "LIVE",
      opportunityId,
      evaluatedAt,
      disposition: incomplete ? "VERIFY_REQUIRED" : "DORMANT_NO_RECOVERY_SIGNAL",
      dormantForDays,
      evidenceRefs: history.evidenceRefs,
      reasonCodes: [incomplete ? "RECOVERY_SIGNAL_EVIDENCE_INCOMPLETE" : "NO_FRESH_SUPPORTED_RECOVERY_SIGNAL", stale ? "STALE_RECOVERY_SIGNAL_IGNORED" : "", wrongOpportunitySignalPresent ? "OTHER_OPPORTUNITY_SIGNAL_IGNORED" : ""],
    });
  }

  return build({
    status: "LIVE",
    opportunityId,
    evaluatedAt,
    disposition: "RECOVERY_CANDIDATE",
    dormantForDays,
    qualifyingSignalIds: qualifying.map((signal) => signal.signalId),
    evidenceRefs,
    reasonCodes: ["FRESH_SUPPORTED_RECOVERY_SIGNAL", stale ? "STALE_RECOVERY_SIGNAL_IGNORED" : "", wrongOpportunitySignalPresent ? "OTHER_OPPORTUNITY_SIGNAL_IGNORED" : ""],
  });
}
