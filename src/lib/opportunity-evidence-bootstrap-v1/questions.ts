import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { OpportunityArchetype } from "@/lib/opportunity-discovery-v2/types";
import type {
  CoverageVariable,
  CoverageVariableKey,
  CoverageState,
  OpportunityCoverageProfile,
  ResearchQuestion
} from "./types";
import { ARCHETYPE_REQUIREMENTS_V1 } from "./archetype-requirements";
import { resolveOpportunitySubject } from "./subject";

type PriorityInputs = {
  decisionImpact: number;
  valuationImpact: number;
  rankingImpact: number;
  resolvability: number;
  dependencyPriority: number;
  uncertainty: number;
};

export function priorityScoreV1(input: PriorityInputs) {
  // Deterministic weighted sum. 0..100.
  const score =
    0.35 * input.decisionImpact +
    0.25 * input.valuationImpact +
    0.2 * input.rankingImpact +
    0.1 * input.resolvability +
    0.1 * input.dependencyPriority;

  // Unknown should rise: treat uncertainty as a multiplier (0.6..1.0).
  const mult = 0.6 + 0.4 * (Math.max(0, Math.min(100, input.uncertainty)) / 100);
  return Math.max(0, Math.min(100, score * mult));
}

function stateUncertainty(state: CoverageState) {
  return state === "UNKNOWN" ? 100 : state === "PARTIAL" ? 65 : state === "CONFLICTED" ? 85 : 0;
}

function findVar(profile: OpportunityCoverageProfile, key: CoverageVariableKey): CoverageVariable {
  const found = profile.variables.find((v) => v.key === key);
  if (!found) {
    return { key, state: "UNKNOWN", notes: ["missing variable"], supportingArtifacts: [] };
  }
  return found;
}

function topArchetypes(archetypes: OpportunityArchetype[]) {
  return archetypes.slice(0, 2);
}

function requiredVariables(archetypes: OpportunityArchetype[]): CoverageVariableKey[] {
  const set = new Set<CoverageVariableKey>();
  for (const a of topArchetypes(archetypes)) {
    for (const k of ARCHETYPE_REQUIREMENTS_V1[a].required) set.add(k);
  }
  return Array.from(set);
}

function sourcePriorityForVariable(key: CoverageVariableKey): string[] {
  switch (key) {
    case "IDENTITY_COVERAGE":
      return [
        "official_organization_site",
        "official_press_room",
        "authoritative_business_directory",
        "trade_press"
      ];
    case "TRIGGER_CONTEXT":
    case "TIMING_CONTEXT":
      return ["official_press_room", "official_event_site", "primary_statement", "authoritative_trade_press"];
    case "PROGRAM_SURFACES":
      return ["official_program_site", "official_partner_site", "authoritative_trade_press"];
    case "COMMERCIAL_CONTEXT":
    case "BUYER_INTENT":
      return ["official_partnerships_page", "official_press_room", "authoritative_trade_press", "earnings_call_transcript"];
    case "ACCESS_CONTEXT":
    case "CONTACT_COVERAGE":
      return ["first_party_relationship_context", "official_leadership", "official_partners", "trade_press"];
    case "VALUATION_INPUTS":
      return ["official_campaign_specs", "partner_activation_examples", "trade_press", "first_party_comps"];
    default:
      return ["official_source", "authoritative_trade_press", "secondary_sources"];
  }
}

