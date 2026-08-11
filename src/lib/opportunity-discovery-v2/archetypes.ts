import type { OpportunityArchetype, OpportunityPipelineRow, OpportunitySeed } from "./types";

function textHaystack(seed: OpportunitySeed, pipeline?: OpportunityPipelineRow | null) {
  return [
    seed.name,
    seed.organization ?? "",
    seed.sourceSummary ?? "",
    pipeline?.opportunity_type ?? "",
    pipeline?.notes_md ?? "",
    pipeline?.next_step ?? ""
  ]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

export function inferArchetypes(seed: OpportunitySeed, pipeline?: OpportunityPipelineRow | null): OpportunityArchetype[] {
  const hay = textHaystack(seed, pipeline);
  const set = new Set<OpportunityArchetype>();

  // First: map dashboard opportunity_type (coarse).
  const type = (pipeline?.opportunity_type ?? "").toLowerCase();
  if (type.includes("licensing")) set.add("LICENSING_MERCHANDISING");
  if (type.includes("institution")) set.add("CULTURAL_INSTITUTIONAL");
  if (type.includes("brand")) set.add("SPORTS_EVENT_ACTIVATION");
  if (type.includes("athlete")) set.add("VIP_RELATIONSHIP_GIFTING");
  if (type.includes("collector")) set.add("VIP_RELATIONSHIP_GIFTING");
  if (type.includes("press")) set.add("CULTURAL_INSTITUTIONAL");

  // Second: keyword-based refinement.
  if (/(f1|formula\s*1|grand prix|paddock|pit lane)/.test(hay)) set.add("SPORTS_EVENT_ACTIVATION");
  if (/(hall of fame|induction|all-?star|season opener|finals|tournament)/.test(hay)) set.add("HALL_OF_FAME_RECURRING_PROGRAM");
  if (/(charity|foundation|benefit|gala|auction)/.test(hay)) set.add("CHARITY_TALENT_CAMPAIGN");
  if (/(hotel|resort|hospitality|suite|club|property|lobby)/.test(hay)) set.add("HOSPITALITY_ART");
  if (/(headquarters|hq|workplace|campus|office|collection)/.test(hay)) set.add("CORPORATE_COLLECTION_WORKPLACE_ART");
  if (/(anniversary|milestone|launch|opening|inaugural)/.test(hay)) set.add("CORPORATE_MILESTONE_ART");
  if (/(gift|vip|client|relationship|founder|chairman|ceo)/.test(hay)) set.add("VIP_RELATIONSHIP_GIFTING");
  if (/(edition|capsule|drop|merch|collectible|trading card|topps|upper deck)/.test(hay)) set.add("LICENSING_MERCHANDISING");
  if (/(museum|sotheby|christie|institution)/.test(hay)) set.add("CULTURAL_INSTITUTIONAL");

  const list = Array.from(set);
  // Stable ordering for determinism.
  const order: OpportunityArchetype[] = [
    "SPORTS_EVENT_ACTIVATION",
    "LICENSING_MERCHANDISING",
    "CULTURAL_INSTITUTIONAL",
    "HALL_OF_FAME_RECURRING_PROGRAM",
    "VIP_RELATIONSHIP_GIFTING",
    "CORPORATE_MILESTONE_ART",
    "CORPORATE_COLLECTION_WORKPLACE_ART",
    "HOSPITALITY_ART",
    "CHARITY_TALENT_CAMPAIGN",
    "CORPORATE_GIFTING_RELATIONSHIP_ART",
    "RETAIL_DISTRIBUTION"
  ];
  list.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return list.length ? list : ["VIP_RELATIONSHIP_GIFTING"]; // conservative default
}

export function pickBestArchetype(archetypes: OpportunityArchetype[], pipeline?: OpportunityPipelineRow | null) {
  // If the pipeline explicitly says licensing, prefer that.
  const type = (pipeline?.opportunity_type ?? "").toLowerCase();
  if (type.includes("licensing") && archetypes.includes("LICENSING_MERCHANDISING")) {
    return "LICENSING_MERCHANDISING" as const;
  }
  return archetypes[0] ?? null;
}

