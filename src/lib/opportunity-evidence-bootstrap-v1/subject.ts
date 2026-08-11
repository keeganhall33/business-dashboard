import type { OpportunityPipelineRow } from "@/lib/opportunity-discovery-v2/types";
import { normalizeIdentity } from "@/lib/opportunity-graph-linker-v1/normalize";

export type SubjectState = "KNOWN" | "PARTIAL" | "UNKNOWN" | "CONFLICTED";

export type ResolvedEntity = {
  name: string;
  entity_id: string | null;
  confidence: number; // 0..1
  state: SubjectState;
  rationale: string;
};

export type OpportunityNature =
  | "externally_evidenced"
  | "first_party_concept"
  | "known_project"
  | "unknown";

export type OpportunitySubjectModel = {
  opportunity_id: string;
  opportunity_label: string;
  nature: OpportunityNature;

  target_organization: ResolvedEntity;
  potential_buyer: ResolvedEntity;

  trigger_summary: string | null;
  trigger_state: SubjectState;
};

const conceptKeywords = [
  "capsule",
  "drop",
  "experience",
  "week",
  "heritage",
  "season",
  "anniversary",
  "50th",
  "private sales"
];

function looksLikeConceptLabel(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  if (v.includes("/")) return true;
  if (/\b\d{2,4}(th)?\b/.test(v)) return true;
  for (const k of conceptKeywords) if (v.includes(k)) return true;
  return false;
}

function hasExternalEvidenceSignal(pipeline: OpportunityPipelineRow) {
  const source = (pipeline.source ?? "").toLowerCase();
  const notes = (pipeline.notes_md ?? "").toLowerCase();
  // Conservative: treat an explicit URL reference as an external-evidence hint.
  return /https?:\/\//.test(source) || /https?:\/\//.test(notes);
}

export function resolveOpportunitySubject(pipeline: OpportunityPipelineRow): OpportunitySubjectModel {
  const orgRaw = pipeline.organization?.trim() ?? "";
  const nameRaw = pipeline.name?.trim() ?? "";

  const nature: OpportunityNature = hasExternalEvidenceSignal(pipeline) ? "externally_evidenced" : "first_party_concept";

  // TARGET_ORGANIZATION: only accept as PARTIAL when it looks like a real org label.
  // Do not assume opportunity.name == org; do not accept concept-like strings.
  let target_organization: ResolvedEntity;
  if (!orgRaw) {
    target_organization = {
      name: "UNKNOWN",
      entity_id: null,
      confidence: 0,
      state: "UNKNOWN",
      rationale: "No organization field on opportunity."
    };
  } else if (normalizeIdentity(orgRaw) === normalizeIdentity(nameRaw)) {
    target_organization = {
      name: "UNKNOWN",
      entity_id: null,
      confidence: 0.1,
      state: "UNKNOWN",
      rationale: "organization equals opportunity label; treated as concept, not a canonical org."
    };
  } else if (looksLikeConceptLabel(orgRaw)) {
    target_organization = {
      name: "UNKNOWN",
      entity_id: null,
      confidence: 0.2,
      state: "UNKNOWN",
      rationale: "organization looks like an opportunity/concept label (keyword/format)."
    };
  } else {
    target_organization = {
      name: orgRaw,
      entity_id: null,
      confidence: 0.55,
      state: "PARTIAL",
      rationale: "organization label looks like a canonical org name, but is not entity-resolved."
    };
  }

  // POTENTIAL_BUYER: we do not guess. If target org is unresolved, buyer is unresolved.
  // Even if target org is partial, buyer may differ (rights-holder, sponsor, department); keep UNKNOWN.
  const potential_buyer: ResolvedEntity = {
    name: "UNKNOWN",
    entity_id: null,
    confidence: 0,
    state: "UNKNOWN",
    rationale: "Buyer not explicitly modeled in opportunity_pipeline; must be resolved via research."
  };

  // TRIGGER: use first-party fields as PARTIAL only (not treated as external evidence).
  const trigger_summary = pipeline.source ?? pipeline.next_step ?? null;
  const trigger_state: SubjectState = trigger_summary ? "PARTIAL" : "UNKNOWN";

  return {
    opportunity_id: pipeline.id,
    opportunity_label: pipeline.name,
    nature,
    target_organization,
    potential_buyer,
    trigger_summary,
    trigger_state
  };
}