function questionTemplate(key: CoverageVariableKey, profile: OpportunityCoverageProfile): { q: string; why: string; stop: string; effort: ResearchQuestion["effort_class"] } {
  const name = profile.opportunity_name;
  const org = profile.organization ?? "this organization";
  switch (key) {
    case "IDENTITY_COVERAGE":
      return {
        q: `Which real-world organization (or rights-holder/department) is the target behind the opportunity "${name}"?`,
        why: "A concept label cannot commission work; we must resolve the target organization before procurement/buyer-intent research.",
        stop: "Stop when the target organization is unambiguously identified (name + official domain or stable entity id) with evidence.",
        effort: "low"
      };
    case "TRIGGER_CONTEXT":
      return {
        q: `What exactly is the trigger behind "${name}" (event/campaign/partnership/milestone/program) and what concrete artifact proves it exists?`,
        why: "Without a trigger, the opportunity is undefined and cannot be valued or actioned.",
        stop: "Stop when a specific trigger artifact is identified with date/window and at least one supporting evidence reference.",
        effort: "medium"
      };
    case "TIMING_CONTEXT":
      return {
        q: `What is the actionable timing window for "${name}" (event date, launch window, planning deadline, procurement cycle)?`,
        why: "Timing determines whether we ADVANCE vs HOLD and constrains feasible scope.",
        stop: "Stop when a concrete window/date is pinned and lead-time is known enough to scope work.",
        effort: "low"
      };
    case "BUYER_INTENT":
      return {
        q: `Is there evidence that ${org} (or the resolved buyer for "${name}") commissions/procures comparable premium creative work?`,
        why: "Buyer intent is the single largest conversion predictor; avoids wasting cycles on non-buyers.",
        stop: "Stop when at least 1–3 comparable procurement examples are evidenced or the absence is strongly supported.",
        effort: "medium"
      };
    case "COMMERCIAL_CONTEXT":
      return {
        q: `What is the commercial structure for "${name}" (who pays, what rights/usage, scope count, and any budget/advance/royalty signals)?`,
        why: "Commercial structure drives valuation range far more than prestige.",
        stop: "Stop when payer + rights scope + one budget proxy is evidenced.",
        effort: "high"
      };
    case "ACCESS_CONTEXT":
      return {
        q: `What is the credible access path for "${name}" (decision-maker function, agency/partner, existing relationship, named intro path)?`,
        why: "Access determines whether we can convert; also determines which research is worth doing.",
        stop: "Stop when at least one buying function + one plausible path is identified.",
        effort: "medium"
      };
    case "PROGRAM_SURFACES":
      return {
        q: `Which enduring programs/surfaces does ${org} run that could support repeatable work (tours, annual events, capsule drops, hospitality programs)?`,
        why: "Program surfaces create repeatability and can justify higher pricing.",
        stop: "Stop when one repeatable surface is evidenced and scoped.",
        effort: "medium"
      };
    case "VALUATION_INPUTS":
      return {
        q: `What is the smallest credible deliverable scope for "${name}" (hero original count/size + bounded usage rights) that aligns with Keegan’s production constraints?`,
        why: "Valuation depends on scope + rights; prevents false precision.",
        stop: "Stop when a conservative baseline scope and rights package can be stated with assumptions.",
        effort: "medium"
      };
    case "CONTACT_COVERAGE":
      return {
        q: `Who are the 1–3 most likely buyer-side roles for "${name}" (partnerships, brand, licensing, auctions/private sales, venue marketing), and what evidence supports that mapping?`,
        why: "Contact discovery should follow qualification; it must be role-driven, not random.",
        stop: "Stop when the buying function is identified and 1–3 candidate roles are supported.",
        effort: "medium"
      };
    default:
      return {
        q: `What is missing for ${key} on "${name}"?`,
        why: "Decision quality depends on closing the highest-impact unknown.",
        stop: "Stop when the variable is evidenced or proven not resolvable.",
        effort: "medium"
      };
  }
}

function isOrgDependentVariable(key: CoverageVariableKey) {
  return (
    key === "BUYER_INTENT" ||
    key === "COMMERCIAL_CONTEXT" ||
    key === "ACCESS_CONTEXT" ||
    key === "CONTACT_COVERAGE" ||
    key === "PROGRAM_SURFACES"
  );
}

function isBuyerDependentVariable(key: CoverageVariableKey) {
  return key === "BUYER_INTENT" || key === "COMMERCIAL_CONTEXT" || key === "CONTACT_COVERAGE";
}

