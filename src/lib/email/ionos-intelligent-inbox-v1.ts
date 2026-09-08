import type {
  IonosRelationshipStateResultV1,
  RelationshipStateProjectionV1,
  RelationshipStateV1
} from "@/lib/email/ionos-relationship-state-v1";

export type IonosIntelligentInboxQueueNameV1 =
  | "needsReply"
  | "waitingOnContact"
  | "staleOpportunities"
  | "highValue"
  | "recentReplies"
  | "suggestedCommitments"
  | "suggestedFollowUps";

export type IonosIntelligentInboxAttentionReasonV1 =
  | "VERIFY_EVIDENCE"
  | "HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY"
  | "HIGH_VALUE_NEEDS_REPLY"
  | "STALE_HIGH_VALUE_OPPORTUNITY"
  | "NEEDS_REPLY"
  | "FOLLOW_UP_SUGGESTED"
  | "WAITING_ON_CONTACT"
  | "HIGH_VALUE_CONTEXT";

export type IonosIntelligentInboxInputV1 = {
  relationshipState: IonosRelationshipStateResultV1;
  attentionBudget: number;
  queueLimits?: Partial<Record<IonosIntelligentInboxQueueNameV1, number>>;
  deepLinks?: Readonly<Record<string, string>>;
};

export type IonosIntelligentInboxItemV1 = {
  id: string;
  projectionId: string;
  threadId: string;
  contactId: string;
  opportunityIds: readonly string[];
  mailboxRoles: readonly string[];
  primaryState: RelationshipStateProjectionV1["primaryState"];
  states: readonly RelationshipStateV1[];
  truthState: RelationshipStateProjectionV1["truthState"];
  freshnessState: RelationshipStateProjectionV1["freshnessState"];
  lastMeaningfulInteractionAt: string | null;
  lastMeaningfulDirection: "INBOUND" | "OUTBOUND" | null;
  whatHappened: string;
  whyItMatters: string;
  nextMove: RelationshipStateProjectionV1["nextBestMove"]["move"];
  nextMoveStatus: RelationshipStateProjectionV1["nextBestMove"]["status"];
  blockingConditions: readonly string[];
  decisionEligible: boolean;
  evidenceFingerprint: string;
  deepLink: string | null;
};

export type IonosIntelligentInboxResultV1 = {
  generatedAt: string;
  needsReply: readonly IonosIntelligentInboxItemV1[];
  waitingOnContact: readonly IonosIntelligentInboxItemV1[];
  staleOpportunities: readonly IonosIntelligentInboxItemV1[];
  highValue: readonly IonosIntelligentInboxItemV1[];
  recentReplies: readonly IonosIntelligentInboxItemV1[];
  suggestedCommitments: readonly IonosIntelligentInboxItemV1[];
  suggestedFollowUps: readonly IonosIntelligentInboxItemV1[];
  requiresVerification: readonly IonosIntelligentInboxItemV1[];
  executiveAttention: readonly (IonosIntelligentInboxItemV1 & {
    attentionReason: IonosIntelligentInboxAttentionReasonV1;
  })[];
  telemetry: {
    projectionCount: number;
    queueCounts: Readonly<Record<IonosIntelligentInboxQueueNameV1 | "requiresVerification" | "executiveAttention", number>>;
    attentionReasonCodes: readonly IonosIntelligentInboxAttentionReasonV1[];
    projectionFingerprints: readonly string[];
    generatedAt: string;
  };
};

