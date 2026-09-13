import type {
  KnowledgeIntegrityFindingType,
  KnowledgeIntegrityFindingV1,
  KnowledgeIntegrityNextStepClass,
  KnowledgeIntegritySeverity,
  KnowledgeIntegrityTruthState
} from "./knowledge-integrity-v1";
import type { UnresolvedReferenceV1 } from "./unresolved-reference-v1";
import type { LearningObjectV1 } from "../organizational-learning/learning-object-v1";

export const KNOWLEDGE_HEALTH_VIEW_CONTRACT_VERSION = "KNOWLEDGE_HEALTH_VIEW_V1" as const;
export const KNOWLEDGE_HEALTH_QUEUE_LIMIT = 24;

export type KnowledgeHealthStatusV1 = "HEALTHY" | "NEEDS_ATTENTION" | "DEGRADED" | "BLOCKED" | "UNKNOWN";
export type KnowledgeHealthDrillKindV1 = "PERSON" | "COMPANY" | "OPPORTUNITY";

export type KnowledgeHealthDrillTargetV1 = Readonly<{
  canonical_id: string;
  kind: KnowledgeHealthDrillKindV1;
}>;

export type KnowledgeHealthInputV1 = Readonly<{
  findings: readonly KnowledgeIntegrityFindingV1[] | null;
  unresolved_references: readonly UnresolvedReferenceV1[] | null;
  learning_items: readonly LearningObjectV1[] | null;
  drill_targets?: readonly KnowledgeHealthDrillTargetV1[];
}>;

export type KnowledgeHealthQueueItemV1 = Readonly<{
  id: string;
  issue_type: string;
  affected: string;
  why_it_matters: string;
  truth_state: KnowledgeIntegrityTruthState;
  freshness_state: "FRESH" | "STALE" | "UNKNOWN";
  evidence_count: number;
  source_count: number;
  next_step: KnowledgeIntegrityNextStepClass;
  review_required: boolean;
  action_available: false;
  detail_href: string | null;
  priority: number;
}>;

export type KnowledgeHealthViewV1 = Readonly<{
  contract_version: typeof KNOWLEDGE_HEALTH_VIEW_CONTRACT_VERSION;
  health: KnowledgeHealthStatusV1;
  coverage: "COMPLETE" | "INCOMPLETE";
  summary: Readonly<{
    blocking_findings: number;
    important_findings: number;
    unresolved_or_ambiguous_references: number;
    material_conflicts: number;
    stale_decision_knowledge: number;
    missing_provenance: number;
    overdue_or_missing_next_actions: number;
    learning_items_awaiting_review: number;
  }>;
  queue: readonly KnowledgeHealthQueueItemV1[];
  no_detected_issues: boolean;
  status_message: string;
  read_only: true;
}>;

const ISSUE_LABELS: Readonly<Record<KnowledgeIntegrityFindingType, string>> = Object.freeze({
  DUPLICATE_ENTITY_CANDIDATE: "Possible duplicate identity",
  CONTRADICTORY_FACT: "Material fact conflict",
  STALE_CANONICAL_OBJECT: "Stale company knowledge",
  MISSING_PROVENANCE: "Missing source history",
  ORPHANED_RELATIONSHIP: "Unlinked relationship",
  ORPHANED_OPPORTUNITY: "Unlinked opportunity",
  MISSING_NEXT_ACTION: "Missing next action",
  OVERDUE_COMMITMENT: "Overdue commitment",
  UNRESOLVED_REFERENCE: "Unresolved reference",
  AMBIGUOUS_ENTITY_RESOLUTION: "Ambiguous identity",
  STALE_DERIVED_SUMMARY: "Stale derived summary",
  UNRESOLVED_LEARNING_REVIEW: "Learning awaiting review",
  SILENT_SUPERSESSION_RISK: "Unreviewed replacement risk",
  DUPLICATE_SOURCE_LINEAGE: "Repeated source lineage",
  UNKNOWN_OWNER: "Missing owner",
  INVALID_TEMPORAL_ORDER: "Invalid timeline order"
});

