import type {
  RelationshipNextMoveV1,
  RelationshipStateProjectionV1
} from "@/lib/email/ionos-relationship-state-v1";
import type {
  EmailEvidenceFreshnessStateV1,
  EmailEvidenceTruthStateV1
} from "@/lib/email/ionos-crm-linking-v1";

export type RelationshipFollowUpQueueClassV1 =
  | "NEEDS_REPLY"
  | "WAITING_ON_CONTACT"
  | "FOLLOW_UP_THIS_WEEK"
  | "OVERDUE"
  | "STALE_OPPORTUNITY"
  | "HIGH_VALUE"
  | "RECENTLY_REENGAGED"
  | "REQUIRES_VERIFICATION";

export type CanonicalFollowUpEvidenceV1 = {
  followUpId: string;
  contactId: string;
  threadId?: string | null;
  opportunityId?: string | null;
  dueAt: string | Date | null;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRefs: readonly string[];
  observedAt: string | Date;
};

export type CanonicalIdentityEvidenceV1 = {
  contactId: string;
  state: "RESOLVED" | "AMBIGUOUS" | "UNKNOWN";
  evidenceRefs: readonly string[];
};

export type CanonicalRelationshipFollowUpQueueInputV1 = {
  projections: readonly RelationshipStateProjectionV1[];
  followUps?: readonly CanonicalFollowUpEvidenceV1[];
  identities?: readonly CanonicalIdentityEvidenceV1[];
  now: string | Date;
  followUpWindowDays?: number;
  recentlyReengagedDays?: number;
};

export type CanonicalRelationshipFollowUpQueueItemV1 = {
  itemId: string;
  projectionId: string;
  contactId: string;
  threadId: string;
  opportunityIds: readonly string[];
  queueClasses: readonly RelationshipFollowUpQueueClassV1[];
  primaryQueueClass: RelationshipFollowUpQueueClassV1;
  priority: number;
  dueAt: string | null;
  lastMeaningfulInteractionAt: string | null;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  requiresReview: boolean;
  suggestedMove: RelationshipNextMoveV1;
  followUpIds: readonly string[];
  evidenceRefs: readonly string[];
};

export type CanonicalRelationshipFollowUpQueueResultV1 = {
  generatedAt: string;
  items: readonly CanonicalRelationshipFollowUpQueueItemV1[];
  counts: Readonly<Record<RelationshipFollowUpQueueClassV1, number>>;
};

const DAY_MS = 86_400_000;
const MAX_PROJECTIONS = 5_000;
const MAX_FOLLOW_UPS = 10_000;
const MAX_IDENTITIES = 5_000;

const QUEUE_ORDER: readonly RelationshipFollowUpQueueClassV1[] = [
  "REQUIRES_VERIFICATION",
  "OVERDUE",
  "NEEDS_REPLY",
  "STALE_OPPORTUNITY",
  "FOLLOW_UP_THIS_WEEK",
  "WAITING_ON_CONTACT",
  "RECENTLY_REENGAGED",
  "HIGH_VALUE"
];

