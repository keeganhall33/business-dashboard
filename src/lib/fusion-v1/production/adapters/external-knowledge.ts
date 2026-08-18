import type { BusinessDomain, FusionCandidate, FusionConfidence, StrategicGuardrailViolation } from "@/lib/fusion-v1/contracts";
import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { PolicyRefSchema } from "@/lib/external-intelligence/contracts/policy-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { VersionRefSchema } from "@/lib/external-intelligence/contracts/version-ref";

export const CANONICAL_EXTERNAL_KNOWLEDGE_ADAPTER_VERSION_V1 = "canonical_external_knowledge_fusion_adapter_v1.0" as const;

type CanonicalKnowledgeKind = "finding" | "hypothesis" | "risk" | "opportunity";
type CanonicalKnowledgeLifecycle =
  | "active"
  | "corroborated"
  | "supported"
  | "contradicted"
  | "under_review"
  | "superseded"
  | "expired"
  | "invalidated"
  | "archived";

export type CanonicalExternalKnowledgeObjectV1 = {
  kind: CanonicalKnowledgeKind;
  version_ref: VersionRef;
  lifecycle_status: CanonicalKnowledgeLifecycle;
  title: string;
  summary: string;
  business_domains: BusinessDomain[];
  affected_entities: Array<{ entity_id: string; role: string; entity_type: string | null }>;
  expected_business_mechanism: string | null;
  missing_evidence: string[];
  contradiction_refs: VersionRef[];
  confidence: ConfidenceAxes;
  relevance_expires_at: string;
  value_potential_proxy: number;
  information_gain_value: number;
  strategic_fit: number;
  licensing_ip_review_required: boolean;
  strategic_guardrail_violations: StrategicGuardrailViolation[];
};

export type CanonicalExternalFusionContextV1 = {
  fusion_context_id: string;
  generated_at: string;
  context_window: { start: string; end: string };
  domains: BusinessDomain[];
  finding_version_refs: VersionRef[];
  hypothesis_version_refs: VersionRef[];
  risk_version_refs: VersionRef[];
  opportunity_version_refs: VersionRef[];
  world_model_state_version_ref: VersionRef;
  contradiction_refs: VersionRef[];
  missing_evidence_refs: VersionRef[];
  confidence_summary: ConfidenceAxes;
  freshness_summary: { status: "fresh" | "monitor_only" | "stale"; reasons: string[] };
  licensing_constraints: { blocked: boolean; reasons: string[] };
  strategic_fit_constraints: { blocked: boolean; guardrail_violations: StrategicGuardrailViolation[]; reasons: string[] };
  provenance_bundle: {
    explanation_version_refs: VersionRef[];
    input_version_refs: VersionRef[];
  };
  context_policy_version: PolicyRef;
  content_hash: string;
  knowledge_objects: CanonicalExternalKnowledgeObjectV1[];
};

export type CanonicalExternalKnowledgeAdapterResultV1 = {
  candidates: FusionCandidate[];
  rejected: Array<{ id: string; reason: string }>;
};

function refKey(ref: VersionRef): string {
  return `${ref.object_type}:${ref.object_id}:${ref.content_hash}`;
}

function validateVersionRef(ref: VersionRef, label: string): string | null {
  const parsed = VersionRefSchema.safeParse(ref);
  if (!parsed.success) return `${label}: invalid_version_ref`;
  if (ref.object_type === "signal" || ref.object_type === "evidence_reference" || ref.object_type === "claim" || ref.object_type === "event") {
    return `${label}: raw_or_pre_synthesis_ref_not_allowed`;
  }
  return null;
}

function contextRefSet(input: CanonicalExternalFusionContextV1): Set<string> {
  return new Set(
    [
      ...input.finding_version_refs,
      ...input.hypothesis_version_refs,
      ...input.risk_version_refs,
      ...input.opportunity_version_refs
    ].map(refKey)
  );
}

function expectedObjectType(kind: CanonicalKnowledgeKind): VersionRef["object_type"] {
  if (kind === "finding") return "finding";
  if (kind === "hypothesis") return "hypothesis";
  if (kind === "risk") return "risk";
  return "opportunity";
}

function confidenceToFusion(confidence: ConfidenceAxes): FusionConfidence {
  const overall = confidence.overall;
  const level =
    overall.level === "known"
      ? "strongly_supported"
      : overall.level === "likely"
        ? "likely"
        : overall.level === "possible"
          ? "possible"
          : "insufficient_evidence";

  return {
    system: "explanation_confidence",
    level,
    score: null,
    reasons: overall.reasons,
    blockers: [...overall.blockers, ...overall.missing_evidence_ids.map((id) => `missing:${id}`)]
  };
}

