export const DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION = "DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_V1" as const;

export type DormantTruthStateV1 = "KNOWN" | "PARTIAL" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type DormantThreadStateV1 = "OPEN" | "ACTIVE" | "RESOLVED" | "REJECTED" | "WON" | "LOST" | "IRRELEVANT" | "UNKNOWN";
export type DormantBusinessSignalV1 =
  | "PARTNERSHIP_DISCUSSION"
  | "EXPLICIT_FOLLOW_UP"
  | "ART_INTEREST"
  | "COMMISSION_INTEREST"
  | "LICENSING"
  | "SPONSORSHIP"
  | "COLLABORATION"
  | "CHARITY"
  | "EVENT"
  | "MEDIA"
  | "COLLECTIBLES"
  | "PURCHASE"
  | "WARM_INTRO"
  | "STRATEGIC_RELATIONSHIP"
  | "NONE";

export type DormantOwnerRecommendationV1 = "KEEGAN" | "IOANA" | "JEEVES_PREP" | "WAIT";
export type DormantCandidateClassV1 =
  | "UNRESOLVED_BUSINESS_DISCUSSION"
  | "OVERDUE_EXPLICIT_FOLLOW_UP"
  | "INBOUND_INTEREST"
  | "WARM_INTRO"
  | "STALE_STRATEGIC_RELATIONSHIP";

export type DormantCanonicalActivityV1 = {
  activityId: string;
  conversationKey: string;
  occurredAt: string | Date;
  sourceRef: string;
  evidenceRefs: readonly string[];
  truthState: DormantTruthStateV1;
  threadState: DormantThreadStateV1;
  businessSignal: DormantBusinessSignalV1;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  personRef?: string | null;
  organizationRef?: string | null;
  opportunityRef?: string | null;
  explicitNextStep?: string | null;
  nextStepState?: "OPEN" | "COMPLETED" | "UNKNOWN" | null;
  dedupeKey?: string | null;
};

export type DormantEmailOpportunityProjectorInputV1 = {
  activities: readonly DormantCanonicalActivityV1[];
  now: string | Date;
  minimumDormantDays?: number;
  maximumQueueSize?: number;
};

export type DormantOpportunityCandidateV1 = Readonly<{
  candidateId: string;
  conversationKey: string;
  personRef: string | null;
  organizationRef: string | null;
  opportunityRef: string | null;
  candidateClass: DormantCandidateClassV1;
  businessSignal: Exclude<DormantBusinessSignalV1, "NONE">;
  truthState: DormantTruthStateV1;
  threadState: DormantThreadStateV1;
  lastMeaningfulTouchAt: string;
  ageDays: number;
  rationale: string;
  ownerRecommendation: DormantOwnerRecommendationV1;
  safeNextStep: string;
  explicitNextStep: string | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  activityRefs: readonly string[];
}>;

export type DormantSuppressionV1 = Readonly<{
  conversationKey: string;
  reasonCodes: readonly string[];
  activityRefs: readonly string[];
}>;

