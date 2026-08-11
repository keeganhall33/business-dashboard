import type { CollectorRelationshipRow, OpportunityCandidateV2, OpportunityPipelineRow, ScoredFactor } from "./types";
import { clampScore, coerceNumber } from "./normalize";

type FactorInputs = {
  seedName: string;
  organization: string | null;
  pipeline: OpportunityPipelineRow | null;
  relationship: CollectorRelationshipRow | null;
  archetype: OpportunityCandidateV2["bestArchetype"];
};

const WEIGHTS: Record<ScoredFactor["id"], number> = {
  PROJECT_MODEL_FIT: 0.14,
  COMMERCIAL_SCALE: 0.18,
  ACCESS: 0.12,
  TIMING: 0.08,
  PRESTIGE: 0.12,
  REPEATABILITY: 0.08,
  DIFFERENTIATION: 0.06,
  EVIDENCE_STRENGTH: 0.08,
  BUYER_INTENT_SIGNAL: 0.08,
  STRATEGIC_UPSIDE: 0.04,
  EXECUTION_FIT: 0.02
};

const UNKNOWN_PRIOR = 50;

function knownFactor(id: ScoredFactor["id"], value: number, notes: string[]): ScoredFactor {
  return { id, value: clampScore(value), assumedWhenUnknown: UNKNOWN_PRIOR, weight: WEIGHTS[id], known: true, notes };
}

function unknownFactor(id: ScoredFactor["id"], notes: string[]): ScoredFactor {
  return { id, value: null, assumedWhenUnknown: UNKNOWN_PRIOR, weight: WEIGHTS[id], known: false, notes };
}

function scoreCommercialScale(pipeline: OpportunityPipelineRow | null): ScoredFactor {
  const estimate = pipeline?.value_estimate;
  if (typeof estimate !== "number" || !Number.isFinite(estimate) || estimate <= 0) {
    return unknownFactor("COMMERCIAL_SCALE", ["No value_estimate signal available."]);
  }
  // Compress big numbers; 10k -> ~30, 50k -> ~55, 150k -> ~75, 500k -> ~92
  const score = 20 + 20 * Math.log10(Math.max(1, estimate / 5000));
  return knownFactor("COMMERCIAL_SCALE", score, [`value_estimate signal: $${Math.round(estimate).toLocaleString()}`]);
}

function scorePrestige(pipeline: OpportunityPipelineRow | null): ScoredFactor {
  const raw = coerceNumber(pipeline?.prestige_score);
  if (raw == null) return unknownFactor("PRESTIGE", ["No prestige_score provided."]);
  return knownFactor("PRESTIGE", raw, ["prestige_score from pipeline row."]);
}

function scoreBuyerIntent(pipeline: OpportunityPipelineRow | null): ScoredFactor {
  const raw = coerceNumber(pipeline?.probability_score);
  if (raw == null) return unknownFactor("BUYER_INTENT_SIGNAL", ["No probability_score provided."]);
  // probability_score is not literally intent, but it is the best available proxy in v1 data.
  return knownFactor("BUYER_INTENT_SIGNAL", raw, ["probability_score used as a buyer-intent proxy (signal, not truth)."]);
}

function scoreTiming(pipeline: OpportunityPipelineRow | null): ScoredFactor {
  const due = pipeline?.next_step_due_at;
  if (!due) return unknownFactor("TIMING", ["No next_step_due_at."]);
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return unknownFactor("TIMING", ["Invalid next_step_due_at timestamp."]);
  const diffDays = (date.getTime() - Date.now()) / 86400000;
  // Overdue -> high urgency; far future -> lower urgency.
  const score = diffDays <= 0 ? 80 : diffDays <= 7 ? 70 : diffDays <= 30 ? 55 : 40;
  return knownFactor("TIMING", score, [`Next step due in ~${Math.round(diffDays)} day(s).`]);
}

