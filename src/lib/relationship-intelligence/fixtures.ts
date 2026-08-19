import {
  RELATIONSHIP_INTELLIGENCE_VERSION_V1,
  orderChampionCandidatesV1,
  type ChampionCandidateV1,
  type RelationshipOpportunityBriefV1
} from "./contracts";

const RUBIN_CANDIDATES: ChampionCandidateV1[] = [
  {
    candidate_id: "fanatics-michael-rubin",
    name: "Michael Rubin",
    role_or_public_context: "Publicly known Fanatics CEO and executive decision-maker.",
    candidate_kind: "DECISION_MAKER",
    title_authority_signal: "HIGH",
    relationship_edge_state: "UNKNOWN",
    evidence_quality: "MEDIUM",
    strategic_fit_signal: "HIGH",
    mutual_value_signal: "MEDIUM",
    access_path_signal: "LOW",
    confidence: "possible",
    why_candidate: "He is relevant to the strategic target by public role, but no private relationship edge is asserted.",
    evidence_refs: ["fanatics-public-role", "sports-art-strategic-fit"],
    unknowns: ["UNKNOWN whether there is a warm path to Rubin.", "UNKNOWN whether Fanatics would value fine-art collaboration."]
  },
  {
    candidate_id: "fanatics-unknown-brand-partnerships-lead",
    name: "UNKNOWN Fanatics brand partnerships lead",
    role_or_public_context: "Potential function-level champion; specific person is not identified in supplied fixture context.",
    candidate_kind: "INTERNAL_CHAMPION",
    title_authority_signal: "UNKNOWN",
    relationship_edge_state: "UNKNOWN",
    evidence_quality: "UNKNOWN",
    strategic_fit_signal: "MEDIUM",
    mutual_value_signal: "UNKNOWN",
    access_path_signal: "UNKNOWN",
    confidence: "insufficient_evidence",
    why_candidate: "A partnership function may be more reachable than the CEO, but the identity and relationship edge are unknown.",
    evidence_refs: ["fanatics-unknown-gap"],
    unknowns: ["UNKNOWN person.", "UNKNOWN authority.", "UNKNOWN access path."]
  }
];

const BOARDROOM_CANDIDATES: ChampionCandidateV1[] = [
  {
    candidate_id: "boardroom-rich-kleiman",
    name: "Rich Kleiman",
    role_or_public_context: "Publicly known Boardroom co-founder and sports/media executive.",
    candidate_kind: "DECISION_MAKER",
    title_authority_signal: "HIGH",
    relationship_edge_state: "UNKNOWN",
    evidence_quality: "MEDIUM",
    strategic_fit_signal: "HIGH",
    mutual_value_signal: "MEDIUM",
    access_path_signal: "LOW",
    confidence: "possible",
    why_candidate: "Boardroom's public sports/media context fits the target, but no private access or endorsement is asserted.",
    evidence_refs: ["boardroom-public-role", "sports-culture-media-fit"],
    unknowns: ["UNKNOWN whether Keegan has a warm route to Kleiman.", "UNKNOWN whether Boardroom wants a fine-art story."]
  },
  {
    candidate_id: "boardroom-editorial-champion-unknown",
    name: "UNKNOWN Boardroom editorial or partnerships champion",
    role_or_public_context: "Possible bridge inside content or partnerships; identity unsupported by fixture evidence.",
    candidate_kind: "BRIDGE",
    title_authority_signal: "UNKNOWN",
    relationship_edge_state: "UNKNOWN",
    evidence_quality: "UNKNOWN",
    strategic_fit_signal: "MEDIUM",
    mutual_value_signal: "UNKNOWN",
    access_path_signal: "UNKNOWN",
    confidence: "insufficient_evidence",
    why_candidate: "A content or partnerships bridge may be more plausible than direct founder access, but the edge is unsupported.",
    evidence_refs: ["boardroom-unknown-gap"],
    unknowns: ["UNKNOWN person.", "UNKNOWN relationship edge.", "UNKNOWN editorial appetite."]
  }
];