export type DormantEmailOpportunityProjectorResultV1 = Readonly<{
  version: typeof DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION;
  generatedAt: string;
  queue: readonly DormantOpportunityCandidateV1[];
  suppressed: readonly DormantSuppressionV1[];
  counts: Readonly<{ reviewedConversations: number; queued: number; suppressed: number }>;
  mailboxMutationPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const DEFAULT_MIN_DORMANT_DAYS = 14;
const DEFAULT_MAX_QUEUE_SIZE = 20;
const MAX_ACTIVITIES = 2_000;
const TRUTH_STATES = new Set<DormantTruthStateV1>(["KNOWN", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"]);
const THREAD_STATES = new Set<DormantThreadStateV1>(["OPEN", "ACTIVE", "RESOLVED", "REJECTED", "WON", "LOST", "IRRELEVANT", "UNKNOWN"]);
const SIGNALS = new Set<DormantBusinessSignalV1>([
  "PARTNERSHIP_DISCUSSION", "EXPLICIT_FOLLOW_UP", "ART_INTEREST", "COMMISSION_INTEREST", "LICENSING",
  "SPONSORSHIP", "COLLABORATION", "CHARITY", "EVENT", "MEDIA", "COLLECTIBLES", "PURCHASE",
  "WARM_INTRO", "STRATEGIC_RELATIONSHIP", "NONE"
]);
const TERMINAL_THREAD_STATES = new Set<DormantThreadStateV1>(["RESOLVED", "REJECTED", "WON", "LOST", "IRRELEVANT"]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}
function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}
function dateValue(value: string | Date, label: string): Date {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return result;
}
function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}
function textList(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
}
function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
function worstTruth(states: readonly DormantTruthStateV1[]): DormantTruthStateV1 {
  const order: readonly DormantTruthStateV1[] = ["CONFLICTED", "UNKNOWN", "STALE", "PARTIAL", "KNOWN"];
  return order.find((state) => states.includes(state)) ?? "UNKNOWN";
}
function candidateClass(signal: Exclude<DormantBusinessSignalV1, "NONE">, explicitNextStep: string | null): DormantCandidateClassV1 {
  if (signal === "WARM_INTRO") return "WARM_INTRO";
  if (signal === "STRATEGIC_RELATIONSHIP") return "STALE_STRATEGIC_RELATIONSHIP";
  if (signal === "EXPLICIT_FOLLOW_UP" || explicitNextStep) return "OVERDUE_EXPLICIT_FOLLOW_UP";
  if (["ART_INTEREST", "COMMISSION_INTEREST", "PURCHASE"].includes(signal)) return "INBOUND_INTEREST";
  return "UNRESOLVED_BUSINESS_DISCUSSION";
}
function ownerFor(signal: Exclude<DormantBusinessSignalV1, "NONE">, truth: DormantTruthStateV1): DormantOwnerRecommendationV1 {
  if (truth === "CONFLICTED" || truth === "UNKNOWN") return "WAIT";
  if (truth === "STALE" || truth === "PARTIAL") return "JEEVES_PREP";
  if (["COMMISSION_INTEREST", "PURCHASE"].includes(signal)) return "IOANA";
  return "KEEGAN";
}
function safeNextStep(owner: DormantOwnerRecommendationV1, signal: Exclude<DormantBusinessSignalV1, "NONE">): string {
  if (owner === "WAIT") return "Wait for clearer current evidence; do not initiate contact.";
  if (owner === "JEEVES_PREP") return "Prepare a concise evidence summary and unresolved-question brief; do not contact anyone.";
  if (owner === "IOANA") return "Review the documented inbound business interest and current status before any response.";
  if (signal === "WARM_INTRO") return "Review the documented introduction and decide whether a personal re-engagement is appropriate.";
  return "Review the documented conversation and decide whether to re-engage; do not send automatically.";
}
function signalPriority(signal: DormantBusinessSignalV1): number {
  const order: DormantBusinessSignalV1[] = [
    "SPONSORSHIP", "LICENSING", "COLLECTIBLES", "PARTNERSHIP_DISCUSSION", "COLLABORATION", "MEDIA",
    "CHARITY", "EVENT", "COMMISSION_INTEREST", "ART_INTEREST", "PURCHASE", "WARM_INTRO",
    "EXPLICIT_FOLLOW_UP", "STRATEGIC_RELATIONSHIP", "NONE"
  ];
  return order.indexOf(signal);
}

export function projectDormantEmailOpportunitiesV1(input: DormantEmailOpportunityProjectorInputV1): DormantEmailOpportunityProjectorResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.activities)) throw new Error("activities must be an array");
  if (input.activities.length > MAX_ACTIVITIES) throw new Error(`activities exceeds ${MAX_ACTIVITIES}`);

  const now = dateValue(input.now, "now");
  const minimumDormantDays = boundedInteger(input.minimumDormantDays, DEFAULT_MIN_DORMANT_DAYS, 1, 3650, "minimumDormantDays");
  const maximumQueueSize = boundedInteger(input.maximumQueueSize, DEFAULT_MAX_QUEUE_SIZE, 1, 100, "maximumQueueSize");

  const normalized = input.activities.map((activity, index) => {
    if (!activity || typeof activity !== "object" || Array.isArray(activity)) throw new Error(`activity ${index} must be an object`);
    if (!TRUTH_STATES.has(activity.truthState)) throw new Error(`activity ${index}.truthState is unsupported`);
    if (!THREAD_STATES.has(activity.threadState)) throw new Error(`activity ${index}.threadState is unsupported`);
    if (!SIGNALS.has(activity.businessSignal)) throw new Error(`activity ${index}.businessSignal is unsupported`);
    if (!new Set(["INBOUND", "OUTBOUND", "INTERNAL"]).has(activity.direction)) throw new Error(`activity ${index}.direction is unsupported`);
    const occurredAt = dateValue(activity.occurredAt, `activity ${index}.occurredAt`);
    if (occurredAt.getTime() > now.getTime()) throw new Error(`activity ${index}.occurredAt must not be future-dated`);
    const explicitNextStep = optionalText(activity.explicitNextStep, `activity ${index}.explicitNextStep`);
    const nextStepState = activity.nextStepState ?? null;
    if (nextStepState != null && !new Set(["OPEN", "COMPLETED", "UNKNOWN"]).has(nextStepState)) throw new Error(`activity ${index}.nextStepState is unsupported`);
    return {
      activityId: requiredText(activity.activityId, `activity ${index}.activityId`),
      conversationKey: requiredText(activity.conversationKey, `activity ${index}.conversationKey`),
      occurredAt,
      sourceRef: requiredText(activity.sourceRef, `activity ${index}.sourceRef`),
      evidenceRefs: textList(activity.evidenceRefs, `activity ${index}.evidenceRefs`),
      truthState: activity.truthState,
      threadState: activity.threadState,
      businessSignal: activity.businessSignal,
      direction: activity.direction,
      personRef: optionalText(activity.personRef, `activity ${index}.personRef`),
      organizationRef: optionalText(activity.organizationRef, `activity ${index}.organizationRef`),
      opportunityRef: optionalText(activity.opportunityRef, `activity ${index}.opportunityRef`),
      explicitNextStep,
      nextStepState,
      dedupeKey: optionalText(activity.dedupeKey, `activity ${index}.dedupeKey`) ?? requiredText(activity.conversationKey, `activity ${index}.conversationKey`)
    };
  });

  const groups = new Map<string, typeof normalized>();
  for (const activity of normalized) groups.set(activity.dedupeKey, [...(groups.get(activity.dedupeKey) ?? []), activity]);

  const queue: DormantOpportunityCandidateV1[] = [];
  const suppressed: DormantSuppressionV1[] = [];

  for (const [dedupeKey, activities] of groups) {
    const ordered = [...activities].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.activityId.localeCompare(b.activityId));
    const latest = ordered[0];
    const activityRefs = ordered.map((item) => item.activityId);
    const reasons: string[] = [];

    if (TERMINAL_THREAD_STATES.has(latest.threadState)) reasons.push(`LATEST_THREAD_STATE_${latest.threadState}`);
    if (!latest.personRef && !latest.organizationRef && !latest.opportunityRef) reasons.push("AMBIGUOUS_IDENTITY");
    const supported = ordered.filter((item) => item.businessSignal !== "NONE");
    if (supported.length === 0) reasons.push("NO_EXPLICIT_BUSINESS_SIGNAL");
    if (latest.nextStepState === "COMPLETED") reasons.push("LATEST_NEXT_STEP_COMPLETED");

    const supporting = supported[0] ?? null;
    if (!supporting) {
      suppressed.push(freezeDeep({ conversationKey: latest.conversationKey, reasonCodes: reasons, activityRefs }));
      continue;
    }

    const ageDays = Math.floor((now.getTime() - latest.occurredAt.getTime()) / DAY_MS);
    if (ageDays < minimumDormantDays) reasons.push("NOT_DORMANT_YET");

    if (reasons.length > 0) {
      suppressed.push(freezeDeep({ conversationKey: latest.conversationKey, reasonCodes: reasons, activityRefs }));
      continue;
    }

    const truthState = worstTruth(ordered.map((item) => item.truthState));
    const signal = supporting.businessSignal as Exclude<DormantBusinessSignalV1, "NONE">;
    const ownerRecommendation = ownerFor(signal, truthState);
    const explicitNextStep = ordered.find((item) => item.nextStepState === "OPEN" && item.explicitNextStep)?.explicitNextStep ?? null;
    const evidenceRefs = [...new Set(ordered.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b));
    const sourceRefs = [...new Set(ordered.map((item) => item.sourceRef))].sort((a, b) => a.localeCompare(b));

    queue.push(freezeDeep({
      candidateId: `dormant:${dedupeKey}`,
      conversationKey: latest.conversationKey,
      personRef: latest.personRef ?? supporting.personRef,
      organizationRef: latest.organizationRef ?? supporting.organizationRef,
      opportunityRef: latest.opportunityRef ?? supporting.opportunityRef,
      candidateClass: candidateClass(signal, explicitNextStep),
      businessSignal: signal,
      truthState,
      threadState: latest.threadState,
      lastMeaningfulTouchAt: latest.occurredAt.toISOString(),
      ageDays,
      rationale: `Explicit ${signal.toLocaleLowerCase("en-US").replaceAll("_", " ")} signal remains unresolved after ${ageDays} days.`,
      ownerRecommendation,
      safeNextStep: safeNextStep(ownerRecommendation, signal),
      explicitNextStep,
      evidenceRefs,
      sourceRefs,
      activityRefs
    }));
  }

  queue.sort((a, b) => {
    const truthRank = (state: DormantTruthStateV1) => ({ KNOWN: 0, PARTIAL: 1, STALE: 2, UNKNOWN: 3, CONFLICTED: 4 }[state]);
    return truthRank(a.truthState) - truthRank(b.truthState)
      || signalPriority(a.businessSignal) - signalPriority(b.businessSignal)
      || b.ageDays - a.ageDays
      || a.candidateId.localeCompare(b.candidateId);
  });

  const cappedQueue = queue.slice(0, maximumQueueSize);
  if (queue.length > maximumQueueSize) {
    for (const overflow of queue.slice(maximumQueueSize)) {
      suppressed.push(freezeDeep({ conversationKey: overflow.conversationKey, reasonCodes: ["QUEUE_LIMIT_REACHED"], activityRefs: [...overflow.activityRefs] }));
    }
  }

  suppressed.sort((a, b) => a.conversationKey.localeCompare(b.conversationKey));

  return freezeDeep({
    version: DORMANT_EMAIL_OPPORTUNITY_PROJECTOR_VERSION,
    generatedAt: now.toISOString(),
    queue: cappedQueue,
    suppressed,
    counts: { reviewedConversations: groups.size, queued: cappedQueue.length, suppressed: suppressed.length },
    mailboxMutationPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const
  });
}
