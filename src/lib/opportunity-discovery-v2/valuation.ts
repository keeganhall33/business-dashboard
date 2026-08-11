import type { OpportunityArchetype, OpportunityPipelineRow, ValuationRange } from "./types";
import { clampScore, coerceNumber } from "./normalize";

type ValuationInputs = {
  archetype: OpportunityArchetype | null;
  pipeline: OpportunityPipelineRow | null;
  evidenceStrengthScore: number; // 0..100
  commercialScaleScore: number | null; // 0..100 or null
  prestigeScore: number | null; // 0..100 or null
};

function baseRangeForArchetype(archetype: OpportunityArchetype | null) {
  // These are intentionally coarse and conservative.
  // They represent "project value" (not lifetime customer value).
  switch (archetype) {
    case "LICENSING_MERCHANDISING":
      return { low: 15000, base: 60000, high: 250000, assumptions: ["Includes advance + bounded rights; excludes uncapped royalties."] };
    case "CULTURAL_INSTITUTIONAL":
      return { low: 30000, base: 90000, high: 300000, assumptions: ["Institutional commissions skew high-variance; install/framing excluded."] };
    case "HALL_OF_FAME_RECURRING_PROGRAM":
      return { low: 25000, base: 80000, high: 250000, assumptions: ["Assumes one season/induction cycle; repeatability not priced in."] };
    case "SPORTS_EVENT_ACTIVATION":
      return { low: 20000, base: 75000, high: 200000, assumptions: ["Assumes 1-2 hero originals + limited event usage rights."] };
    case "VIP_RELATIONSHIP_GIFTING":
      return { low: 12000, base: 40000, high: 120000, assumptions: ["Assumes 1 original + optional small set; minimal rights."] };
    case "CORPORATE_COLLECTION_WORKPLACE_ART":
      return { low: 25000, base: 85000, high: 250000, assumptions: ["Assumes 1-3 originals for workplace/display."] };
    case "HOSPITALITY_ART":
      return { low: 20000, base: 65000, high: 220000, assumptions: ["Assumes property commission with modest install needs."] };
    case "CORPORATE_MILESTONE_ART":
      return { low: 18000, base: 60000, high: 180000, assumptions: ["Assumes milestone piece + limited usage."] };
    case "CHARITY_TALENT_CAMPAIGN":
      return { low: 15000, base: 50000, high: 150000, assumptions: ["Assumes paid sponsor-backed campaign; not pure donation."] };
    default:
      return { low: 15000, base: 50000, high: 150000, assumptions: ["Generic premium commission range." ] };
  }
}

function applyScale(range: { low: number; base: number; high: number }, commercialScaleScore: number | null) {
  if (commercialScaleScore == null) return { ...range, drivers: ["Commercial scale unknown; kept archetype baseline." ] };
  const s = clampScore(commercialScaleScore);
  // Map 0..100 -> 0.75..1.6 multiplier.
  const mult = 0.75 + (s / 100) * 0.85;
  return {
    low: Math.round(range.low * mult),
    base: Math.round(range.base * mult),
    high: Math.round(range.high * mult),
    drivers: [`Commercial scale adjustment (score ${s.toFixed(0)}) ×${mult.toFixed(2)}.`]
  };
}

function applyPrestige(high: number, prestigeScore: number | null) {
  if (prestigeScore == null) return { high, driver: null as string | null };
  const p = clampScore(prestigeScore);
  const boost = 1 + (p / 100) * 0.35;
  return { high: Math.round(high * boost), driver: `Prestige-adjusted high case ×${boost.toFixed(2)}.` };
}

function confidenceFromEvidence(evidenceStrengthScore: number, pipeline: OpportunityPipelineRow | null) {
  let conf = 0.25 + 0.55 * (clampScore(evidenceStrengthScore) / 100);
  // If pipeline has both value_estimate and probability_score, we are less blind.
  const hasValue = typeof pipeline?.value_estimate === "number" && Number.isFinite(pipeline.value_estimate);
  const hasProb = coerceNumber(pipeline?.probability_score) != null;
  if (hasValue && hasProb) conf += 0.08;
  return Math.max(0.05, Math.min(0.9, conf));
}

export function buildPreliminaryValuation(inputs: ValuationInputs): ValuationRange {
  const base = baseRangeForArchetype(inputs.archetype);
  const scaled = applyScale({ low: base.low, base: base.base, high: base.high }, inputs.commercialScaleScore);
  const prestigeAdj = applyPrestige(scaled.high, inputs.prestigeScore);

  const confidence = confidenceFromEvidence(inputs.evidenceStrengthScore, inputs.pipeline);

  const missingFacts: string[] = [];
  if (inputs.pipeline?.value_estimate == null) missingFacts.push("Budget evidence (comparable commissions, sponsor budget, or rights/usage budget)");
  missingFacts.push("Scope: # of originals, sizes, and delivery timeline");
  missingFacts.push("Usage rights: channels, term, geography, category exclusivity");
  if (inputs.archetype === "LICENSING_MERCHANDISING") missingFacts.push("Royalty structure and minimum guarantee (if any)");

  const assumptions: string[] = [...base.assumptions];
  assumptions.push("Excludes framing, shipping, and installation unless explicitly scoped.");

  const drivers = [
    `Archetype baseline: ${inputs.archetype ?? "unknown"}`,
    ...(scaled.drivers ?? []),
    ...(prestigeAdj.driver ? [prestigeAdj.driver] : [])
  ];

  return {
    low: scaled.low,
    base: scaled.base,
    high: prestigeAdj.high,
    currency: "USD",
    confidence,
    drivers,
    assumptions,
    missingFacts
  };
}

