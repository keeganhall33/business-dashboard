import type { Finding } from "@/lib/intelligence-v1/contracts";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { createVersionRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { INTELLIGENCE_V1_ADAPTER_POLICY_REF } from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";
import { createInternalFactVersionRef, type VersionedInternalFactRef } from "@/lib/external-intelligence/adapters/intelligence-v1/fact-ref.adapter";
import { adaptInternalConfidenceToConfidenceAxes } from "@/lib/external-intelligence/adapters/intelligence-v1/confidence.adapter";

export type InternalFindingCompatibilityEnvelope = {
  finding: Finding;
  finding_version_ref: VersionRef;
  linked_fact_version_refs: VersionedInternalFactRef[];
  confidence_axes: ReturnType<typeof adaptInternalConfidenceToConfidenceAxes>["confidence"];
  adapter_policy: typeof INTELLIGENCE_V1_ADAPTER_POLICY_REF;
};

export function createInternalFindingVersionRef(input: { finding: Finding }): InternalFindingCompatibilityEnvelope {
  const f = input.finding;
  if (!f.finding_id) throw new Error("Finding.finding_id is required");

  const linkedFacts = [...(f.facts_primary ?? []), ...(f.evidence_for ?? []), ...(f.evidence_against ?? [])];
  const linked_fact_version_refs = linkedFacts.map((fact) => createInternalFactVersionRef({ fact }));

  const semantic = {
    finding_id: f.finding_id,
    detector_id: f.detector_id,
    engine_version: f.engine_version,
    type: f.type,
    title: f.title,
    summary: f.summary,
    window: f.window,
    materiality_score: f.materiality_score,
    false_positive_guards: f.false_positive_guards,
    missing_evidence: f.missing_evidence,

    facts_primary: f.facts_primary,
    evidence_for: f.evidence_for,
    evidence_against: f.evidence_against,

    confidence: f.confidence
  };

  const content_hash = createVersionRefContentHash(semantic);

  const finding_version_ref: VersionRef = {
    object_type: "finding",
    object_id: f.finding_id,
    version_id: null,
    content_hash,
    schema_version: "intelligence_v1_finding",
    policy_version: INTELLIGENCE_V1_ADAPTER_POLICY_REF.semantic_version,
    created_at: new Date(0).toISOString()
  };

  const confidence_axes = adaptInternalConfidenceToConfidenceAxes({
    confidence: f.confidence,
    missing_evidence_ids: f.missing_evidence
  }).confidence;

  return deepFreeze({
    finding: f,
    finding_version_ref,
    linked_fact_version_refs,
    confidence_axes,
    adapter_policy: INTELLIGENCE_V1_ADAPTER_POLICY_REF
  });
}