const INPUT_KEYS = new Set(["relationshipState", "attentionBudget", "queueLimits", "deepLinks"]);
const RESULT_KEYS = new Set(["generatedAt", "projections", "telemetry"]);
const PROJECTION_KEYS = new Set([
  "projectionId",
  "threadId",
  "contactId",
  "opportunityIds",
  "mailboxRoles",
  "primaryState",
  "states",
  "lastMeaningfulInteraction",
  "truthState",
  "freshnessState",
  "activeAskIds",
  "commitmentSuggestionIds",
  "evidenceRefs",
  "evidenceFingerprint",
  "decisionEligible",
  "nextBestMove",
  "supersedesProjectionId",
  "priorState"
]);
const NEXT_MOVE_KEYS = new Set(["move", "status", "evidenceRefs", "blockingConditions", "whatWouldChange"]);
const LAST_INTERACTION_KEYS = new Set([
  "activityId",
  "canonicalEmailId",
  "effectiveTimestamp",
  "direction",
  "mailboxRole",
  "expectsReply"
]);
const QUEUE_NAMES: readonly IonosIntelligentInboxQueueNameV1[] = [
  "needsReply",
  "waitingOnContact",
  "staleOpportunities",
  "highValue",
  "recentReplies",
  "suggestedCommitments",
  "suggestedFollowUps"
];
const PRIMARY_STATES = new Set<RelationshipStateProjectionV1["primaryState"]>([
  "NEEDS_REPLY",
  "WAITING_ON_CONTACT",
  "RESOLVED",
  "NO_ACTION",
  "UNKNOWN",
  "CONFLICTED"
]);
const STATES = new Set<RelationshipStateV1>([
  "NEEDS_REPLY",
  "WAITING_ON_CONTACT",
  "RESOLVED",
  "NO_ACTION",
  "STALE_THREAD",
  "STALE_OPPORTUNITY",
  "HIGH_VALUE",
  "ACTIVE_ASK",
  "COMMITMENT_SUGGESTED",
  "FOLLOW_UP_SUGGESTED",
  "UNKNOWN",
  "CONFLICTED"
]);
const TRUTH_STATES = new Set(["KNOWN", "UNKNOWN", "CONFLICTED"]);
const FRESHNESS_STATES = new Set(["CURRENT", "STALE", "UNKNOWN"]);
const NEXT_MOVES = new Set(["PREPARE_REPLY", "PREPARE_FOLLOW_UP", "WAIT_FOR_CONTACT", "VERIFY_EVIDENCE", "NO_ACTION"]);
const NEXT_MOVE_STATUSES = new Set(["SUGGESTED_UNVERIFIED", "NOT_APPLICABLE"]);
const MAILBOX_ROLES = new Set([
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkKeys(value: unknown, allowed: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function finiteNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative integer`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" && !(value instanceof Date)) throw new Error(`${label} must be a valid timestamp`);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function uniqueStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const items = value.map((item, index) => requiredString(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) throw new Error(`${label} must not contain duplicates`);
  return [...items];
}

function safeInternalPath(value: unknown, label: string): string {
  const path = requiredString(value, label);
  if (
    !/^\/[A-Za-z0-9/_-]*$/.test(path) ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("\\")
  ) {
    throw new Error(`${label} must be a safe internal path`);
  }
  return path;
}

function validateQueueLimits(value: unknown): Partial<Record<IonosIntelligentInboxQueueNameV1, number>> {
  if (value == null) return {};
  if (!isPlainObject(value)) throw new Error("queueLimits must be a plain object");
  const output: Partial<Record<IonosIntelligentInboxQueueNameV1, number>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!QUEUE_NAMES.includes(key as IonosIntelligentInboxQueueNameV1)) {
      throw new Error(`queueLimits contains unsupported key ${key}`);
    }
    output[key as IonosIntelligentInboxQueueNameV1] = finiteNonNegativeInteger(raw, `queueLimits.${key}`);
  }
  return output;
}

function validateDeepLinks(value: unknown, projectionIds: ReadonlySet<string>): Readonly<Record<string, string>> {
  if (value == null) return {};
  if (!isPlainObject(value)) throw new Error("deepLinks must be a plain object");
  const output: Record<string, string> = {};
  for (const [projectionId, rawPath] of Object.entries(value)) {
    if (!projectionIds.has(projectionId)) throw new Error(`deepLinks contains unknown projection id ${projectionId}`);
    output[projectionId] = safeInternalPath(rawPath, `deepLinks.${projectionId}`);
  }
  return output;
}

function validateProjection(raw: unknown, generatedAtMs: number): RelationshipStateProjectionV1 {
  checkKeys(raw, PROJECTION_KEYS, "relationship projection");
  const projection = raw as unknown as RelationshipStateProjectionV1;
  const projectionId = requiredString(projection.projectionId, "projectionId");
  requiredString(projection.threadId, `projection ${projectionId} threadId`);
  requiredString(projection.contactId, `projection ${projectionId} contactId`);

  const opportunityIds = uniqueStrings(projection.opportunityIds, `projection ${projectionId} opportunityIds`);
  void opportunityIds;
  const mailboxRoles = uniqueStrings(projection.mailboxRoles, `projection ${projectionId} mailboxRoles`);
  if (mailboxRoles.some((role) => !MAILBOX_ROLES.has(role))) throw new Error(`projection ${projectionId} has unsupported mailbox role`);

  if (!PRIMARY_STATES.has(projection.primaryState)) throw new Error(`projection ${projectionId} has unsupported primaryState`);
  const states = uniqueStrings(projection.states, `projection ${projectionId} states`) as RelationshipStateV1[];
  if (states.some((state) => !STATES.has(state))) throw new Error(`projection ${projectionId} has unsupported state`);
  if (!states.includes(projection.primaryState)) throw new Error(`projection ${projectionId} primaryState must appear in states`);

  if (!TRUTH_STATES.has(projection.truthState)) throw new Error(`projection ${projectionId} has unsupported truthState`);
  if (!FRESHNESS_STATES.has(projection.freshnessState)) throw new Error(`projection ${projectionId} has unsupported freshnessState`);
  if (typeof projection.decisionEligible !== "boolean") throw new Error(`projection ${projectionId} decisionEligible must be boolean`);

  requiredString(projection.evidenceFingerprint, `projection ${projectionId} evidenceFingerprint`);
  uniqueStrings(projection.evidenceRefs, `projection ${projectionId} evidenceRefs`);
  uniqueStrings(projection.activeAskIds, `projection ${projectionId} activeAskIds`);
  uniqueStrings(projection.commitmentSuggestionIds, `projection ${projectionId} commitmentSuggestionIds`);

  checkKeys(projection.nextBestMove, NEXT_MOVE_KEYS, `projection ${projectionId} nextBestMove`);
  if (!NEXT_MOVES.has(projection.nextBestMove.move)) throw new Error(`projection ${projectionId} has unsupported next move`);
  if (!NEXT_MOVE_STATUSES.has(projection.nextBestMove.status)) throw new Error(`projection ${projectionId} has unsupported next move status`);
  uniqueStrings(projection.nextBestMove.evidenceRefs, `projection ${projectionId} nextBestMove.evidenceRefs`);
  uniqueStrings(projection.nextBestMove.blockingConditions, `projection ${projectionId} blockingConditions`);
  uniqueStrings(projection.nextBestMove.whatWouldChange, `projection ${projectionId} whatWouldChange`);

  if (projection.lastMeaningfulInteraction != null) {
    checkKeys(projection.lastMeaningfulInteraction, LAST_INTERACTION_KEYS, `projection ${projectionId} lastMeaningfulInteraction`);
    requiredString(projection.lastMeaningfulInteraction.activityId, `projection ${projectionId} activityId`);
    requiredString(projection.lastMeaningfulInteraction.canonicalEmailId, `projection ${projectionId} canonicalEmailId`);
    const effectiveTimestamp = timestamp(projection.lastMeaningfulInteraction.effectiveTimestamp, `projection ${projectionId} effectiveTimestamp`);
    if (Date.parse(effectiveTimestamp) > generatedAtMs) throw new Error(`projection ${projectionId} last interaction must not be future-dated`);
    if (projection.lastMeaningfulInteraction.direction !== "INBOUND" && projection.lastMeaningfulInteraction.direction !== "OUTBOUND") {
      throw new Error(`projection ${projectionId} has unsupported meaningful direction`);
    }
    if (!MAILBOX_ROLES.has(projection.lastMeaningfulInteraction.mailboxRole)) throw new Error(`projection ${projectionId} has unsupported interaction mailbox role`);
    if (typeof projection.lastMeaningfulInteraction.expectsReply !== "boolean") throw new Error(`projection ${projectionId} expectsReply must be boolean`);
  }

  if ((projection.truthState !== "KNOWN" || projection.freshnessState !== "CURRENT") && projection.decisionEligible) {
    throw new Error(`projection ${projectionId} cannot be decisionEligible with uncertain evidence`);
  }
  if ((projection.primaryState === "UNKNOWN" || projection.primaryState === "CONFLICTED") && projection.decisionEligible) {
    throw new Error(`projection ${projectionId} cannot be decisionEligible in verification state`);
  }
  if (projection.states.includes("COMMITMENT_SUGGESTED") && projection.commitmentSuggestionIds.length === 0) {
    throw new Error(`projection ${projectionId} commitment suggestion requires an id`);
  }
  if (projection.states.includes("ACTIVE_ASK") && projection.activeAskIds.length === 0) {
    throw new Error(`projection ${projectionId} active ask requires an id`);
  }

  return projection;
}

function requiresVerification(projection: RelationshipStateProjectionV1): boolean {
  return (
    projection.truthState !== "KNOWN" ||
    projection.freshnessState !== "CURRENT" ||
    projection.primaryState === "UNKNOWN" ||
    projection.primaryState === "CONFLICTED" ||
    projection.states.includes("UNKNOWN") ||
    projection.states.includes("CONFLICTED")
  );
}

function whatHappened(projection: RelationshipStateProjectionV1): string {
  if (requiresVerification(projection)) return "Relationship evidence needs verification before action.";
  if (projection.primaryState === "NEEDS_REPLY") return "A direct human message is waiting for a reply.";
  if (projection.primaryState === "WAITING_ON_CONTACT") return "A direct human response is still outstanding from the contact.";
  if (projection.states.includes("STALE_OPPORTUNITY")) return "An active relationship-linked opportunity has gone stale.";
  if (projection.states.includes("COMMITMENT_SUGGESTED")) return "Evidence suggests a possible commitment that still requires verification.";
  if (projection.states.includes("FOLLOW_UP_SUGGESTED")) return "Evidence supports preparing a follow-up for review.";
  if (projection.primaryState === "RESOLVED") return "The relationship thread is currently resolved by known evidence.";
  return "No direct relationship action is currently required.";
}

function whyItMatters(projection: RelationshipStateProjectionV1): string {
  if (requiresVerification(projection)) return "Acting on uncertain relationship evidence could create a false follow-up or missed context.";
  if (projection.states.includes("HIGH_VALUE") && projection.states.includes("ACTIVE_ASK")) return "A high-value relationship has an explicit active ask that deserves timely attention.";
  if (projection.states.includes("HIGH_VALUE")) return "This relationship is explicitly marked high value by governed evidence.";
  if (projection.states.includes("STALE_OPPORTUNITY")) return "A stale active opportunity can lose timing, access, or relationship momentum.";
  if (projection.primaryState === "NEEDS_REPLY") return "A direct reply is needed to keep the conversation moving.";
  if (projection.primaryState === "WAITING_ON_CONTACT") return "The next move belongs to the contact, so unnecessary outreach should be avoided.";
  return "The state is retained for relationship context without manufacturing urgency.";
}

function toItem(projection: RelationshipStateProjectionV1, deepLink: string | null): IonosIntelligentInboxItemV1 {
  const verification = requiresVerification(projection);
  return {
    id: projection.projectionId,
    projectionId: projection.projectionId,
    threadId: projection.threadId,
    contactId: projection.contactId,
    opportunityIds: [...projection.opportunityIds],
    mailboxRoles: [...projection.mailboxRoles],
    primaryState: projection.primaryState,
    states: [...projection.states],
    truthState: projection.truthState,
    freshnessState: projection.freshnessState,
    lastMeaningfulInteractionAt: projection.lastMeaningfulInteraction?.effectiveTimestamp ?? null,
    lastMeaningfulDirection: projection.lastMeaningfulInteraction?.direction ?? null,
    whatHappened: whatHappened(projection),
    whyItMatters: whyItMatters(projection),
    nextMove: verification ? "VERIFY_EVIDENCE" : projection.nextBestMove.move,
    nextMoveStatus: verification ? "SUGGESTED_UNVERIFIED" : projection.nextBestMove.status,
    blockingConditions: verification
      ? [...new Set(["RELATIONSHIP_EVIDENCE_REQUIRES_VERIFICATION", ...projection.nextBestMove.blockingConditions])].sort()
      : [...projection.nextBestMove.blockingConditions],
    decisionEligible: projection.decisionEligible && !verification,
    evidenceFingerprint: projection.evidenceFingerprint,
    deepLink
  };
}

function itemCompare(a: IonosIntelligentInboxItemV1, b: IonosIntelligentInboxItemV1): number {
  const aTime = a.lastMeaningfulInteractionAt == null ? -Infinity : Date.parse(a.lastMeaningfulInteractionAt);
  const bTime = b.lastMeaningfulInteractionAt == null ? -Infinity : Date.parse(b.lastMeaningfulInteractionAt);
  return bTime - aTime || a.projectionId.localeCompare(b.projectionId);
}

function capQueue(
  items: readonly IonosIntelligentInboxItemV1[],
  queueName: IonosIntelligentInboxQueueNameV1,
  limits: Partial<Record<IonosIntelligentInboxQueueNameV1, number>>
): IonosIntelligentInboxItemV1[] {
  const limit = limits[queueName];
  return limit == null ? [...items] : items.slice(0, limit);
}

function attentionReason(item: IonosIntelligentInboxItemV1): IonosIntelligentInboxAttentionReasonV1 | null {
  if (!item.decisionEligible) return "VERIFY_EVIDENCE";
  if (item.primaryState === "NEEDS_REPLY" && item.states.includes("HIGH_VALUE") && item.states.includes("ACTIVE_ASK")) {
    return "HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY";
  }
  if (item.primaryState === "NEEDS_REPLY" && item.states.includes("HIGH_VALUE")) return "HIGH_VALUE_NEEDS_REPLY";
  if (item.states.includes("STALE_OPPORTUNITY") && item.states.includes("HIGH_VALUE")) return "STALE_HIGH_VALUE_OPPORTUNITY";
  if (item.primaryState === "NEEDS_REPLY") return "NEEDS_REPLY";
  if (item.states.includes("FOLLOW_UP_SUGGESTED")) return "FOLLOW_UP_SUGGESTED";
  if (item.primaryState === "WAITING_ON_CONTACT") return "WAITING_ON_CONTACT";
  if (item.states.includes("HIGH_VALUE")) return "HIGH_VALUE_CONTEXT";
  return null;
}

const ATTENTION_ORDER: Readonly<Record<IonosIntelligentInboxAttentionReasonV1, number>> = {
  VERIFY_EVIDENCE: 0,
  HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY: 1,
  HIGH_VALUE_NEEDS_REPLY: 2,
  STALE_HIGH_VALUE_OPPORTUNITY: 3,
  NEEDS_REPLY: 4,
  FOLLOW_UP_SUGGESTED: 5,
  WAITING_ON_CONTACT: 6,
  HIGH_VALUE_CONTEXT: 7
};

export function projectIonosIntelligentInboxV1(input: IonosIntelligentInboxInputV1): IonosIntelligentInboxResultV1 {
  checkKeys(input, INPUT_KEYS, "input");
  const attentionBudget = finiteNonNegativeInteger(input.attentionBudget, "attentionBudget");
  const queueLimits = validateQueueLimits(input.queueLimits);

  checkKeys(input.relationshipState, RESULT_KEYS, "relationshipState");
  if (!Array.isArray(input.relationshipState.projections)) throw new Error("relationshipState.projections must be an array");
  const generatedAt = timestamp(input.relationshipState.generatedAt, "relationshipState.generatedAt");
  const generatedAtMs = Date.parse(generatedAt);

  const projections = input.relationshipState.projections.map((projection) => validateProjection(projection, generatedAtMs));
  const projectionIds = projections.map((projection) => projection.projectionId);
  const fingerprints = projections.map((projection) => projection.evidenceFingerprint);
  if (new Set(projectionIds).size !== projectionIds.length) throw new Error("relationship projections contain duplicate projection ids");
  if (new Set(fingerprints).size !== fingerprints.length) throw new Error("relationship projections contain duplicate evidence fingerprints");

  const deepLinks = validateDeepLinks(input.deepLinks, new Set(projectionIds));
  const items = projections
    .map((projection) => toItem(projection, deepLinks[projection.projectionId] ?? null))
    .sort(itemCompare);

  const fullNeedsReply = items.filter((item) => item.primaryState === "NEEDS_REPLY");
  const fullWaiting = items.filter((item) => item.primaryState === "WAITING_ON_CONTACT");
  const fullStale = items.filter((item) => item.states.includes("STALE_OPPORTUNITY"));
  const fullHighValue = items.filter((item) => item.states.includes("HIGH_VALUE"));
  const fullRecentReplies = items.filter((item) => item.lastMeaningfulDirection === "INBOUND");
  const fullCommitments = items.filter((item) => item.states.includes("COMMITMENT_SUGGESTED"));
  const fullFollowUps = items.filter((item) => item.states.includes("FOLLOW_UP_SUGGESTED"));
  const verification = items.filter((item) => !item.decisionEligible || item.truthState !== "KNOWN" || item.freshnessState !== "CURRENT");

  const attentionCandidates = items
    .map((item) => {
      const reason = attentionReason(item);
      return reason == null ? null : { ...item, attentionReason: reason };
    })
    .filter((item): item is IonosIntelligentInboxItemV1 & { attentionReason: IonosIntelligentInboxAttentionReasonV1 } => item != null)
    .sort((a, b) => ATTENTION_ORDER[a.attentionReason] - ATTENTION_ORDER[b.attentionReason] || itemCompare(a, b));
  const executiveAttention = attentionCandidates.slice(0, attentionBudget);

  const needsReply = capQueue(fullNeedsReply, "needsReply", queueLimits);
  const waitingOnContact = capQueue(fullWaiting, "waitingOnContact", queueLimits);
  const staleOpportunities = capQueue(fullStale, "staleOpportunities", queueLimits);
  const highValue = capQueue(fullHighValue, "highValue", queueLimits);
  const recentReplies = capQueue(fullRecentReplies, "recentReplies", queueLimits);
  const suggestedCommitments = capQueue(fullCommitments, "suggestedCommitments", queueLimits);
  const suggestedFollowUps = capQueue(fullFollowUps, "suggestedFollowUps", queueLimits);

  return {
    generatedAt,
    needsReply,
    waitingOnContact,
    staleOpportunities,
    highValue,
    recentReplies,
    suggestedCommitments,
    suggestedFollowUps,
    requiresVerification: verification,
    executiveAttention,
    telemetry: {
      projectionCount: items.length,
      queueCounts: {
        needsReply: needsReply.length,
        waitingOnContact: waitingOnContact.length,
        staleOpportunities: staleOpportunities.length,
        highValue: highValue.length,
        recentReplies: recentReplies.length,
        suggestedCommitments: suggestedCommitments.length,
        suggestedFollowUps: suggestedFollowUps.length,
        requiresVerification: verification.length,
        executiveAttention: executiveAttention.length
      },
      attentionReasonCodes: executiveAttention.map((item) => item.attentionReason),
      projectionFingerprints: items.map((item) => item.evidenceFingerprint).sort((a, b) => a.localeCompare(b)),
      generatedAt
    }
  };
}
