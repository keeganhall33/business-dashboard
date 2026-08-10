import type { ProgramSurfacePredicateV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";
import type { ProgramSurfaceQuestionTypeV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-research-contracts-v1";

export const PROGRAM_SURFACE_RESEARCH_POLICY_VERSION_V1 = "program_surface_research_v1.policy";

export function mapQuestionTypeToPredicateV1(q: ProgramSurfaceQuestionTypeV1): ProgramSurfacePredicateV1 {
  switch (q) {
    case "RQ_EVENT_FOOTPRINT":
      return "operates_event_program";
    case "RQ_PARTNERSHIP_ACTIVATION":
      return "runs_partner_activations";
    case "RQ_VIP_HOSPITALITY":
      return "offers_vip_hospitality";
    case "RQ_RELATIONSHIP_RECOGNITION":
      return "runs_relationship_recognition";
    case "RQ_PHYSICAL_ENVIRONMENT":
      return "operates_physical_environment";
    case "RQ_PHILANTHROPY_FUNDRAISING":
      return "runs_philanthropy_program";
    case "RQ_MERCHANDISING":
      return "operates_merchandising";
    case "RQ_LICENSING":
      return "operates_licensing";
    case "RQ_RETAIL_DISTRIBUTION":
      return "operates_retail_distribution";
    case "RQ_ART_CULTURE_DESIGN_PROGRAMS":
      return "runs_art_culture_design_program";
    case "RQ_COMMEMORATION_PROGRAM":
      return "runs_commemoration_program";
  }
}

export const DEFAULT_PROGRAM_SURFACE_QUESTION_BOUNDS_V1 = Object.freeze({
  // Deterministic per-question acquisition budget:
  // - 2 discovery queries max
  // - 5 results/query max
  // - 8 unique urls max
  // - 1 selected source max
  // - stop as soon as a HIGH-confidence supported candidate is produced
  max_queries: 2,
  max_results_per_query: 5,
  max_unique_urls: 8,
  max_selected_sources: 1,
  fetch_timeout_ms: 12_000,
  fetch_max_bytes: 700_000
});