function scoreAccess(relationship: CollectorRelationshipRow | null, pipeline: OpportunityPipelineRow | null): ScoredFactor {
  if (relationship) {
    const tier = String(relationship.tier ?? "").toUpperCase();
    const base = tier === "A" ? 85 : tier === "B" ? 70 : tier === "C" ? 55 : 45;
    return knownFactor("ACCESS", base, [`Matched collector relationship tier ${tier} (proxy for warm access).`]);
  }
  // If the pipeline source explicitly says "inbound" or "warm", treat as partial signal.
  const source = (pipeline?.source ?? "").toLowerCase();
  if (source.includes("warm") || source.includes("intro") || source.includes("inbound")) {
    return knownFactor("ACCESS", 60, [`Pipeline source hints warm access: ${pipeline?.source ?? ""}`]);
  }
  return unknownFactor("ACCESS", ["No relationship match or source hint."]);
}

function scoreEvidenceStrength(pipeline: OpportunityPipelineRow | null): ScoredFactor {
  const signals: string[] = [];
  let score = 20;
  if (pipeline?.source) {
    score += 20;
    signals.push("Has source field.");
  }
  const notes = pipeline?.notes_md?.trim();
  if (notes) {
    score += Math.min(25, 5 + Math.floor(notes.length / 200) * 5);
    signals.push("Has notes_md.");
    if (/(https?:\/\/)/i.test(notes)) {
      score += 15;
      signals.push("Notes include URL evidence.");
    }
  }
  if (pipeline?.next_step) {
    score += 10;
    signals.push("Has next_step.");
  }
  return knownFactor("EVIDENCE_STRENGTH", score, signals.length ? signals : ["No evidence signals."]);
}

function scoreProjectModelFit(archetype: OpportunityCandidateV2["bestArchetype"]): ScoredFactor {
  if (!archetype) return unknownFactor("PROJECT_MODEL_FIT", ["No archetype inferred."]);
  // Deterministic prior: some archetypes are inherently more native to Keegan's current premium posture.
  const score =
    archetype === "CULTURAL_INSTITUTIONAL"
      ? 85
      : archetype === "SPORTS_EVENT_ACTIVATION"
        ? 80
        : archetype === "LICENSING_MERCHANDISING"
          ? 70
          : archetype === "HALL_OF_FAME_RECURRING_PROGRAM"
            ? 78
            : archetype === "VIP_RELATIONSHIP_GIFTING"
              ? 72
              : 60;
  return knownFactor("PROJECT_MODEL_FIT", score, [`Inferred best archetype: ${archetype}`]);
}

function scoreRepeatability(archetype: OpportunityCandidateV2["bestArchetype"]): ScoredFactor {
  if (!archetype) return unknownFactor("REPEATABILITY", ["No archetype."]);
  const score =
    archetype === "HALL_OF_FAME_RECURRING_PROGRAM"
      ? 90
      : archetype === "LICENSING_MERCHANDISING"
        ? 85
        : archetype === "SPORTS_EVENT_ACTIVATION"
          ? 70
          : archetype === "CULTURAL_INSTITUTIONAL"
            ? 65
            : 55;
  return knownFactor("REPEATABILITY", score, ["Archetype-based repeatability prior."]);
}

function scoreDifferentiation(archetype: OpportunityCandidateV2["bestArchetype"]): ScoredFactor {
  if (!archetype) return unknownFactor("DIFFERENTIATION", ["No archetype."]);
  const score = archetype === "CULTURAL_INSTITUTIONAL" || archetype === "VIP_RELATIONSHIP_GIFTING" ? 80 : 70;
  return knownFactor("DIFFERENTIATION", score, ["High-craft graphite originals are naturally differentiated."]);
}

