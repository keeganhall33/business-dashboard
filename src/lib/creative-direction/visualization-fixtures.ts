import type { CreativeEvidenceV1, CreativeRecommendationVersionV1 } from "./dashboard-refresh-fixtures";

export type CreativeVisualizationStatusV1 = "REQUESTED" | "PROMPT_READY" | "MOCK_STUDY_READY" | "PINNED" | "REJECTED";
export type CreativeConceptFeedbackV1 = "UNREVIEWED" | "PINNED" | "FAVORITED" | "REJECTED" | "MORE_LIKE_THIS" | "LESS_LIKE_THIS";

export type CreativeVisualizationConceptV1 = {
  CONCEPT_ID: string;
  PARENT_RECOMMENDATION_VERSION: number;
  STRATEGIC_HYPOTHESIS: string;
  VISUALIZATION_STATUS: CreativeVisualizationStatusV1;
  MEDIUM: string;
  MATERIALS: string[];
  "DIMENSIONS/ASPECT": string;
  COMPOSITION_SPEC: string;
  SUBJECT_SPEC: string;
  PALETTE_SPEC: string;
  LIGHTING_SPEC: string;
  "DETAIL/EDGE_SPEC": string;
  NEGATIVE_SPACE_SPEC: string;
  TRANSFORMATION_MECHANISM: string;
  "PHYSICAL_DEPTH/RELIEF_SPEC": string;
  DISPLAY_CONTEXT: string;
  GENERATION_PROMPT_SPEC: string;
  CONTROLLED_VARIABLES: string[];
  MARKET_EVIDENCE_REFERENCES: string[];
  CREATIVE_RATIONALE: string;
  DIFFERENTIATION_RATIONALE: string;
  SHORT_PATH_RATIONALE: string;
  RISKS: string[];
  WHAT_THIS_VISUAL_DOES_NOT_PROVE: string[];
  KEEGAN_FEEDBACK: {
    state: CreativeConceptFeedbackV1;
    voice_note: string | null;
    text_note: string | null;
    human_reported_context_only: true;
  };
  NEXT_ITERATION: string;
  LINEAGE: {
    request_id: string;
    parent_concept_id: string | null;
    version: number;
    changed_from_parent: string[];
  };
};

export type CreativeVisualizationRequestV1 = {
  REQUEST_ID: string;
  PARENT_RECOMMENDATION_VERSION: number;
  SELECTED_DIRECTION_STAGE: CreativeRecommendationVersionV1["stage"];
  ACTION_LABEL: "VISUALIZE THIS RECOMMENDATION";
  visualization_goal: string;
  status: CreativeVisualizationStatusV1;
  evidence_guardrail: "GENERATED_CONCEPT_IS_NOT_MARKET_EVIDENCE";
  confidence_policy: "DO_NOT_INCREASE_RECOMMENDATION_CONFIDENCE_FROM_VISUAL_APPEAL";
  concepts: CreativeVisualizationConceptV1[];
};

export type CreativeConceptComparisonV1 = {
  request_id: string;
  pinned_concept_ids: string[];
  rejected_concept_ids: string[];
  isolate_variable_options: string[];
  next_regeneration_request: {
    concept_id: string;
    instruction: string;
    isolate_variable: string;
  };
};

const evidenceIds = ["ev-first-party-collector-graphite", "ev-institutional-drawing-validation"];

export function buildGenerationPromptSpec(input: {
  medium: string;
  materials: string[];
  composition: string;
  subject: string;
  palette: string;
  lighting: string;
  transformation: string;
  display: string;
}): string {
  return [
    `medium=${input.medium}`,
    `materials=${input.materials.join(" + ")}`,
    `composition=${input.composition}`,
    `subject=${input.subject}`,
    `palette=${input.palette}`,
    `lighting=${input.lighting}`,
    `transformation=${input.transformation}`,
    `display=${input.display}`,
    "guardrail=concept study only; not market evidence; preserve physical authorship"
  ].join(" | ");
}

