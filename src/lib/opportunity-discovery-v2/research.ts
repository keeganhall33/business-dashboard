import type { DecisionRecommendation, HoldTrigger, ResearchQuestion, ScoredFactor } from "./types";

function hasUnknown(factors: ScoredFactor[], id: ScoredFactor["id"]) {
  const factor = factors.find((f) => f.id === id);
  return factor ? !factor.known : true;
}

export function buildNextResearchQuestions(params: {
  factors: ScoredFactor[];
  recommendation: DecisionRecommendation;
}): ResearchQuestion[] {
  const qs: ResearchQuestion[] = [];

  if (params.recommendation === "DROP") return [];

  if (hasUnknown(params.factors, "ACCESS")) {
    qs.push({
      key: "access_path",
      question: "Do we have a warm intro / named decision-maker path, or is this cold outreach?",
      importance: "critical",
      expectedInfoGain: "high",
      resolvable: "likely",
      wouldChangeDecision: true
    });
  }

  if (hasUnknown(params.factors, "COMMERCIAL_SCALE")) {
    qs.push({
      key: "budget_evidence",
      question: "What concrete budget/procurement evidence exists for comparable commissions, activations, or licensing advances?",
      importance: "critical",
      expectedInfoGain: "high",
      resolvable: "maybe",
      wouldChangeDecision: true
    });
  }

  if (hasUnknown(params.factors, "BUYER_INTENT_SIGNAL")) {
    qs.push({
      key: "buyer_intent",
      question: "Is there evidence the buyer actively commissions/acquires similar work (recent commissions, partnerships, drops, auctions, corporate gifting)?",
      importance: "high",
      expectedInfoGain: "high",
      resolvable: "likely",
      wouldChangeDecision: true
    });
  }

  if (hasUnknown(params.factors, "TIMING")) {
    qs.push({
      key: "timing_window",
      question: "What is the decision window / event date / launch date that creates urgency?",
      importance: "high",
      expectedInfoGain: "medium",
      resolvable: "likely",
      wouldChangeDecision: true
    });
  }

  // Always useful when moving beyond discovery.
  qs.push({
    key: "scope_definition",
    question: "What is the smallest credible scope (1 hero original? series? rights package?) that can win this without overcommitting production time?",
    importance: "high",
    expectedInfoGain: "medium",
    resolvable: "likely",
    wouldChangeDecision: true
  });

  return qs.slice(0, 5);
}

export function shouldStopResearch(params: {
  recommendation: DecisionRecommendation;
  factors: ScoredFactor[];
  evidenceCeilingReached?: boolean;
}): { stop: boolean; reason: string } {
  if (params.recommendation === "ADVANCE_NOW") {
    return { stop: true, reason: "Qualified enough to advance; further research is not decision-changing." };
  }
  if (params.recommendation === "DROP") {
    return { stop: true, reason: "Disqualified/weak; stop spending time." };
  }
  if (params.recommendation === "HOLD_AND_MONITOR") {
    return { stop: true, reason: "Hold-and-monitor chosen; wait for explicit triggers." };
  }
  if (params.evidenceCeilingReached) {
    return { stop: true, reason: "Evidence ceiling reached; further research unlikely to change decision." };
  }
  return { stop: false, reason: "Continue question-driven research." };
}

export function buildHoldTriggers(seedSummary: string | null | undefined): HoldTrigger[] {
  const text = (seedSummary ?? "").toLowerCase();
  const triggers: HoldTrigger[] = [];
  if (!text) {
    triggers.push({ trigger: "Any new concrete date / launch / event window", why: "Timing is currently unknown." });
    triggers.push({ trigger: "Named warm intro or decision-maker identified", why: "Access path is currently weak/unknown." });
    return triggers;
  }
  if (/(launch|opening|anniversary|season|tournament|auction|sport week)/.test(text)) {
    triggers.push({ trigger: "Event date enters a 90-day window", why: "Becomes actionable when lead time is real." });
  }
  triggers.push({ trigger: "New evidence link or procurement signal appears", why: "Upgrades evidence strength / buyer intent." });
  return triggers;
}