const WHY: Readonly<Record<KnowledgeIntegrityFindingType, string>> = Object.freeze({
  DUPLICATE_ENTITY_CANDIDATE: "Two records may represent the same real entity.",
  CONTRADICTORY_FACT: "Conflicting evidence could change an active business decision.",
  STALE_CANONICAL_OBJECT: "A previously trusted record may no longer be current.",
  MISSING_PROVENANCE: "The system cannot verify where this knowledge came from.",
  ORPHANED_RELATIONSHIP: "A relationship cannot be traced to supported canonical records.",
  ORPHANED_OPPORTUNITY: "An opportunity is missing a supported canonical connection.",
  MISSING_NEXT_ACTION: "Active work has no evidence-backed next step.",
  OVERDUE_COMMITMENT: "A supported commitment is past its recorded due time.",
  UNRESOLVED_REFERENCE: "A referenced entity has not been safely resolved.",
  AMBIGUOUS_ENTITY_RESOLUTION: "More than one canonical identity remains plausible.",
  STALE_DERIVED_SUMMARY: "A summary may not reflect current source evidence.",
  UNRESOLVED_LEARNING_REVIEW: "A supported learning candidate still needs governed review.",
  SILENT_SUPERSESSION_RISK: "New knowledge may replace prior truth without preserved review history.",
  DUPLICATE_SOURCE_LINEAGE: "Repeated coverage may be inflating apparent evidence.",
  UNKNOWN_OWNER: "No accountable owner is supported by current evidence.",
  INVALID_TEMPORAL_ORDER: "Recorded events are in an inconsistent order."
});

const severityRank: Readonly<Record<KnowledgeIntegritySeverity, number>> = Object.freeze({
  BLOCKING: 400,
  IMPORTANT: 300,
  REVIEW: 200,
  INFO: 100
});

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function hrefFor(target: KnowledgeHealthDrillTargetV1): string | null {
  const id = target.canonical_id.trim();
  if (!id || id.length > 256) return null;
  const encoded = encodeURIComponent(id);
  if (target.kind === "PERSON") return `/relationships/people/${encoded}`;
  if (target.kind === "COMPANY") return `/relationships/companies/${encoded}`;
  if (target.kind === "OPPORTUNITY") return `/opportunities-actions/opportunity/${encoded}`;
  return null;
}

function targetMap(targets: readonly KnowledgeHealthDrillTargetV1[]): ReadonlyMap<string, string> {
  const pairs = targets
    .map((target) => [target.canonical_id, hrefFor(target)] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== null)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return new Map(pairs);
}

function impactBoost(finding: KnowledgeIntegrityFindingV1): number {
  if (finding.business_impact === "ACTIVE_HIGH_VALUE_OPPORTUNITY") return 30;
  if (finding.business_impact === "ACTIVE_DECISION") return 20;
  return 0;
}

function findingItem(finding: KnowledgeIntegrityFindingV1, routes: ReadonlyMap<string, string>): KnowledgeHealthQueueItemV1 {
  const canonicalId = [...finding.affected_canonical_ids].sort((a, b) => a.localeCompare(b))[0];
  const priority = severityRank[finding.severity] + impactBoost(finding) +
    (finding.truth_state === "CONFLICTED" ? 10 : 0) + (finding.time_state === "OVERDUE" ? 5 : 0);
  return freeze({
    id: finding.finding_id,
    issue_type: ISSUE_LABELS[finding.finding_type],
    affected: finding.affected_canonical_ids.length
      ? `${finding.affected_canonical_ids.length} canonical record${finding.affected_canonical_ids.length === 1 ? "" : "s"}`
      : "Affected record unknown",
    why_it_matters: WHY[finding.finding_type],
    truth_state: finding.truth_state,
    freshness_state: finding.freshness_state,
    evidence_count: finding.evidence_refs.length,
    source_count: finding.source_lineage_refs.length,
    next_step: finding.recommended_next_step,
    review_required: finding.review_required,
    action_available: false as const,
    detail_href: canonicalId ? routes.get(canonicalId) ?? null : null,
    priority
  });
}

function referenceItem(reference: UnresolvedReferenceV1, routes: ReadonlyMap<string, string>): KnowledgeHealthQueueItemV1 {
  const ambiguous = reference.status === "REVIEW_REQUIRED" || reference.candidates.length > 1;
  const canonicalId = reference.resolved_canonical_id ?? reference.affected_canonical_object_ids[0];
  return freeze({
    id: `reference:${reference.reference_id}`,
    issue_type: ambiguous ? "Ambiguous identity" : reference.status === "STALE" ? "Stale reference" : "Unresolved reference",
    affected: `${reference.reference_kind.toLowerCase()} reference: ${reference.display_label}`,
    why_it_matters: ambiguous
      ? "More than one supported identity remains plausible and requires review."
      : "The reference cannot yet be connected to one supported canonical record.",
    truth_state: reference.truth_state,
    freshness_state: reference.status === "STALE" ? "STALE" : "UNKNOWN",
    evidence_count: reference.candidates.reduce((total, candidate) => total + candidate.match_evidence_refs.length, 0),
    source_count: reference.provenance_refs.length,
    next_step: "REVIEW_ENTITY_RESOLUTION" as const,
    review_required: true,
    action_available: false as const,
    detail_href: canonicalId ? routes.get(canonicalId) ?? null : null,
    priority: ambiguous ? 335 : 225
  });
}

