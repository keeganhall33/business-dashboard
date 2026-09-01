import {
  SPORTS_ART_PARTNER_DASHBOARD_VERSION_V1,
  type SportsArtPartnerCompanyV1,
  type SportsArtPartnerDashboardV1,
  type SportsArtPartnerFilterV1,
  type SportsArtPartnerUniverseV1,
  type SportsArtRoleClassificationV1
} from "./contracts";

export const SPORTS_ART_PARTNER_FILTERS_V1: SportsArtPartnerFilterV1[] = [
  "PARTNER TARGET",
  "LICENSING TARGET",
  "DISTRIBUTION TARGET",
  "COLLECTIBLES TARGET",
  "ATHLETE ACCESS",
  "BENCHMARK",
  "COMPETITOR",
  "COLLABORATOR"
];

const rolePriority: SportsArtRoleClassificationV1[] = [
  "TRUE_STRATEGIC_PARTNER",
  "PARTNER_TARGET",
  "LICENSING_TARGET",
  "COLLECTIBLES_TARGET",
  "DISTRIBUTION_TARGET",
  "ATHLETE_ACCESS",
  "BENCHMARK",
  "COMPETITOR",
  "COLLABORATOR",
  "MARKET_COMPETITIVE_BENCHMARK"
];

const relationshipScore: Record<SportsArtPartnerCompanyV1["relationship_state"]["level"], number> = {
  STRONG: 5,
  WORKED_WITH: 4,
  COOLED: 3,
  LOWER_LEVEL_STALLED: 2,
  UNKNOWN: 1,
  NONE_EVIDENCED: 0
};

const levelScore: Record<"HIGH" | "MEDIUM" | "LOW" | "UNKNOWN", number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

function primaryRole(company: SportsArtPartnerCompanyV1): SportsArtRoleClassificationV1 {
  return [...company.role_classifications].sort((a, b) => rolePriority.indexOf(a) - rolePriority.indexOf(b))[0] ?? "BENCHMARK";
}

function rankingScore(company: SportsArtPartnerCompanyV1): number {
  const strategic = levelScore[company.strategic_fit_for_keegan.level] * 7;
  const licensing = levelScore[company.licensing_reproduction_rights_relevance.level] * 5;
  const athlete = levelScore[company.athlete_league_team_access_potential.level] * 4;
  const distribution = levelScore[company.distribution_potential.level] * 4;
  const collector = levelScore[company.collector_audience_overlap.level] * 3;
  const relationship = relationshipScore[company.relationship_state.level] * 3;
  const benchmarkPenalty = company.role_classifications.includes("BENCHMARK") && !company.role_classifications.includes("PARTNER_TARGET") ? -8 : 0;
  const concentrationPenalty = company.company_id === "fanatics" ? -3 : 0;
  return strategic + licensing + athlete + distribution + collector + relationship + benchmarkPenalty + concentrationPenalty;
}

export function toSportsArtPartnerDashboardV1(universe: SportsArtPartnerUniverseV1): SportsArtPartnerDashboardV1 {
  return {
    view_version: SPORTS_ART_PARTNER_DASHBOARD_VERSION_V1,
    universe_id: universe.universe_id,
    filters: SPORTS_ART_PARTNER_FILTERS_V1,
    rows: [...universe.companies]
      .sort((a, b) => rankingScore(b) - rankingScore(a) || a.company_id.localeCompare(b.company_id))
      .map((company) => ({
        company_id: company.company_id,
        company_name: company.company_name,
        primary_classification: primaryRole(company),
        filter_tags: [...company.filter_tags],
        relationship_strength: company.relationship_state.level,
        existing_access_path: company.known_contacts_or_access_paths.map((path) => `${path.name}: ${path.role_or_path}`).join("; "),
        strategic_upside: company.strategic_fit_for_keegan.level,
        licensing_power: company.licensing_reproduction_rights_relevance.level,
        distribution_reach: company.distribution_potential.level,
        athlete_league_access: company.athlete_league_team_access_potential.level,
        economic_attractiveness: company.prior_economics_or_compensation.truth_state,
        competitive_overlap: company.competitive_benchmark_relevance.level,
        current_opportunity: company.collaboration_concepts[0] ?? "UNKNOWN",
        next_action: company.next_safe_action,
        keegan_action_required: "NO"
      }))
  };
}