export const RELATIONSHIP_INTELLIGENCE_FIXTURES_V1 = ([
  {
    contract_version: RELATIONSHIP_INTELLIGENCE_VERSION_V1,
    brief_id: "relationship-fanatics-rubin-v1",
    generated_at: "2026-08-19T20:30:00.000Z",
    source_mode: "DETERMINISTIC_FIXTURE",
    TARGET: {
      target_id: "fanatics",
      label: "Fanatics sports-commerce collaboration surface",
      strategic_target_type: "COMPANY",
      why_it_matters: "Fanatics is relevant to sports culture and commerce, but fixture evidence does not imply access."
    },
    DECISION_MAKER: {
      name: "Michael Rubin",
      role_or_public_context: "Publicly known Fanatics CEO.",
      evidence_refs: ["fanatics-public-role"],
      truth_state: "KNOWN"
    },
    CHAMPION_CANDIDATES: orderChampionCandidatesV1(RUBIN_CANDIDATES),
    RELATIONSHIP_EVIDENCE: [
      { ref_id: "fanatics-public-role", label: "Public executive role", source: "public_fixture", truth_state: "KNOWN", quality: "MEDIUM", notes: "Public role supports relevance, not relationship access." },
      { ref_id: "sports-art-strategic-fit", label: "Sports-art strategic fit", source: "strategy_fixture", truth_state: "INFERRED", quality: "MEDIUM", notes: "Premium sports artwork may fit, but value to Fanatics is unproven." },
      { ref_id: "fanatics-unknown-gap", label: "Unknown access path", source: "manual_fixture", truth_state: "UNKNOWN", quality: "UNKNOWN", notes: "No private contact or warm intro is asserted." }
    ],
    ACCESS_PATH: { summary: "UNKNOWN warm path; safe next step is internal research and value framing only.", truth_state: "UNKNOWN", evidence_refs: ["fanatics-unknown-gap"] },
    STRATEGIC_UPSIDE: { summary: "Potential sports-commerce visibility and legitimacy if a premium-safe collaboration exists.", confidence: "possible", qualitative_only: true },
    MUTUAL_VALUE: { summary: "Possible cultural storytelling value; reciprocity is not yet evidenced.", evidence_refs: ["sports-art-strategic-fit"], reciprocity_strength: "MEDIUM" },
    RELATIONSHIP_RISK: {
      level: "MEDIUM",
      over_asking_guardrail: "Do not ask for CEO attention or partnership terms before a specific mutual-value brief exists.",
      weak_reciprocity_guardrail: "Do not pitch unless the benefit to Fanatics is concrete and premium-safe."
    },
    TIMING: { state: "WATCH", rationale: "Prepare only; access and mutual value remain unknown." },
    UNKNOWN_GAPS: ["Warm route to decision-maker", "Specific champion identity below CEO", "Whether a fine-art collaboration is strategically useful to Fanatics"],
    NEXT_SAFE_ACTION: {
      action: "Draft a private internal-only opportunity brief that tests mutual value and lists missing evidence.",
      rationale: "This creates decision support without outreach or public claims.",
      external_write_allowed: false
    },
    APPROVAL_CLASS: "L1_RECOMMENDATION",
    WHAT_WOULD_CHANGE_THE_RANKING: ["Verified warm intro", "Identified partnerships champion with authority", "Evidence Fanatics is seeking premium sports-culture storytelling"]
  },
  {
    contract_version: RELATIONSHIP_INTELLIGENCE_VERSION_V1,
    brief_id: "relationship-boardroom-kleiman-v1",
    generated_at: "2026-08-19T20:30:00.000Z",
    source_mode: "DETERMINISTIC_FIXTURE",
    TARGET: {
      target_id: "boardroom",
      label: "Boardroom sports-culture media opportunity",
      strategic_target_type: "MEDIA_PLATFORM",
      why_it_matters: "Boardroom is relevant to sports culture storytelling, but fixture evidence does not imply access."
    },
    DECISION_MAKER: {
      name: "Rich Kleiman",
      role_or_public_context: "Publicly known Boardroom co-founder.",
      evidence_refs: ["boardroom-public-role"],
      truth_state: "KNOWN"
    },
    CHAMPION_CANDIDATES: orderChampionCandidatesV1(BOARDROOM_CANDIDATES),
    RELATIONSHIP_EVIDENCE: [
      { ref_id: "boardroom-public-role", label: "Public founder role", source: "public_fixture", truth_state: "KNOWN", quality: "MEDIUM", notes: "Public role supports relevance, not relationship access." },
      { ref_id: "sports-culture-media-fit", label: "Sports-culture media fit", source: "strategy_fixture", truth_state: "INFERRED", quality: "MEDIUM", notes: "A story angle may fit, but editorial appetite is unknown." },
      { ref_id: "boardroom-unknown-gap", label: "Unknown bridge", source: "manual_fixture", truth_state: "UNKNOWN", quality: "UNKNOWN", notes: "No private contact, endorsement, or editorial relationship is asserted." }
    ],
    ACCESS_PATH: { summary: "UNKNOWN warm path; safest work is a private story-fit brief, not outreach.", truth_state: "UNKNOWN", evidence_refs: ["boardroom-unknown-gap"] },
    STRATEGIC_UPSIDE: { summary: "Potential authority through sports-culture storytelling if the narrative is editorially useful.", confidence: "possible", qualitative_only: true },
    MUTUAL_VALUE: { summary: "Possible differentiated art/story asset; mutual value remains inferred, not proven.", evidence_refs: ["sports-culture-media-fit"], reciprocity_strength: "MEDIUM" },
    RELATIONSHIP_RISK: {
      level: "MEDIUM",
      over_asking_guardrail: "Do not ask for founder attention before proving the story angle is useful.",
      weak_reciprocity_guardrail: "Do not pitch a self-promotional feature without clear editorial value."
    },
    TIMING: { state: "WATCH", rationale: "Narrative fit can be prepared, but access remains unknown." },
    UNKNOWN_GAPS: ["Warm route to Kleiman or Boardroom team", "Specific editorial/partnership owner", "Whether Boardroom wants this story now"],
    NEXT_SAFE_ACTION: {
      action: "Draft a private internal-only Boardroom story-fit brief with unknowns and approval gate.",
      rationale: "It prepares the relationship path without external write or implied endorsement.",
      external_write_allowed: false
    },
    APPROVAL_CLASS: "L1_RECOMMENDATION",
    WHAT_WOULD_CHANGE_THE_RANKING: ["Verified editorial champion", "Evidence of current Boardroom interest in premium athlete art stories", "Warm path through a known public bridge"]
  }
] satisfies RelationshipOpportunityBriefV1[]).sort((a, b) => a.brief_id.localeCompare(b.brief_id));