function learningItem(item: LearningObjectV1): KnowledgeHealthQueueItemV1 {
  return freeze({
    id: `learning:${item.learning_id}`,
    issue_type: "Learning awaiting review",
    affected: item.title,
    why_it_matters: "Evidence-backed learning remains a candidate until governed review is complete.",
    truth_state: item.truth_state,
    freshness_state: item.truth_state === "STALE" ? "STALE" : item.truth_state === "UNKNOWN" ? "UNKNOWN" : "FRESH",
    evidence_count: item.evidence.length,
    source_count: new Set(item.evidence.map((evidence) => evidence.source_lineage_id)).size,
    next_step: "REVIEW_LEARNING" as const,
    review_required: true,
    action_available: false as const,
    detail_href: null,
    priority: item.lifecycle_state === "APPROVED" ? 250 : 215
  });
}

function compareQueue(a: KnowledgeHealthQueueItemV1, b: KnowledgeHealthQueueItemV1): number {
  return b.priority - a.priority || a.issue_type.localeCompare(b.issue_type) || a.id.localeCompare(b.id);
}

export function buildKnowledgeHealthViewV1(input: KnowledgeHealthInputV1): KnowledgeHealthViewV1 {
  const complete = input.findings !== null && input.unresolved_references !== null && input.learning_items !== null;
  const findings = input.findings ?? [];
  const references = (input.unresolved_references ?? []).filter((reference) => reference.status !== "RESOLVED" && reference.status !== "REJECTED");
  const learning = (input.learning_items ?? []).filter(
    (item) => (item.lifecycle_state === "CANDIDATE" || item.lifecycle_state === "APPROVED") && item.evidence.length > 0
  );
  const routes = targetMap(input.drill_targets ?? []);
  const queue = [
    ...findings.map((finding) => findingItem(finding, routes)),
    ...references.map((reference) => referenceItem(reference, routes)),
    ...learning.map(learningItem)
  ].sort(compareQueue).slice(0, KNOWLEDGE_HEALTH_QUEUE_LIMIT);

  const summary = freeze({
    blocking_findings: findings.filter((finding) => finding.severity === "BLOCKING").length,
    important_findings: findings.filter((finding) => finding.severity === "IMPORTANT").length,
    unresolved_or_ambiguous_references: references.length,
    material_conflicts: findings.filter((finding) =>
      finding.truth_state === "CONFLICTED" && finding.business_impact !== "NONE"
    ).length,
    stale_decision_knowledge: findings.filter((finding) =>
      finding.freshness_state === "STALE" && finding.business_impact !== "NONE"
    ).length,
    missing_provenance: findings.filter((finding) => finding.finding_type === "MISSING_PROVENANCE").length,
    overdue_or_missing_next_actions: findings.filter((finding) =>
      finding.finding_type === "OVERDUE_COMMITMENT" || finding.finding_type === "MISSING_NEXT_ACTION"
    ).length,
    learning_items_awaiting_review: learning.length
  });

  const health: KnowledgeHealthStatusV1 = !complete
    ? "UNKNOWN"
    : summary.blocking_findings > 0
      ? "BLOCKED"
      : summary.important_findings > 0 || summary.material_conflicts > 0
        ? "DEGRADED"
        : queue.length > 0
          ? "NEEDS_ATTENTION"
          : "HEALTHY";
  const noDetectedIssues = complete && queue.length === 0;

  return freeze({
    contract_version: KNOWLEDGE_HEALTH_VIEW_CONTRACT_VERSION,
    health,
    coverage: complete ? "COMPLETE" as const : "INCOMPLETE" as const,
    summary,
    queue: Object.freeze(queue),
    no_detected_issues: noDetectedIssues,
    status_message: !complete
      ? "Knowledge health is unknown because canonical coverage is incomplete."
      : noDetectedIssues
        ? "No integrity problems were detected in the supplied canonical data. This is not proof that all company knowledge is perfect."
        : `${queue.length} supported item${queue.length === 1 ? "" : "s"} need attention.`,
    read_only: true as const
  });
}