export const CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1: CreativeVisualizationRequestV1 = {
  REQUEST_ID: "viz-req-rec2-selective-surreal-001",
  PARENT_RECOMMENDATION_VERSION: 2,
  SELECTED_DIRECTION_STAGE: "DEVELOP_NEXT",
  ACTION_LABEL: "VISUALIZE THIS RECOMMENDATION",
  visualization_goal: "Compare controlled visual studies for a graphite-led sports-culture original with restrained selective-color and surreal transformation.",
  status: "MOCK_STUDY_READY",
  evidence_guardrail: "GENERATED_CONCEPT_IS_NOT_MARKET_EVIDENCE",
  confidence_policy: "DO_NOT_INCREASE_RECOMMENDATION_CONFIDENCE_FROM_VISUAL_APPEAL",
  concepts: [
    {
      CONCEPT_ID: "concept-graphite-threshold-red-001",
      PARENT_RECOMMENDATION_VERSION: 2,
      STRATEGIC_HYPOTHESIS: "Selective color can add contemporary visual tension without diluting graphite mastery.",
      VISUALIZATION_STATUS: "PINNED",
      MEDIUM: "Graphite with restrained selective-color intervention",
      MATERIALS: ["archival graphite", "cold-press paper", "transparent red glaze study"],
      "DIMENSIONS/ASPECT": "42 x 60 in horizontal",
      COMPOSITION_SPEC: "Tight cinematic athlete crop crossing a fractured threshold plane from left to right.",
      SUBJECT_SPEC: "Iconic sports figure rendered as a culturally durable archetype, not a literal licensed portrait.",
      PALETTE_SPEC: "Nearly monochrome graphite with one narrow deep-red signal line at the transformation edge.",
      LIGHTING_SPEC: "High-contrast arena light, controlled falloff, no decorative glow.",
      "DETAIL/EDGE_SPEC": "Hyperreal focal detail at face and hands; dissolving graphite edge at the symbolic threshold.",
      NEGATIVE_SPACE_SPEC: "Large quiet field on the upper right to create institutional scale and restraint.",
      TRANSFORMATION_MECHANISM: "Body passes through a red threshold that converts realism into graphite dust and symbolic fragments.",
      "PHYSICAL_DEPTH/RELIEF_SPEC": "Flat work on paper; optional shallow debossed line only in later physical test.",
      DISPLAY_CONTEXT: "Single framed original with wide mat and museum-style wall spacing.",
      GENERATION_PROMPT_SPEC: buildGenerationPromptSpec({
        medium: "Graphite with restrained selective-color intervention",
        materials: ["archival graphite", "cold-press paper", "transparent red glaze study"],
        composition: "Tight cinematic athlete crop crossing a fractured threshold plane from left to right.",
        subject: "Iconic sports figure as archetype, no literal licensed portrait.",
        palette: "Monochrome graphite plus one deep-red threshold line.",
        lighting: "High-contrast arena light with controlled falloff.",
        transformation: "Realism converts into graphite dust and symbolic fragments.",
        display: "Single framed original with museum-style wall spacing."
      }),
      CONTROLLED_VARIABLES: ["palette/selective-color logic", "transformation mechanism"],
      MARKET_EVIDENCE_REFERENCES: evidenceIds,
      CREATIVE_RATIONALE: "Tests whether one color decision can sharpen the story while keeping craft authority primary.",
      DIFFERENTIATION_RATIONALE: "Avoids generic sports realism by making the moment symbolic and materially specific.",
      SHORT_PATH_RATIONALE: "Still executes through Keegan's strongest graphite capability before adding expensive new medium complexity.",
      RISKS: ["Color could feel gimmicky if overused.", "Rights/reference constraints remain unresolved for literal likeness."],
      WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["Collector demand", "Institutional validation", "Price ceiling", "Artwork success"],
      KEEGAN_FEEDBACK: { state: "PINNED", voice_note: "More like the restraint of the red threshold.", text_note: null, human_reported_context_only: true },
      NEXT_ITERATION: "Isolate the red threshold and test thinner, quieter versions without changing composition.",
      LINEAGE: { request_id: "viz-req-rec2-selective-surreal-001", parent_concept_id: null, version: 1, changed_from_parent: [] }
    },
    {
      CONCEPT_ID: "concept-graphite-void-blue-002",
      PARENT_RECOMMENDATION_VERSION: 2,
      STRATEGIC_HYPOTHESIS: "Expanded negative space can increase prestige cues while preserving emotional intensity.",
      VISUALIZATION_STATUS: "MOCK_STUDY_READY",
      MEDIUM: "Graphite with restrained selective-color intervention",
      MATERIALS: ["archival graphite", "smooth paper", "muted blue-gray pigment test"],
      "DIMENSIONS/ASPECT": "48 x 72 in horizontal",
      COMPOSITION_SPEC: "Small figure mass in lower-left third against a large silent field.",
      SUBJECT_SPEC: "Athlete at the instant before action, face partially obscured to reduce likeness dependency.",
      PALETTE_SPEC: "Graphite field with a muted blue-gray atmospheric band only at the horizon.",
      LIGHTING_SPEC: "Soft pre-game tunnel light with strong directional rim on shoulder and hands.",
      "DETAIL/EDGE_SPEC": "Precise hands and fabric detail; soft atmospheric edges into the field.",
      NEGATIVE_SPACE_SPEC: "Dominant negative space, intentionally quiet and gallery-scaled.",
      TRANSFORMATION_MECHANISM: "The arena environment dissolves into an abstract pressure field around the figure.",
      "PHYSICAL_DEPTH/RELIEF_SPEC": "No relief; paper surface remains pristine and collectible.",
      DISPLAY_CONTEXT: "Gallery wall with long viewing distance and one adjacent study note.",
      GENERATION_PROMPT_SPEC: buildGenerationPromptSpec({
        medium: "Graphite with muted blue-gray selective atmosphere",
        materials: ["archival graphite", "smooth paper", "muted blue-gray pigment test"],
        composition: "Small figure mass in lower-left third against dominant negative space.",
        subject: "Athlete before action, face partially obscured.",
        palette: "Graphite plus muted blue-gray atmospheric horizon.",
        lighting: "Soft tunnel light with directional rim.",
        transformation: "Environment dissolves into abstract pressure field.",
        display: "Gallery wall with long viewing distance."
      }),
      CONTROLLED_VARIABLES: ["negative space", "crop/viewpoint", "lighting"],
      MARKET_EVIDENCE_REFERENCES: evidenceIds,
      CREATIVE_RATIONALE: "Tests whether restraint and scale can carry the sports subject into a more institutional language.",
      DIFFERENTIATION_RATIONALE: "Shifts away from poster-like hero composition toward an authored psychological field.",
      SHORT_PATH_RATIONALE: "Uses graphite fluency and compositional restraint rather than new production infrastructure.",
      RISKS: ["May feel too quiet for collectors expecting focal virtuosity.", "Muted color could reduce immediate recognizability."],
      WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["Market demand", "Long-term prestige", "Collector conversion"],
      KEEGAN_FEEDBACK: { state: "MORE_LIKE_THIS", voice_note: null, text_note: "Keep the scale cue but recover more focal intensity.", human_reported_context_only: true },
      NEXT_ITERATION: "Regenerate with the same negative space but a closer hand/face focal anchor.",
      LINEAGE: { request_id: "viz-req-rec2-selective-surreal-001", parent_concept_id: null, version: 1, changed_from_parent: [] }
    },
    {
      CONCEPT_ID: "concept-graphite-relief-shadow-003",
      PARENT_RECOMMENDATION_VERSION: 2,
      STRATEGIC_HYPOTHESIS: "A shallow physical-depth cue can preview sculpture/relief without committing to a sculpture path.",
      VISUALIZATION_STATUS: "MOCK_STUDY_READY",
      MEDIUM: "Graphite original with paper relief study",
      MATERIALS: ["archival graphite", "layered paper maquette", "matte black spacer shadow"],
      "DIMENSIONS/ASPECT": "36 x 54 in horizontal relief maquette",
      COMPOSITION_SPEC: "Central athlete silhouette interrupted by a raised geometric field crossing the torso.",
      SUBJECT_SPEC: "Non-literal sports-body mechanism focused on motion, pressure, and cultural memory.",
      PALETTE_SPEC: "Pure graphite and shadow only; no color.",
      LIGHTING_SPEC: "Raking side light to reveal shallow relief and graphite tonal depth.",
      "DETAIL/EDGE_SPEC": "Hard cut relief edges against soft graphite tonal transitions.",
      NEGATIVE_SPACE_SPEC: "Moderate negative space around the relief mechanism so the object reads physically.",
      TRANSFORMATION_MECHANISM: "A signature graphite mechanism becomes a raised shadow-casting plane.",
      "PHYSICAL_DEPTH/RELIEF_SPEC": "Shallow paper relief under 0.25 in; no sculpture production commitment.",
      DISPLAY_CONTEXT: "Framed object study with shadow gap, documented from front and oblique angles.",
      GENERATION_PROMPT_SPEC: buildGenerationPromptSpec({
        medium: "Graphite original with shallow paper relief study",
        materials: ["archival graphite", "layered paper maquette", "matte black spacer shadow"],
        composition: "Central athlete silhouette interrupted by a raised geometric field.",
        subject: "Non-literal sports-body motion mechanism.",
        palette: "Graphite and shadow only.",
        lighting: "Raking side light revealing shallow relief.",
        transformation: "Graphite mechanism becomes raised shadow-casting plane.",
        display: "Framed object study with shadow gap."
      }),
      CONTROLLED_VARIABLES: ["material/relief/depth treatment", "realism vs abstraction/surrealism"],
      MARKET_EVIDENCE_REFERENCES: evidenceIds,
      CREATIVE_RATIONALE: "Explores dimensionality as a low-commitment bridge before any sculpture decision.",
      DIFFERENTIATION_RATIONALE: "Turns a recognizable visual mechanism into a physical authorship cue.",
      SHORT_PATH_RATIONALE: "Keeps the experiment small, reversible, and learning-oriented.",
      RISKS: ["Relief may distract from graphite authority.", "Fabrication complexity could expand beyond the V1 scope."],
      WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["Sculpture demand", "Production feasibility at scale", "Collector willingness to pay"],
      KEEGAN_FEEDBACK: { state: "LESS_LIKE_THIS", voice_note: "Interesting, but do not let relief become the main thing yet.", text_note: null, human_reported_context_only: true },
      NEXT_ITERATION: "Reduce relief to a barely visible shadow line and compare against a flat graphite version.",
      LINEAGE: { request_id: "viz-req-rec2-selective-surreal-001", parent_concept_id: "concept-graphite-threshold-red-001", version: 2, changed_from_parent: ["physical depth", "palette removed", "subject abstraction increased"] }
    }
  ]
};