function confidenceVersionRefRejection(confidence: ConfidenceAxes): string | null {
  const axes = [
    confidence.evidence,
    confidence.interpretation,
    confidence.business_relevance,
    confidence.mechanism,
    confidence.timing,
    confidence.entity_resolution,
    confidence.overall
  ];
  for (const axis of axes) {
    for (const ref of [...axis.supporting_reference_ids, ...axis.contradicting_reference_ids]) {
      const invalid = validateVersionRef(ref, `confidence:${ref.object_id}`);
      if (invalid) return invalid;
    }
  }
  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isFreshEnough(nowIso: string, expiresAt: string): boolean {
  const now = new Date(nowIso).getTime();
  const expires = new Date(expiresAt).getTime();
  return Number.isFinite(now) && Number.isFinite(expires) && expires >= now;
}

function candidateIdFor(context: CanonicalExternalFusionContextV1, object: CanonicalExternalKnowledgeObjectV1): string {
  return `canonical_external:${object.kind}:${canonicalJsonSha256Hex({
    fusion_context_id: context.fusion_context_id,
    object_type: object.version_ref.object_type,
    object_id: object.version_ref.object_id,
    content_hash: object.version_ref.content_hash,
    context_hash: context.content_hash
  }).slice(0, 24)}`;
}

function validateContextShape(input: CanonicalExternalFusionContextV1): string[] {
  const rejected: string[] = [];
  if (PolicyRefSchema.safeParse(input.context_policy_version).success === false) rejected.push("context_policy_version: invalid_policy_ref");
  for (const [label, refs] of [
    ["finding_version_refs", input.finding_version_refs],
    ["hypothesis_version_refs", input.hypothesis_version_refs],
    ["risk_version_refs", input.risk_version_refs],
    ["opportunity_version_refs", input.opportunity_version_refs],
    ["contradiction_refs", input.contradiction_refs],
    ["missing_evidence_refs", input.missing_evidence_refs],
    ["provenance_bundle.explanation_version_refs", input.provenance_bundle.explanation_version_refs],
    ["provenance_bundle.input_version_refs", input.provenance_bundle.input_version_refs]
  ] as const) {
    for (const ref of refs) {
      const invalid = validateVersionRef(ref, label);
      if (invalid) rejected.push(invalid);
    }
  }
  const worldInvalid = validateVersionRef(input.world_model_state_version_ref, "world_model_state_version_ref");
  if (worldInvalid) rejected.push(worldInvalid);
  return rejected;
}

function mapKnowledgeObjectToCandidate(input: {
  nowIso: string;
  context: CanonicalExternalFusionContextV1;
  object: CanonicalExternalKnowledgeObjectV1;
  validContextRefs: Set<string>;
}): { candidate: FusionCandidate | null; rejected_reason: string | null } {
  const object = input.object;
  const invalidRef = validateVersionRef(object.version_ref, object.version_ref.object_id);
  if (invalidRef) return { candidate: null, rejected_reason: invalidRef };
  if (object.version_ref.object_type !== expectedObjectType(object.kind)) return { candidate: null, rejected_reason: "version_ref_object_type_mismatch" };
  const invalidConfidenceRef = confidenceVersionRefRejection(object.confidence);
  if (invalidConfidenceRef) return { candidate: null, rejected_reason: invalidConfidenceRef };
  if (!input.validContextRefs.has(refKey(object.version_ref))) return { candidate: null, rejected_reason: "version_ref_missing_from_fusion_context" };
  if (!["active", "corroborated", "supported"].includes(object.lifecycle_status)) return { candidate: null, rejected_reason: `ineligible_lifecycle:${object.lifecycle_status}` };
  if (!isFreshEnough(input.nowIso, object.relevance_expires_at)) return { candidate: null, rejected_reason: "expired_relevance" };
  if (object.confidence.overall.level === "rumor" || object.confidence.overall.level === "speculation" || object.confidence.overall.level === "unknown") {
    return { candidate: null, rejected_reason: `insufficient_overall_confidence:${object.confidence.overall.level}` };
  }
  if (object.licensing_ip_review_required) return { candidate: null, rejected_reason: "licensing_ip_review_required" };
  if (object.contradiction_refs.length >= 2 || object.confidence.overall.contradicting_reference_ids.length >= 2) {
    return { candidate: null, rejected_reason: "too_many_contradictions" };
  }

  const evidenceRefIds = [
    object.version_ref,
    input.context.world_model_state_version_ref,
    ...input.context.provenance_bundle.explanation_version_refs
  ].map(refKey);

  const candidate: FusionCandidate = {
    candidate_id: candidateIdFor(input.context, object),
    candidate_type: "canonical_external_knowledge",
    source_engine: "external_knowledge_synthesis",
    source_engine_version: CANONICAL_EXTERNAL_KNOWLEDGE_ADAPTER_VERSION_V1,
    linked_finding_id: object.kind === "finding" ? object.version_ref.object_id : null,
    linked_hypothesis_ids: object.kind === "hypothesis" ? [object.version_ref.object_id] : [],
    linked_opportunity_id: object.kind === "opportunity" ? object.version_ref.object_id : null,
    linked_recommendation_id: null,
    recommendation_fingerprint: null,
    affected_business_domains: [...object.business_domains].sort(),
    affected_entities: object.affected_entities,
    supporting_evidence_fact_ids: evidenceRefIds,
    contradicting_evidence_fact_ids: object.contradiction_refs.map(refKey),
    missing_evidence: object.missing_evidence,
    internal_sources_used: [],
    external_signals_used: [],
    external_signals_missing: object.missing_evidence,
    expected_mechanism: object.expected_business_mechanism,
    blocked_domain_constraints: [],
    strategic_guardrail_violations: object.strategic_guardrail_violations,
    confidence: confidenceToFusion(object.confidence),
    urgency: object.kind === "risk" ? "medium" : "low",
    risk: object.kind === "risk" || object.contradiction_refs.length ? "medium" : "low",
    value_potential_proxy: clamp01(object.value_potential_proxy),
    information_gain_value: clamp01(object.information_gain_value),
    strategic_fit: clamp01(object.strategic_fit),
    relevance_expires_at: object.relevance_expires_at,
    current_regime: input.context.fusion_context_id,
    proposed_action: null,
    evidence_edges: [],
    thesis_influence_trace: [
      {
        source: "canonical_external_fusion_context",
        fusion_context_id: input.context.fusion_context_id,
        fusion_context_hash: input.context.content_hash,
        object_version_ref: object.version_ref,
        context_policy_version: input.context.context_policy_version
      }
    ],
    knowledge_gap_ids: [...object.missing_evidence, ...object.confidence.overall.missing_evidence_ids].sort(),
    scenario_ids_evaluated: [],
    resilience_score: null,
    fragile_assumptions: object.confidence.overall.blockers,
    contingency_id: null,
    early_warning_indicators: object.kind === "risk" ? [object.title] : []
  };

  return { candidate, rejected_reason: null };
}

export function canonicalExternalFusionContextToCandidates(input: {
  nowIso: string;
  context: CanonicalExternalFusionContextV1;
}): CanonicalExternalKnowledgeAdapterResultV1 {
  const rejected: CanonicalExternalKnowledgeAdapterResultV1["rejected"] = [];
  const candidates: FusionCandidate[] = [];
  const contextRejections = validateContextShape(input.context);
  if (contextRejections.length) {
    return {
      candidates,
      rejected: contextRejections.map((reason) => ({ id: input.context.fusion_context_id, reason }))
    };
  }
  if (input.context.freshness_summary.status === "stale") {
    return { candidates, rejected: [{ id: input.context.fusion_context_id, reason: "stale_fusion_context" }] };
  }
  if (input.context.licensing_constraints.blocked) {
    return { candidates, rejected: [{ id: input.context.fusion_context_id, reason: "blocked_by_licensing_constraints" }] };
  }
  if (input.context.strategic_fit_constraints.blocked) {
    return { candidates, rejected: [{ id: input.context.fusion_context_id, reason: "blocked_by_strategic_fit_constraints" }] };
  }

  const validContextRefs = contextRefSet(input.context);
  for (const object of input.context.knowledge_objects) {
    const mapped = mapKnowledgeObjectToCandidate({ nowIso: input.nowIso, context: input.context, object, validContextRefs });
    if (mapped.candidate) candidates.push(mapped.candidate);
    if (mapped.rejected_reason) rejected.push({ id: object.version_ref.object_id, reason: mapped.rejected_reason });
  }

  candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  rejected.sort((a, b) => a.id.localeCompare(b.id) || a.reason.localeCompare(b.reason));
  return { candidates, rejected };
}
