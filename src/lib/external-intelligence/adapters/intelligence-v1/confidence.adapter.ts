import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { Confidence as InternalConfidence } from "@/lib/intelligence-v1/contracts";

import type { ConfidenceAxis, ConfidenceAxes } from "@/lib/external-intelligence/contracts/confidence-axes";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { INTELLIGENCE_V1_ADAPTER_POLICY_REF } from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";

function unknownAxis(input?: Partial<ConfidenceAxis>): ConfidenceAxis {
  return {
    level: "unknown",
    bounded_score: null,
    reasons: input?.reasons ?? [],
    blockers: input?.blockers ?? [],
    supporting_reference_ids: input?.supporting_reference_ids ?? [],
    contradicting_reference_ids: input?.contradicting_reference_ids ?? [],
    missing_evidence_ids: input?.missing_evidence_ids ?? []
  };
}

function mapLegacyLevel(level: ExplanationConfidence): ConfidenceAxis["level"] {
  switch (level) {
    case "confirmed":
      return "known";
    case "strongly_supported":
      return "likely";
    case "likely":
      return "likely";
    case "possible":
      return "possible";
    case "insufficient_evidence":
      return "unknown";
  }
}

export type ConfidenceAdapterResult = {
  confidence: ConfidenceAxes;
  adapter_policy: typeof INTELLIGENCE_V1_ADAPTER_POLICY_REF;
};

export function adaptInternalConfidenceToConfidenceAxes(input: {
  confidence: InternalConfidence | { level: ExplanationConfidence; reasons: string[] };
  supporting_refs?: VersionRef[];
  contradicting_refs?: VersionRef[];
  missing_evidence_ids?: string[];
}): ConfidenceAdapterResult {
  const supporting = input.supporting_refs ?? [];
  const contradicting = input.contradicting_refs ?? [];
  const missing = input.missing_evidence_ids ?? [];

  const legacyLevel = input.confidence.level;
  const overall: ConfidenceAxis = {
    level: mapLegacyLevel(legacyLevel),
    bounded_score: ("score" in input.confidence ? input.confidence.score : null) ?? null,
    reasons: [
      `mapped_from_legacy_confidence:${legacyLevel}`,
      ...(input.confidence.reasons ?? [])
    ],
    blockers: [
      "legacy_confidence_is_single_axis",
      "missing_multidimensional_axes"
    ],
    supporting_reference_ids: supporting,
    contradicting_reference_ids: contradicting,
    missing_evidence_ids: missing
  };

  return {
    adapter_policy: INTELLIGENCE_V1_ADAPTER_POLICY_REF,
    confidence: {
      evidence: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      interpretation: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      business_relevance: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      mechanism: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      timing: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      entity_resolution: unknownAxis({ blockers: ["not_provided_by_legacy_confidence"], supporting_reference_ids: supporting, contradicting_reference_ids: contradicting, missing_evidence_ids: missing }),
      overall
    }
  };
}