export const CREATIVE_CONCEPT_COMPARISON_FIXTURE_V1: CreativeConceptComparisonV1 = {
  request_id: CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1.REQUEST_ID,
  pinned_concept_ids: ["concept-graphite-threshold-red-001"],
  rejected_concept_ids: ["concept-graphite-relief-shadow-003"],
  isolate_variable_options: ["palette/selective-color logic", "negative space", "lighting", "transformation mechanism", "material/relief/depth treatment"],
  next_regeneration_request: {
    concept_id: "concept-graphite-threshold-red-001",
    instruction: "More like this: preserve the composition and graphite authority; isolate only the red threshold intensity.",
    isolate_variable: "palette/selective-color logic"
  }
};

export function createVisualizationRequestFromRecommendation(input: {
  recommendation: CreativeRecommendationVersionV1;
  evidence: CreativeEvidenceV1[];
}): CreativeVisualizationRequestV1 {
  return {
    ...CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
    PARENT_RECOMMENDATION_VERSION: input.recommendation.version,
    SELECTED_DIRECTION_STAGE: input.recommendation.stage,
    concepts: CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1.concepts.map((concept) => ({
      ...concept,
      PARENT_RECOMMENDATION_VERSION: input.recommendation.version,
      MARKET_EVIDENCE_REFERENCES: input.evidence.map((item) => item.id).sort()
    }))
  };
}

export function conceptIsMarketEvidence(concept: CreativeVisualizationConceptV1): false {
  void concept;
  return false;
}

export function recommendationConfidenceDeltaFromConceptAppeal(concept: CreativeVisualizationConceptV1): 0 {
  void concept;
  return 0;
}

export function compareControlledVariables(concepts: CreativeVisualizationConceptV1[]): Record<string, string[]> {
  return concepts.reduce<Record<string, string[]>>((acc, concept) => {
    for (const variable of concept.CONTROLLED_VARIABLES) {
      acc[variable] = [...(acc[variable] ?? []), concept.CONCEPT_ID].sort();
    }
    return acc;
  }, {});
}
