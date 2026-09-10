import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";

export type SpecialistCommandCenterTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type SpecialistCommandCenterFreshnessV1 = "CURRENT" | "STALE" | "CONFLICTED" | "UNKNOWN";
export type SpecialistCommandCenterModeV1 = "PRODUCTION" | "FIXTURE";
export type SpecialistCommandCenterSourceModeV1 = "PRODUCTION" | "FIXTURE";

export function toSpecialistEvidenceFreshnessV1(
  truthState: SpecialistCommandCenterTruthStateV1,
  freshnessKnownCurrent = true
): SpecialistCommandCenterFreshnessV1 {
  if (truthState === "CONFLICTED") return "CONFLICTED";
  if (truthState === "STALE") return "STALE";
  if (truthState === "UNKNOWN" || !freshnessKnownCurrent) return "UNKNOWN";
  return "CURRENT";
}

export type SpecialistCommandCenterCardV1 = {
  id: "financial" | "goals-capacity" | "relationships";
  title: string;
  what_changed: string;
  why_it_matters: string;
  next_best_action: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | ExplanationConfidence;
  truth_state: SpecialistCommandCenterTruthStateV1;
  evidence_freshness: SpecialistCommandCenterFreshnessV1;
  evidence_context: {
    source_label: string;
    freshness_detail: string;
    truth_detail: string;
    last_updated: string | null;
  };
  material_gap_or_risk: string;
  detail_href: string;
  evidence: string;
  decision_room_id?: string;
  approval_class?: string;
  source: string;
  source_mode?: SpecialistCommandCenterSourceModeV1;
};

export type SpecialistProductionInputV1 = {
  source_mode: "PRODUCTION";
  cards: readonly SpecialistCommandCenterCardV1[];
};

export type SpecialistCapabilityStatusV1 = {
  id: SpecialistCommandCenterCardV1["id"];
  title: string;
  availability: "PRODUCTION_BACKED" | "UNAVAILABLE";
  truth_state: SpecialistCommandCenterTruthStateV1;
  evidence_freshness: SpecialistCommandCenterFreshnessV1;
  can_trust: string;
  missing_evidence: string;
  next_safe_step: string;
  detail_href: string | null;
};

const SPECIALIST_CAPABILITY_BASE_V1: readonly Omit<SpecialistCapabilityStatusV1, "availability" | "truth_state" | "evidence_freshness" | "can_trust" | "detail_href">[] = [
  {
    id: "financial",
    title: "Financial",
    missing_evidence: "No canonical production financial specialist snapshot is supplied to this surface.",
    next_safe_step: "Supply a verified production financial snapshot before presenting a financial conclusion."
  },
  {
    id: "goals-capacity",
    title: "Goals / Capacity",
    missing_evidence: "No canonical production goals or capacity specialist snapshot is supplied to this surface.",
    next_safe_step: "Supply verified goals and capacity evidence before presenting portfolio pressure as current truth."
  },
  {
    id: "relationships",
    title: "Relationships",
    missing_evidence: "No canonical production relationship specialist snapshot is supplied to this surface.",
    next_safe_step: "Use verified CRM and correspondence evidence before presenting a relationship recommendation."
  }
] as const;

function cloneSpecialistCardV1(card: SpecialistCommandCenterCardV1): SpecialistCommandCenterCardV1 {
  return {
    ...card,
    evidence_context: { ...card.evidence_context }
  };
}

export function getProductionSpecialistCommandCenterCardsV1(
  input?: SpecialistProductionInputV1
): SpecialistCommandCenterCardV1[] {
  if (!input || input.source_mode !== "PRODUCTION" || !Array.isArray(input.cards)) return [];
  return input.cards
    .filter((card) => card.source_mode === "PRODUCTION")
    .map((card) => cloneSpecialistCardV1(card));
}

export function getSpecialistCommandCenterCardsForModeV1(
  mode: SpecialistCommandCenterModeV1,
  productionInput?: SpecialistProductionInputV1
): SpecialistCommandCenterCardV1[] {
  if (mode !== "PRODUCTION") return [];
  return getProductionSpecialistCommandCenterCardsV1(productionInput);
}

export function getSpecialistCapabilityStatusV1(
  productionInput?: SpecialistProductionInputV1
): SpecialistCapabilityStatusV1[] {
  const cards = getProductionSpecialistCommandCenterCardsV1(productionInput);

  return SPECIALIST_CAPABILITY_BASE_V1.map((capability) => {
    const card = cards.find((candidate) => candidate.id === capability.id);
    if (!card) {
      return {
        ...capability,
        availability: "UNAVAILABLE",
        truth_state: "UNKNOWN",
        evidence_freshness: "UNKNOWN",
        can_trust: "No current specialist conclusion is presented without a verified production input.",
        detail_href: null
      };
    }

    return {
      ...capability,
      availability: "PRODUCTION_BACKED",
      truth_state: card.truth_state,
      evidence_freshness: card.evidence_freshness,
      can_trust: card.why_it_matters,
      missing_evidence: card.material_gap_or_risk,
      next_safe_step: card.next_best_action,
      detail_href: card.detail_href
    };
  });
}
