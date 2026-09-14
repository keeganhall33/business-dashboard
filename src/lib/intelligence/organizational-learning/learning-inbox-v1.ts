import {
  validateLearningObjectV1,
  type LearningObjectV1,
  type LearningTruthState
} from "./learning-object-v1";

export const LEARNING_INBOX_CONTRACT_VERSION = "LEARNING_INBOX_V1" as const;
export const LEARNING_INBOX_LIMIT = 50;

export const learningInboxStates = [
  "CANDIDATE",
  "CORROBORATED",
  "REVIEWED",
  "APPROVED",
  "CONFLICTED",
  "REJECTED",
  "SUPERSEDED"
] as const;

export type LearningInboxStateV1 = (typeof learningInboxStates)[number];

export type LearningInboxReviewV1 = Readonly<{
  learning_id: string;
  decision: "REVIEWED" | "REJECT";
  reviewed_at: string;
  evidence_ids: readonly string[];
}>;

export type LearningInboxConsumerV1 = Readonly<{
  learning_id: string;
  consumer_id: string;
  consumer_label: string;
  evidence_ids: readonly string[];
}>;

export type LearningInboxInputV1 = Readonly<{
  learning_objects: readonly LearningObjectV1[] | null;
  reviews?: readonly LearningInboxReviewV1[];
  affected_consumers?: readonly LearningInboxConsumerV1[];
  command_handler_available?: boolean;
}>;

export type LearningInboxItemV1 = Readonly<{
  learning_id: string;
  title: string;
  belief: string;
  kind: LearningObjectV1["kind"];
  scope: LearningObjectV1["scope"];
  state: LearningInboxStateV1;
  truth_state: LearningTruthState;
  confidence: number;
  updated_at: string;
  provenance: readonly Readonly<{
    evidence_id: string;
    source_lineage_id: string;
    observed_at: string;
  }>[];
  affected_consumers: readonly Readonly<{
    consumer_id: string;
    consumer_label: string;
    supported_by_evidence_ids: readonly string[];
  }>[];
  review_required: boolean;
  company_truth: boolean;
  action_available: boolean;
  priority: number;
}>;

export type LearningInboxViewV1 = Readonly<{
  contract_version: typeof LEARNING_INBOX_CONTRACT_VERSION;
  coverage: "AVAILABLE" | "UNAVAILABLE";
  status_message: string;
  summary: Readonly<Record<Lowercase<LearningInboxStateV1>, number>>;
  items: readonly LearningInboxItemV1[];
  invalid_object_count: number;
  read_only: boolean;
  review_command: "AVAILABLE" | "UNAVAILABLE";
}>;

