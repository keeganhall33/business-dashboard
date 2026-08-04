import type { Hypothesis } from "@/lib/intelligence-v1/contracts";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { createVersionRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { INTELLIGENCE_V1_ADAPTER_POLICY_REF } from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";
import { createInternalFactVersionRef, type VersionedInternalFactRef } from "@/lib/external-intelligence/adapters/intelligence-v1/fact-ref.adapter";
import { adaptInternalConfidenceToConfidenceAxes } from "@/lib/external-intelligence/adapters/intelligence-v1/confidence.adapter";

export type InternalHypothesisCompatibilityEnvelope = {
  hypothesis: Hypothesis;
  hypothesis_version_ref: VersionRef;
  linked_finding_version_ref: VersionRef;
  linked_fact_version_refs: VersionedInternalFactRef[];
  confidence_axes: ReturnType<typeof adaptInternalConfidenceToConfidenceAxes>["confidence"];
  adapter_policy: typeof INTELLIGENCE_V1_ADAPTER_POLICY_REF;
};

export function createInternalHypothesisVersionRef(input: {
  hypothesis: Hypothesis;
  linkedFindingVersionRef: VersionRef;
}): InternalHypothesisCompatibilityEnvelope {
  const h = input.hypothesis;
  if (!h.hypothesis_id) throw new Error("Hypothesis.hypothesis_id is required");

  const linked_finding_version_ref = input.linkedFindingVersionRef;
  if (linked_finding_version_ref.object_type !== "internal_finding") {
    throw new Error("linkedFindingVersionRef must be object_type=internal_finding");
  }
  if (linked_finding_version_ref.object_id !== h.finding_id) {
    throw new Error("linkedFindingVersionRef.object_id must match hypothesis.finding_id");
  }

  const linkedFacts = [...(h.evidence_for ?? []), ...(h.evidence_against ?? [])];
  const linked_fact_version_refs = linkedFacts.map((fact) => createInternalFactVersionRef({ fact }));

  const semantic = {
    hypothesis_id: h.hypothesis_id,
    finding_id: h.finding_id,
    linked_finding_version_ref,
    engine_version: h.engine_version,
    statement: h.statement,
    mechanism: h.mechanism,
    predictions: h.predictions,
    disambiguation_test: h.disambiguation_test,
    evidence_for: h.evidence_for,
    evidence_against: h.evidence_against,
    missing_evidence: h.missing_evidence,
    confidence: h.confidence
  };

  const content_hash = createVersionRefContentHash(semantic);

  const hypothesis_version_ref: VersionRef = {
    object_type: "internal_hypothesis",
    object_id: h.hypothesis_id,
    version_id: null,
    content_hash,
    schema_version: "intelligence_v1_hypothesis",
    policy_version: INTELLIGENCE_V1_ADAPTER_POLICY_REF.semantic_version,
    created_at: new Date(0).toISOString()
  };

  const confidence_axes = adaptInternalConfidenceToConfidenceAxes({
    confidence: h.confidence,
    missing_evidence_ids: h.missing_evidence
  }).confidence;

  return deepFreeze({
    hypothesis: h,
    hypothesis_version_ref,
    linked_finding_version_ref,
    linked_fact_version_refs,
    confidence_axes,
    adapter_policy: INTELLIGENCE_V1_ADAPTER_POLICY_REF
  });
}
