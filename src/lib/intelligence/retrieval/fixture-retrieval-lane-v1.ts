import type { ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { ExternalSignal } from "@/lib/external-intelligence/contracts/external-signal";
import { explanationEvidenceItemToCandidateV1, externalSignalToCandidateV1 } from "./evidence-adapters-v1";
import { rankEvidenceCandidatesV1, type EvidenceCandidateV1, type RankedEvidenceV1 } from "./evidence-ranking-v1";

export type FixtureRetrievalLaneInputV1 = {
  explanationEvidence: ExplanationEvidenceItem;
  externalSignal: ExternalSignal;
  nowIso: string;
};

export function buildEvidenceCandidatesFromFixturesV1(input: FixtureRetrievalLaneInputV1): EvidenceCandidateV1[] {
  const a = explanationEvidenceItemToCandidateV1(input.explanationEvidence);
  const b = externalSignalToCandidateV1(input.externalSignal);
  return [a, b];
}

export function buildRankedEvidenceFromFixturesV1(input: FixtureRetrievalLaneInputV1): RankedEvidenceV1[] {
  const candidates = buildEvidenceCandidatesFromFixturesV1(input);
  return rankEvidenceCandidatesV1({ candidates, nowIso: input.nowIso });
}