const priorityByState: Readonly<Record<LearningInboxStateV1, number>> = Object.freeze({
  CONFLICTED: 700,
  CANDIDATE: 600,
  CORROBORATED: 550,
  REVIEWED: 500,
  APPROVED: 300,
  REJECTED: 200,
  SUPERSEDED: 100
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return validText(value) && Number.isFinite(Date.parse(value));
}

function supportedReviews(reviews: readonly LearningInboxReviewV1[]): ReadonlyMap<string, LearningInboxReviewV1> {
  const byLearning = new Map<string, LearningInboxReviewV1>();
  for (const review of reviews) {
    if (
      !validText(review?.learning_id) ||
      !["REVIEWED", "REJECT"].includes(review.decision) ||
      !validTimestamp(review.reviewed_at) ||
      !Array.isArray(review.evidence_ids) ||
      !review.evidence_ids.every(validText)
    ) continue;
    const current = byLearning.get(review.learning_id);
    if (!current || Date.parse(review.reviewed_at) > Date.parse(current.reviewed_at)) byLearning.set(review.learning_id, review);
  }
  return byLearning;
}

function stateFor(object: Readonly<LearningObjectV1>, review: LearningInboxReviewV1 | undefined): LearningInboxStateV1 {
  const evidenceIds = new Set(object.evidence.map((evidence) => evidence.evidence_id));
  const supportedReview = review?.evidence_ids.some((evidenceId) => evidenceIds.has(evidenceId)) ? review : undefined;
  if (object.lifecycle_state === "SUPERSEDED") return "SUPERSEDED";
  if (supportedReview?.decision === "REJECT") return "REJECTED";
  if (object.truth_state === "CONFLICTED") return "CONFLICTED";
  if (object.lifecycle_state === "APPROVED" || object.lifecycle_state === "CANONICAL") return "APPROVED";
  if (supportedReview?.decision === "REVIEWED") return "REVIEWED";
  if (new Set(object.evidence.map((evidence) => evidence.source_lineage_id)).size > 1) return "CORROBORATED";
  return "CANDIDATE";
}

function consumersFor(
  object: Readonly<LearningObjectV1>,
  consumers: readonly LearningInboxConsumerV1[]
): LearningInboxItemV1["affected_consumers"] {
  const evidenceIds = new Set(object.evidence.map((evidence) => evidence.evidence_id));
  const supported = new Map<string, { consumer_id: string; consumer_label: string; supported_by_evidence_ids: string[] }>();
  for (const consumer of consumers) {
    if (
      consumer?.learning_id !== object.learning_id ||
      !validText(consumer.consumer_id) ||
      !validText(consumer.consumer_label) ||
      !Array.isArray(consumer.evidence_ids)
    ) continue;
    const matched = [...new Set(consumer.evidence_ids.filter((id) => validText(id) && evidenceIds.has(id)))].sort();
    if (!matched.length) continue;
    supported.set(consumer.consumer_id, {
      consumer_id: consumer.consumer_id,
      consumer_label: consumer.consumer_label,
      supported_by_evidence_ids: matched
    });
  }
  return [...supported.values()].sort((a, b) => a.consumer_label.localeCompare(b.consumer_label) || a.consumer_id.localeCompare(b.consumer_id));
}

function itemFor(
  object: Readonly<LearningObjectV1>,
  review: LearningInboxReviewV1 | undefined,
  consumers: readonly LearningInboxConsumerV1[],
  commandHandlerAvailable: boolean
): LearningInboxItemV1 {
  const state = stateFor(object, review);
  const unsafeTruth = object.truth_state === "UNKNOWN" || object.truth_state === "STALE" || object.truth_state === "CONFLICTED";
  const reviewRequired = state === "CANDIDATE" || state === "CORROBORATED" || state === "REVIEWED" || state === "CONFLICTED" || unsafeTruth;
  const companyTruth = object.lifecycle_state === "CANONICAL" && !unsafeTruth && state === "APPROVED";

  return deepFreeze({
    learning_id: object.learning_id,
    title: object.title,
    belief: object.content,
    kind: object.kind,
    scope: object.scope,
    state,
    truth_state: object.truth_state,
    confidence: object.confidence,
    updated_at: object.updated_at,
    provenance: object.evidence.map((evidence) => ({
      evidence_id: evidence.evidence_id,
      source_lineage_id: evidence.source_lineage_id,
      observed_at: evidence.observed_at
    })),
    affected_consumers: consumersFor(object, consumers),
    review_required: reviewRequired,
    company_truth: companyTruth,
    action_available: reviewRequired && commandHandlerAvailable,
    priority: priorityByState[state] + (reviewRequired ? 25 : 0) + (unsafeTruth ? 10 : 0)
  });
}

function compareItems(a: LearningInboxItemV1, b: LearningInboxItemV1): number {
  return b.priority - a.priority || Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.learning_id.localeCompare(b.learning_id);
}

function emptySummary(): Record<Lowercase<LearningInboxStateV1>, number> {
  return {
    candidate: 0,
    corroborated: 0,
    reviewed: 0,
    approved: 0,
    conflicted: 0,
    rejected: 0,
    superseded: 0
  };
}

export function buildLearningInboxV1(input: LearningInboxInputV1): LearningInboxViewV1 {
  const available = input.learning_objects !== null;
  const validObjectsById = new Map<string, Readonly<LearningObjectV1>>();
  let invalidObjectCount = 0;
  for (const object of input.learning_objects ?? []) {
    try {
      const valid = validateLearningObjectV1(object);
      const current = validObjectsById.get(valid.learning_id);
      if (!current || valid.version > current.version || (valid.version === current.version && valid.updated_at > current.updated_at)) {
        validObjectsById.set(valid.learning_id, valid);
      }
    } catch {
      invalidObjectCount += 1;
    }
  }

  const reviews = supportedReviews(input.reviews ?? []);
  const commandHandlerAvailable = input.command_handler_available === true;
  const items = [...validObjectsById.values()]
    .map((object) => itemFor(object, reviews.get(object.learning_id), input.affected_consumers ?? [], commandHandlerAvailable))
    .sort(compareItems)
    .slice(0, LEARNING_INBOX_LIMIT);
  const summary = emptySummary();
  for (const item of items) summary[item.state.toLowerCase() as Lowercase<LearningInboxStateV1>] += 1;

  return deepFreeze({
    contract_version: LEARNING_INBOX_CONTRACT_VERSION,
    coverage: available ? "AVAILABLE" as const : "UNAVAILABLE" as const,
    status_message: !available
      ? "Canonical learning objects are unavailable. No synthetic beliefs were substituted."
      : items.length
        ? "Only supported learning, provenance, and affected consumers are shown. Promotion remains governed."
        : "The canonical learning feed is connected and currently contains no supported learning objects.",
    summary,
    items,
    invalid_object_count: invalidObjectCount,
    read_only: !commandHandlerAvailable,
    review_command: commandHandlerAvailable ? "AVAILABLE" as const : "UNAVAILABLE" as const
  });
}
