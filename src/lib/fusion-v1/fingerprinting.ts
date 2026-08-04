import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

export function computeFusionCandidateFingerprint(candidate: FusionCandidate): string {
  return canonicalJsonSha256Hex(candidate);
}

export function computeFusionInputSetFingerprint(input: {
  policy_version: string;
  score_version: string;
  strategic_constraints_hash: string;
  candidates: Array<{ candidate_id: string; candidate_fingerprint: string }>;
}): string {
  // Deterministic: sort by candidate_id.
  const normalized = {
    policy_version: input.policy_version,
    score_version: input.score_version,
    strategic_constraints_hash: input.strategic_constraints_hash,
    candidates: [...input.candidates]
      .slice()
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
  };
  return canonicalJsonSha256Hex(normalized);
}

