import type { ConfidenceLevel } from "@/lib/external-intelligence/contracts/enums";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

export type ConfidenceAxis = {
  level: ConfidenceLevel;

  /**
   * Optional bounded score, only when defensible.
   * Must not be used to fabricate probabilities.
   */
  bounded_score: number | null; // 0..1 or null

  reasons: string[];
  blockers: string[];

  supporting_reference_ids: VersionRef[];
  contradicting_reference_ids: VersionRef[];
  missing_evidence_ids: string[];
};

export type ConfidenceAxes = {
  evidence: ConfidenceAxis;
  interpretation: ConfidenceAxis;
  business_relevance: ConfidenceAxis;
  mechanism: ConfidenceAxis;
  timing: ConfidenceAxis;
  entity_resolution: ConfidenceAxis;
  overall: ConfidenceAxis; // derived
};