export function buildResearchQuestionsV1(profile: OpportunityCoverageProfile): ResearchQuestion[] {
  const identityVar = findVar(profile, "IDENTITY_COVERAGE");

  // Hard dependency override: if identity is unresolved, ONLY generate an identity-resolution question.
  if (identityVar.state === "UNKNOWN") {
    const template = questionTemplate("IDENTITY_COVERAGE", profile);
    const question_id = canonicalJsonSha256Hex({
      version: "opportunity_evidence_bootstrap_v1",
      opportunity_id: profile.opportunity_id,
      key: "IDENTITY_COVERAGE"
    }).slice(0, 16);

    return [
      {
        question_id,
        opportunity_id: profile.opportunity_id,
        variable: "IDENTITY_COVERAGE",
        research_subject_type: "OPPORTUNITY",
        research_subject_id: null,
        research_subject_name: profile.opportunity_name,
        research_subject_confidence: 0.3,
        question: template.q,
        why_it_matters: template.why,
        current_state: identityVar.state,
        expected_decision_impact: 95,
        expected_valuation_impact: 55,
        source_priority: sourcePriorityForVariable("IDENTITY_COVERAGE"),
        stopping_condition: template.stop,
        dependencies: [],
        effort_class: template.effort,
        priority_score: 100,
        priority_explanation: "dependency gate: identity unresolved => must resolve identity first"
      }
    ];
  }

  const subject = resolveOpportunitySubject({
    id: profile.opportunity_id,
    name: profile.opportunity_name,
    organization: profile.organization,
    opportunity_type: "brand_partnership",
    status: "identified",
    value_estimate: null,
    prestige_score: null,
    probability_score: null,
    owner_agent: "unknown",
    next_step: null,
    next_step_due_at: null,
    notes_md: null,
    source: null
  } as any);

  const vars = requiredVariables(profile.plausible_archetypes);

  // Hard dependency override: if a buyer-capable entity is required but POTENTIAL_BUYER is unresolved,
  // ask a buyer-resolution question before any buyer-intent/commercial/contact work.
  const buyerResolved = subject.potential_buyer.state === "KNOWN" || subject.potential_buyer.state === "PARTIAL";
  const buyerRequired = vars.some((k) => isBuyerDependentVariable(k));
  if (buyerRequired && !buyerResolved) {
    const template = questionTemplate("IDENTITY_COVERAGE", profile);
    const question_id = canonicalJsonSha256Hex({
      version: "opportunity_evidence_bootstrap_v1",
      opportunity_id: profile.opportunity_id,
      key: "POTENTIAL_BUYER_RESOLUTION"
    }).slice(0, 16);
    return [
      {
        question_id,
        opportunity_id: profile.opportunity_id,
        variable: "IDENTITY_COVERAGE",
        research_subject_type: "OPPORTUNITY",
        research_subject_id: null,
        research_subject_name: profile.opportunity_name,
        research_subject_confidence: 0.4,
        question: `Which organization would actually commission/pay for the opportunity "${profile.opportunity_name}" (buyer vs target vs rights-holder)?`,
        why_it_matters: "Buyer-intent and commercial research must target an entity capable of procurement; concept labels cannot buy.",
        current_state: "UNKNOWN",
        expected_decision_impact: 95,
        expected_valuation_impact: 70,
        source_priority: sourcePriorityForVariable("IDENTITY_COVERAGE"),
        stopping_condition: "Stop when the buyer entity is named and can be pinned (official domain or stable entity id).",
        dependencies: [],
        effort_class: "low",
        priority_score: 99,
        priority_explanation: "dependency gate: buyer unresolved => resolve buyer before BUYER_INTENT/COMMERCIAL/CONTACT"
      }
    ];
  }
  const questions: ResearchQuestion[] = [];

  for (const key of vars) {
    const v = findVar(profile, key);
    if (v.state === "KNOWN" || v.state === "NOT_APPLICABLE") continue;

    const template = questionTemplate(key, profile);
    const uncertainty = stateUncertainty(v.state);

    // Dependency gating (hard override):
    // If target organization is unresolved, org-dependent variables cannot be asked.
    // If buyer is unresolved, buyer-dependent variables cannot be asked.
    const targetResolved = subject.target_organization.state === "KNOWN" || subject.target_organization.state === "PARTIAL";
    const buyerResolved = subject.potential_buyer.state === "KNOWN" || subject.potential_buyer.state === "PARTIAL";
    if (isOrgDependentVariable(key) && !targetResolved) continue;
    if (isBuyerDependentVariable(key) && !buyerResolved) continue;

    // Simple deterministic impact priors by variable.
    const decisionImpact = key === "TRIGGER_CONTEXT" || key === "BUYER_INTENT" ? 95 : key === "ACCESS_CONTEXT" ? 85 : 70;
    const valuationImpact = key === "COMMERCIAL_CONTEXT" || key === "VALUATION_INPUTS" ? 95 : key === "TIMING_CONTEXT" ? 65 : 55;
    const rankingImpact = key === "BUYER_INTENT" || key === "COMMERCIAL_CONTEXT" ? 85 : 55;
    const resolvability = key === "IDENTITY_COVERAGE" ? 85 : key === "COMMERCIAL_CONTEXT" ? 50 : 65;
    const dependencyPriority = key === "IDENTITY_COVERAGE" ? 90 : 60;

    const score = priorityScoreV1({ decisionImpact, valuationImpact, rankingImpact, resolvability, dependencyPriority, uncertainty });
    const question_id = canonicalJsonSha256Hex({ version: "opportunity_evidence_bootstrap_v1", opportunity_id: profile.opportunity_id, key }).slice(
      0,
      16
    );

    questions.push({
      question_id,
      opportunity_id: profile.opportunity_id,
      variable: key,

      research_subject_type: "TARGET_ORGANIZATION",
      research_subject_id: subject.target_organization.entity_id,
      research_subject_name: subject.target_organization.name,
      research_subject_confidence: subject.target_organization.confidence,

      question: template.q,
      why_it_matters: template.why,
      current_state: v.state,
      expected_decision_impact: decisionImpact,
      expected_valuation_impact: valuationImpact,
      source_priority: sourcePriorityForVariable(key),
      stopping_condition: template.stop,
      dependencies: key === "IDENTITY_COVERAGE" ? [] : ["IDENTITY_COVERAGE"],
      effort_class: template.effort,
      priority_score: Math.round(score * 10) / 10,
      priority_explanation: `priority=${score.toFixed(1)} (decision=${decisionImpact}, valuation=${valuationImpact}, ranking=${rankingImpact}, resolvability=${resolvability}, dependency=${dependencyPriority}, uncertainty=${uncertainty})`
    });
  }

  questions.sort((a, b) => b.priority_score - a.priority_score || a.question_id.localeCompare(b.question_id));
  return questions;
}
