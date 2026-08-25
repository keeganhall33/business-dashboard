import type { CreativeExperimentOptionV1 } from "./contracts";

export const CREATIVE_MEDIUM_EXPERIMENT_FIXTURES_V1: CreativeExperimentOptionV1[] = [
  {
    experiment_id: "exp-graphite-only-refinement",
    medium_material: "Graphite-only refinement on archival cotton paper",
    scale: "SMALL_STUDY",
    learning_burden: "LOW",
    production_time_days_range: { min: 3, max: 5, truth_state: "KNOWN" },
    differentiation_hypothesis: "Sharpening value control and edge treatment may increase perceived museum-level authority without changing medium.",
    market_evidence: {
      summary: "Existing creative-direction fixture supports graphite as the core proof of rarity.",
      source: "creative-direction-v1 graphite flagship fixture",
      truth_state: "INFERRED",
      confidence: "HIGH"
    },
    institutional_fit: {
      summary: "Strong fit with works-on-paper and hyperreal craft authority.",
      truth_state: "INFERRED",
      confidence: "HIGH"
    },
    reversibility: "HIGH",
    evidence_truth_state: "INFERRED",
    success_signal: "A serious collector or curator can describe the refinement as more distinctive without needing color or object work.",
    capacity_required: "LOW",
    decision_notes: ["Protects the premium graphite base while creating a clean control for future material tests."]
  },
  {
    experiment_id: "exp-graphite-controlled-color-material",
    medium_material: "Graphite plus one controlled color or material intervention",
    scale: "CONTROL_PAIR",
    learning_burden: "MEDIUM",
    production_time_days_range: { min: 5, max: 8, truth_state: "INFERRED" },
    differentiation_hypothesis: "A restrained accent may become a signature without making color the hook.",
    market_evidence: {
      summary: "Painting and color demand is noted, but not direct proof that Keegan should shift mediums.",
      source: "creative-direction-v1 selective material color fixture",
      truth_state: "INFERRED",
      confidence: "MEDIUM"
    },
    institutional_fit: {
      summary: "Fit remains strong only if graphite stays dominant and the intervention reads as premium.",
      truth_state: "INFERRED",
      confidence: "MEDIUM"
    },
    reversibility: "HIGH",
    evidence_truth_state: "INFERRED",
    success_signal: "The accented work earns stronger serious response than a graphite-only control while viewers still cite graphite mastery first.",
    capacity_required: "MEDIUM",
    decision_notes: ["Market evidence and aesthetic hypothesis remain separate; color popularity cannot become a medium-shift conclusion."]
  },
  {
    experiment_id: "exp-small-dimensional-relief-study",
    medium_material: "Small dimensional graphite relief or shallow object study",
    scale: "DIMENSIONAL_STUDY",
    learning_burden: "HIGH",
    production_time_days_range: { min: null, max: null, truth_state: "UNKNOWN" },
    differentiation_hypothesis: "A physical relief could create object authority if it translates graphite realism rather than competing with it.",
    market_evidence: {
      summary: "Sculpture/object categories have durable market relevance, but direct Keegan-specific demand is UNKNOWN.",
      source: "creative-direction-v1 relief sculpture translation fixture",
      truth_state: "UNKNOWN",
      confidence: "UNKNOWN"
    },
    institutional_fit: {
      summary: "Potentially meaningful, but conservation, fabrication quality, and display fit are unproven.",
      truth_state: "UNKNOWN",
      confidence: "LOW"
    },
    reversibility: "MEDIUM",
    evidence_truth_state: "UNKNOWN",
    success_signal: "A maquette proves the graphite mechanism translates physically without lowering craft standard.",
    capacity_required: "HIGH",
    decision_notes: ["UNKNOWN production time and fabrication burden prevent this from outranking smaller reversible tests."]
  }
];