const INPUT_KEYS = new Set([
  "projections",
  "followUps",
  "identities",
  "now",
  "followUpWindowDays",
  "recentlyReengagedDays"
]);
const FOLLOW_UP_KEYS = new Set([
  "followUpId",
  "contactId",
  "threadId",
  "opportunityId",
  "dueAt",
  "status",
  "truthState",
  "freshnessState",
  "evidenceRefs",
  "observedAt"
]);
const IDENTITY_KEYS = new Set(["contactId", "state", "evidenceRefs"]);
const TRUTH_STATES = new Set<EmailEvidenceTruthStateV1>(["KNOWN", "UNKNOWN", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<EmailEvidenceFreshnessStateV1>(["CURRENT", "STALE", "UNKNOWN"]);

function isObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkKeys(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (!isObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function nonNegativeDayCount(value: unknown, fallback: number, label: string): number {
  const result = value == null ? fallback : value;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 0 || result > 365) {
    throw new Error(`${label} must be an integer between 0 and 365`);
  }
  return result;
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function evidenceRefs(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return uniq(value.map((ref, index) => requiredString(ref, `${label}[${index}]`)));
}

function frozen<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) frozen(child);
  }
  return Object.freeze(value);
}

function orderedClasses(values: ReadonlySet<RelationshipFollowUpQueueClassV1>): RelationshipFollowUpQueueClassV1[] {
  return QUEUE_ORDER.filter((queueClass) => values.has(queueClass));
}

function followUpMatchesProjection(
  followUp: CanonicalFollowUpEvidenceV1,
  projection: RelationshipStateProjectionV1
): boolean {
  if (followUp.contactId !== projection.contactId) return false;
  if (followUp.threadId && followUp.threadId !== projection.threadId) return false;
  if (followUp.opportunityId && !projection.opportunityIds.includes(followUp.opportunityId)) return false;
  return Boolean(followUp.threadId || followUp.opportunityId);
}

export function projectCanonicalRelationshipFollowUpQueueV1(
  input: CanonicalRelationshipFollowUpQueueInputV1
): CanonicalRelationshipFollowUpQueueResultV1 {
  if (!isObject(input)) throw new Error("input must be a plain object");
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) throw new Error(`input contains unsupported key ${key}`);
  if (!Array.isArray(input.projections)) throw new Error("projections must be an array");
  if (input.projections.length > MAX_PROJECTIONS) throw new Error(`projections exceeds ${MAX_PROJECTIONS}`);

  const followUps = input.followUps ?? [];
  const identities = input.identities ?? [];
  if (!Array.isArray(followUps)) throw new Error("followUps must be an array");
  if (!Array.isArray(identities)) throw new Error("identities must be an array");
  if (followUps.length > MAX_FOLLOW_UPS) throw new Error(`followUps exceeds ${MAX_FOLLOW_UPS}`);
  if (identities.length > MAX_IDENTITIES) throw new Error(`identities exceeds ${MAX_IDENTITIES}`);

  const now = timestamp(input.now, "now");
  const nowMs = Date.parse(now);
  const followUpWindowDays = nonNegativeDayCount(input.followUpWindowDays, 7, "followUpWindowDays");
  const recentlyReengagedDays = nonNegativeDayCount(input.recentlyReengagedDays, 14, "recentlyReengagedDays");
  const followUpWindowEndMs = nowMs + followUpWindowDays * DAY_MS;

  const identityByContact = new Map<string, CanonicalIdentityEvidenceV1>();
  for (const [index, identity] of identities.entries()) {
    checkKeys(identity, IDENTITY_KEYS, `identity ${index}`);
    const contactId = requiredString(identity.contactId, `identity ${index} contactId`);
    if (!["RESOLVED", "AMBIGUOUS", "UNKNOWN"].includes(identity.state)) throw new Error(`identity ${contactId} state is unsupported`);
    if (identityByContact.has(contactId)) throw new Error(`duplicate identity evidence for ${contactId}`);
    identityByContact.set(contactId, {
      contactId,
      state: identity.state,
      evidenceRefs: evidenceRefs(identity.evidenceRefs, `identity ${contactId} evidenceRefs`)
    });
  }

  const normalizedFollowUps = followUps.map((followUp, index) => {
    checkKeys(followUp, FOLLOW_UP_KEYS, `followUp ${index}`);
    const followUpId = requiredString(followUp.followUpId, `followUp ${index} followUpId`);
    const contactId = requiredString(followUp.contactId, `followUp ${followUpId} contactId`);
    const threadId = followUp.threadId == null ? null : requiredString(followUp.threadId, `followUp ${followUpId} threadId`);
    const opportunityId = followUp.opportunityId == null ? null : requiredString(followUp.opportunityId, `followUp ${followUpId} opportunityId`);
    if (!threadId && !opportunityId) throw new Error(`followUp ${followUpId} requires threadId or opportunityId`);
    if (!["OPEN", "COMPLETED", "CANCELLED"].includes(followUp.status)) throw new Error(`followUp ${followUpId} status is unsupported`);
    if (!TRUTH_STATES.has(followUp.truthState)) throw new Error(`followUp ${followUpId} truthState is unsupported`);
    if (!FRESHNESS_STATES.has(followUp.freshnessState)) throw new Error(`followUp ${followUpId} freshnessState is unsupported`);
    const observedAt = timestamp(followUp.observedAt, `followUp ${followUpId} observedAt`);
    if (Date.parse(observedAt) > nowMs) throw new Error(`followUp ${followUpId} observedAt must not be future-dated`);
    return {
      ...followUp,
      followUpId,
      contactId,
      threadId,
      opportunityId,
      dueAt: followUp.dueAt == null ? null : timestamp(followUp.dueAt, `followUp ${followUpId} dueAt`),
      observedAt,
      evidenceRefs: evidenceRefs(followUp.evidenceRefs, `followUp ${followUpId} evidenceRefs`)
    };
  });
  const followUpIds = normalizedFollowUps.map((item) => item.followUpId);
  if (new Set(followUpIds).size !== followUpIds.length) throw new Error("followUps contains duplicate followUpId values");

  const projectionIds = input.projections.map((projection) => requiredString(projection.projectionId, "projectionId"));
  if (new Set(projectionIds).size !== projectionIds.length) throw new Error("projections contains duplicate projectionId values");

  const items: CanonicalRelationshipFollowUpQueueItemV1[] = [];
  for (const projection of input.projections) {
    const projectionId = requiredString(projection.projectionId, "projectionId");
    const contactId = requiredString(projection.contactId, `projection ${projectionId} contactId`);
    const threadId = requiredString(projection.threadId, `projection ${projectionId} threadId`);
    if (!Array.isArray(projection.states)) throw new Error(`projection ${projectionId} states must be an array`);
    if (!Array.isArray(projection.opportunityIds)) throw new Error(`projection ${projectionId} opportunityIds must be an array`);
    if (!Array.isArray(projection.evidenceRefs)) throw new Error(`projection ${projectionId} evidenceRefs must be an array`);
    if (!TRUTH_STATES.has(projection.truthState)) throw new Error(`projection ${projectionId} truthState is unsupported`);
    if (!FRESHNESS_STATES.has(projection.freshnessState)) throw new Error(`projection ${projectionId} freshnessState is unsupported`);

    const matchingFollowUps = normalizedFollowUps.filter((followUp) => followUpMatchesProjection(followUp, projection));
    const openFollowUps = matchingFollowUps.filter((followUp) => followUp.status === "OPEN");
    const classes = new Set<RelationshipFollowUpQueueClassV1>();
    if (projection.states.includes("NEEDS_REPLY")) classes.add("NEEDS_REPLY");
    if (projection.states.includes("WAITING_ON_CONTACT")) classes.add("WAITING_ON_CONTACT");
    if (projection.states.includes("STALE_OPPORTUNITY")) classes.add("STALE_OPPORTUNITY");
    if (projection.states.includes("HIGH_VALUE")) classes.add("HIGH_VALUE");

    for (const followUp of openFollowUps) {
      if (followUp.dueAt == null) continue;
      const dueMs = Date.parse(followUp.dueAt);
      if (dueMs < nowMs) classes.add("OVERDUE");
      else if (dueMs <= followUpWindowEndMs) classes.add("FOLLOW_UP_THIS_WEEK");
    }

    const interactionAt = projection.lastMeaningfulInteraction?.effectiveTimestamp ?? null;
    const wasStale = Boolean(projection.priorState?.states.includes("STALE_THREAD") || projection.priorState?.states.includes("STALE_OPPORTUNITY"));
    if (wasStale && interactionAt) {
      const interactionMs = Date.parse(timestamp(interactionAt, `projection ${projectionId} lastMeaningfulInteraction`));
      if (interactionMs <= nowMs && nowMs - interactionMs <= recentlyReengagedDays * DAY_MS) classes.add("RECENTLY_REENGAGED");
    }

    const identity = identityByContact.get(contactId);
    const followUpUncertain = openFollowUps.some((followUp) =>
      followUp.dueAt == null || followUp.truthState !== "KNOWN" || followUp.freshnessState !== "CURRENT"
    );
    const requiresReview =
      !projection.decisionEligible ||
      projection.truthState !== "KNOWN" ||
      projection.freshnessState !== "CURRENT" ||
      projection.states.includes("UNKNOWN") ||
      projection.states.includes("CONFLICTED") ||
      (identity != null && identity.state !== "RESOLVED") ||
      followUpUncertain;
    if (requiresReview) classes.add("REQUIRES_VERIFICATION");
    if (classes.size === 0) continue;

    const queueClasses = orderedClasses(classes);
    const currentDueDates = openFollowUps
      .filter((followUp) => followUp.dueAt != null)
      .map((followUp) => followUp.dueAt as string)
      .sort();
    const refs = uniq([
      ...projection.evidenceRefs,
      ...matchingFollowUps.flatMap((followUp) => followUp.evidenceRefs),
      ...(identity?.evidenceRefs ?? [])
    ]);
    items.push({
      itemId: `follow_up_queue:${projectionId}`,
      projectionId,
      contactId,
      threadId,
      opportunityIds: uniq(projection.opportunityIds.map((id) => requiredString(id, `projection ${projectionId} opportunityId`))),
      queueClasses,
      primaryQueueClass: queueClasses[0],
      priority: QUEUE_ORDER.indexOf(queueClasses[0]) + 1,
      dueAt: currentDueDates[0] ?? null,
      lastMeaningfulInteractionAt: interactionAt == null ? null : timestamp(interactionAt, `projection ${projectionId} lastMeaningfulInteraction`),
      truthState: projection.truthState,
      freshnessState: projection.freshnessState,
      requiresReview,
      suggestedMove: requiresReview ? "VERIFY_EVIDENCE" : projection.nextBestMove.move,
      followUpIds: uniq(matchingFollowUps.map((followUp) => followUp.followUpId)),
      evidenceRefs: refs
    });
  }

  items.sort((a, b) =>
    a.priority - b.priority ||
    Number(b.queueClasses.includes("HIGH_VALUE")) - Number(a.queueClasses.includes("HIGH_VALUE")) ||
    (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
    a.itemId.localeCompare(b.itemId)
  );

  const counts = Object.fromEntries(QUEUE_ORDER.map((queueClass) => [
    queueClass,
    items.filter((item) => item.queueClasses.includes(queueClass)).length
  ])) as Record<RelationshipFollowUpQueueClassV1, number>;

  return frozen({ generatedAt: now, items, counts }) as CanonicalRelationshipFollowUpQueueResultV1;
}