function scoreStrategicUpside(inputs: FactorInputs): ScoredFactor {
  // Keep this conservative: it should not be a magic booster.
  const prestige = coerceNumber(inputs.pipeline?.prestige_score);
  const rep = inputs.archetype === "HALL_OF_FAME_RECURRING_PROGRAM" || inputs.archetype === "LICENSING_MERCHANDISING";
  if (prestige == null && !rep) return unknownFactor("STRATEGIC_UPSIDE", ["No prestige signal and archetype not obviously compounding."]);

  const base = prestige == null ? 55 : 40 + 0.5 * clampScore(prestige);
  const score = rep ? Math.min(95, base + 15) : base;
  return knownFactor("STRATEGIC_UPSIDE", score, ["Derived from prestige signal + repeatable archetype boost (if applicable)."]);
}

function scoreExecutionFit(inputs: FactorInputs): ScoredFactor {
  // Execution fit is about feasibility under Keegan's time-intensive production.
  // Default: moderate; penalize if this looks like a huge multi-asset campaign.
  const hay = `${inputs.seedName}\n${inputs.pipeline?.notes_md ?? ""}`.toLowerCase();
  if (/(30 assets|weekly content|always-on|full campaign|deliverables)/.test(hay)) {
    return knownFactor("EXECUTION_FIT", 35, ["Notes imply a heavy deliverables/campaign load."]);
  }
  if (inputs.archetype === "LICENSING_MERCHANDISING") {
    return knownFactor("EXECUTION_FIT", 60, ["Licensing can be execution-efficient if rights are bounded."]);
  }
  return knownFactor("EXECUTION_FIT", 65, ["No explicit execution blockers found in current snapshot."]);
}

export function scoreOpportunityFactors(inputs: FactorInputs): {
  factors: ScoredFactor[];
  overallScore: number;
  scoreNotes: string[];
  biggestUncertainty: string;
} {
  const factors: ScoredFactor[] = [
    scoreProjectModelFit(inputs.archetype),
    scoreCommercialScale(inputs.pipeline),
    scoreAccess(inputs.relationship, inputs.pipeline),
    scoreTiming(inputs.pipeline),
    scorePrestige(inputs.pipeline),
    scoreRepeatability(inputs.archetype),
    scoreDifferentiation(inputs.archetype),
    scoreEvidenceStrength(inputs.pipeline),
    scoreBuyerIntent(inputs.pipeline),
    scoreStrategicUpside(inputs),
    scoreExecutionFit(inputs)
  ];

  let weighted = 0;
  let weightTotal = 0;
  let unknownWeight = 0;
  const unknowns: string[] = [];
  for (const factor of factors) {
    const v = factor.known ? (factor.value ?? factor.assumedWhenUnknown) : factor.assumedWhenUnknown;
    weighted += v * factor.weight;
    weightTotal += factor.weight;
    if (!factor.known) {
      unknownWeight += factor.weight;
      unknowns.push(factor.id);
    }
  }

  const expected = weightTotal > 0 ? weighted / weightTotal : 0;
  // Explicit unknown handling: do not treat unknown as 0; instead apply a penalty proportional to unknown share.
  const unknownPenalty = 12 * (unknownWeight / Math.max(0.001, weightTotal));
  const overallScore = clampScore(expected - unknownPenalty);

  const biggestUncertainty =
    unknowns.includes("COMMERCIAL_SCALE")
      ? "Commercial scale (no budget/value evidence yet)"
      : unknowns.includes("ACCESS")
        ? "Access path (warm intro vs cold)"
        : unknowns.includes("BUYER_INTENT_SIGNAL")
          ? "Buyer intent (no procurement/commission signal yet)"
          : unknowns.length
            ? `Missing signals: ${unknowns.slice(0, 3).join(", ")}`
            : "None";

  const scoreNotes = [
    `Expected score ${expected.toFixed(1)}; unknown penalty ${unknownPenalty.toFixed(1)} (unknown weight ${(unknownWeight * 100).toFixed(0)}%).`,
    ...(unknowns.length ? [`Unknown factors: ${unknowns.join(", ")}`] : [])
  ];

  return { factors, overallScore, scoreNotes, biggestUncertainty };
}

