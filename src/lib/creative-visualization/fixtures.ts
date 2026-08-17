import type {
  ConceptFeedbackStateV1,
  CreativeVisualizationComparisonSetV1,
  CreativeVisualizationConceptV1,
  CreativeVisualizationRequestV1
} from "./contracts";

const PARENT_VERSION = "CreativeDirectionRecommendationVersion:2";
const DIRECTION_ID = "cdv1-graphite-surreal-symbolic-environment";

export const CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1: CreativeVisualizationRequestV1 = {
  request_id: "viz-request-graphite-surreal-selective-color-v1",
  parent_recommendation_version: PARENT_VERSION,
  direction_id: DIRECTION_ID,
  prompt_intent: "VISUALIZE_THIS_RECOMMENDATION",
  concept_count: 4,
  controlled_dimensions: [
    "composition",
    "crop/viewpoint",
    "negative space",
    "lighting",
    "palette/selective-color logic",
    "realism vs abstraction/surrealism",
    "transformation mechanism",
    "material/relief/depth treatment",
    "installation/display context"
  ],
  evidence_references: ["ev-first-party-collector-graphite", "ev-institutional-drawing-validation"],
  confidence_change_policy: "NO_CONFIDENCE_CHANGE_FROM_GENERATED_IMAGE"
};

function promptFor(input: {
  conceptId: string;
  composition: string;
  subject: string;
  palette: string;
  lighting: string;
  transformation: string;
  depth: string;
}): CreativeVisualizationConceptV1["GENERATION_PROMPT_SPEC"] {
  return {
    provider_mode: "MOCKABLE_ADAPTER_ONLY",
    seed_label: input.conceptId,
    output_count: 1,
    prompt: [
      "Museum-grade graphite concept study for a premium fine-art original.",
      `Composition: ${input.composition}.`,
      `Subject: ${input.subject}.`,
      `Palette: ${input.palette}.`,
      `Lighting: ${input.lighting}.`,
      `Transformation mechanism: ${input.transformation}.`,
      `Depth/relief: ${input.depth}.`,
      "Preserve collectible physical authorship; this is a pre-production design research artifact."
    ].join(" "),
    negative_prompt:
      "Do not imply market success, sale probability, licensing clearance, final artwork commitment, public release, material purchase, or third-party commission."
  };
}

function feedback(state: ConceptFeedbackStateV1, note: string | null = null): CreativeVisualizationConceptV1["KEEGAN_FEEDBACK"] {
  return {
    state,
    annotation_channel: note ? "TEXT" : "NONE",
    note,
    learning_classification: "HUMAN_REPORTED_CREATIVE_PREFERENCE",
    market_evidence_weight: "NONE"
  };
}

export const CREATIVE_VISUALIZATION_CONCEPT_FIXTURES_V1: CreativeVisualizationConceptV1[] = [
  {
    CONCEPT_ID: "viz-concept-threshold-arena-01",
    PARENT_RECOMMENDATION_VERSION: PARENT_VERSION,
    STRATEGIC_HYPOTHESIS: "Graphite focal realism can move toward a proprietary symbolic environment without abandoning craft authority.",
    VISUALIZATION_STATUS: "PINNED",
    MEDIUM: "Graphite with restrained selective-color planning study",
    MATERIALS: ["graphite", "archival paper", "one controlled deep-red accent", "museum-grade frame"],
    "DIMENSIONS/ASPECT": "48 x 72 inch horizontal study",
    COMPOSITION_SPEC: "Wide arena-threshold composition with the figure offset left and symbolic architecture opening to the right.",
    SUBJECT_SPEC: "Culturally durable athlete silhouette rendered with hyperreal focal detail at the face and hands.",
    PALETTE_SPEC: "Graphite value field with one deep-red accent isolated to a threshold line.",
    LIGHTING_SPEC: "Single hard sidelight crosses realistic figure detail into impossible architectural shadow.",
    "DETAIL/EDGE_SPEC": "Crisp focal realism dissolves into soft graphite atmosphere at the symbolic threshold.",
    NEGATIVE_SPACE_SPEC: "Large quiet right-side void creates institutional scale and psychological pressure.",
    TRANSFORMATION_MECHANISM: "Arena tunnel becomes a surreal pressure gate around the subject.",
    "PHYSICAL_DEPTH/RELIEF_SPEC": "Flat work only; depth remains illusionistic graphite space.",
    DISPLAY_CONTEXT: "Single large framed wall work with generous viewing distance.",
    GENERATION_PROMPT_SPEC: promptFor({
      conceptId: "viz-concept-threshold-arena-01",
      composition: "wide arena threshold, figure offset left, large right-side void",
      subject: "hyperreal athlete silhouette with focal face and hands",
      palette: "monochrome graphite with one deep-red threshold accent",
      lighting: "hard sidelight moving into impossible architectural shadow",
      transformation: "arena tunnel turns into symbolic pressure gate",
      depth: "illusionistic flat graphite depth"
    }),
    CONTROLLED_VARIABLES: [
      { variable: "composition", baseline: "centered portrait", variant: "offset figure with architectural void" },
      { variable: "palette/selective-color logic", baseline: "monochrome graphite", variant: "single deep-red threshold accent" }
    ],
    MARKET_EVIDENCE_REFERENCES: ["ev-first-party-collector-graphite", "ev-institutional-drawing-validation"],
    CREATIVE_RATIONALE: "Keeps graphite mastery as the first read while adding ownable symbolic space.",
    DIFFERENTIATION_RATIONALE: "The pressure-gate mechanism is more proprietary than a conventional portrait crop.",
    SHORT_PATH_RATIONALE: "Closest to the current graphite recommendation while still testing symbolic language.",
    RISKS: ["Accent color could read as decoration", "Architecture could become generic without subject-specific meaning"],
    WHAT_THIS_VISUAL_DOES_NOT_PROVE: [
      "It is not market evidence.",
      "It does not prove collector demand.",
      "It does not increase recommendation confidence."
    ],
    KEEGAN_FEEDBACK: feedback("PINNED", "Strongest balance of graphite authority and symbolic expansion."),
    NEXT_ITERATION: "Isolate the threshold color variable and test monochrome vs deep-red accent.",
    lineage: [{ version: 1, action: "INITIAL_VARIANT", changed_variable: null, parent_concept_id: null, created_at: "2026-08-17T00:00:00.000Z" }]
  },
  {
    CONCEPT_ID: "viz-concept-close-crop-fracture-02",
    PARENT_RECOMMENDATION_VERSION: PARENT_VERSION,
    STRATEGIC_HYPOTHESIS: "A tighter crop can make the transformation mechanism feel more intimate and less illustrative.",
    VISUALIZATION_STATUS: "READY_FOR_REVIEW",
    MEDIUM: "Graphite surreal crop study",
    MATERIALS: ["graphite", "charcoal powder", "archival paper"],
    "DIMENSIONS/ASPECT": "40 x 54 inch vertical study",
    COMPOSITION_SPEC: "Close vertical crop around face and shoulder with symbolic fracture entering from the upper edge.",
    SUBJECT_SPEC: "Partial figure rather than full likeness, reducing rights pressure while preserving cultural read.",
    PALETTE_SPEC: "Pure graphite; no color in this variant.",
    LIGHTING_SPEC: "Soft frontal light interrupted by an unnatural diagonal shadow.",
    "DETAIL/EDGE_SPEC": "Hyperreal eye and fabric detail breaks into atmospheric fracture edges.",
    NEGATIVE_SPACE_SPEC: "Compressed negative space around the face creates tension rather than luxury breadth.",
    TRANSFORMATION_MECHANISM: "Realistic shoulder seam opens into abstract fracture field.",
    "PHYSICAL_DEPTH/RELIEF_SPEC": "No physical relief; fracture uses tonal layering.",
    DISPLAY_CONTEXT: "More intimate collector-facing work within a larger series.",
    GENERATION_PROMPT_SPEC: promptFor({
      conceptId: "viz-concept-close-crop-fracture-02",
      composition: "tight vertical crop, face and shoulder, symbolic fracture from top edge",
      subject: "partial culturally readable figure",
      palette: "pure monochrome graphite",
      lighting: "soft frontal light interrupted by diagonal shadow",
      transformation: "shoulder seam opens into abstract fracture field",
      depth: "tonal graphite layering only"
    }),
    CONTROLLED_VARIABLES: [
      { variable: "crop/viewpoint", baseline: "wide wall-scale view", variant: "tight vertical crop" },
      { variable: "negative space", baseline: "expansive void", variant: "compressed tension field" }
    ],
    MARKET_EVIDENCE_REFERENCES: ["ev-institutional-drawing-validation"],
    CREATIVE_RATIONALE: "Tests whether symbolic extension can stay intimate and still feel premium.",
    DIFFERENTIATION_RATIONALE: "Partial figure and fracture grammar reduce reliance on straightforward likeness.",
    SHORT_PATH_RATIONALE: "Lower scope than the wide arena study but still executable in graphite.",
    RISKS: ["May feel less iconic", "Compressed space could reduce institutional presence"],
    WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["It is not market evidence.", "It does not prove a lower rights risk.", "It does not justify production commitment."],
    KEEGAN_FEEDBACK: feedback("UNREVIEWED"),
    NEXT_ITERATION: "Compare against the wide arena crop before deciding scale.",
    lineage: [{ version: 1, action: "INITIAL_VARIANT", changed_variable: null, parent_concept_id: null, created_at: "2026-08-17T00:05:00.000Z" }]
  },
  {
    CONCEPT_ID: "viz-concept-relief-shadow-03",
    PARENT_RECOMMENDATION_VERSION: PARENT_VERSION,
    STRATEGIC_HYPOTHESIS: "A shallow-relief visual cue can preview object language without authorizing sculpture production.",
    VISUALIZATION_STATUS: "NEEDS_ITERATION",
    MEDIUM: "Graphite drawing with mocked relief-shadow treatment",
    MATERIALS: ["graphite", "archival paper", "simulated raised graphite edge in prompt only"],
    "DIMENSIONS/ASPECT": "44 x 60 inch horizontal study",
    COMPOSITION_SPEC: "Figure centered inside a quiet field with one raised-shadow symbolic contour behind the body.",
    SUBJECT_SPEC: "Athlete torso/gesture fragment rather than full portrait.",
    PALETTE_SPEC: "Monochrome graphite and warm paper tone only.",
    LIGHTING_SPEC: "Gallery spotlight throws a long shadow from the simulated raised contour.",
    "DETAIL/EDGE_SPEC": "Realistic figure detail against clean contour edge and broad soft shadow.",
    NEGATIVE_SPACE_SPEC: "Balanced gallery-like negative space around the fragment.",
    TRANSFORMATION_MECHANISM: "Signature contour appears to lift from the drawing surface as a shadow language.",
    "PHYSICAL_DEPTH/RELIEF_SPEC": "Mocked relief only; no material purchase or fabrication commitment.",
    DISPLAY_CONTEXT: "Optional future wall-relief visualization, not production approval.",
    GENERATION_PROMPT_SPEC: promptFor({
      conceptId: "viz-concept-relief-shadow-03",
      composition: "centered figure fragment with raised-shadow symbolic contour",
      subject: "athlete torso and gesture fragment",
      palette: "monochrome graphite on warm paper",
      lighting: "gallery spotlight casting contour shadow",
      transformation: "signature contour lifts visually from drawing surface",
      depth: "mocked relief shadow only"
    }),
    CONTROLLED_VARIABLES: [
      { variable: "material/relief/depth treatment", baseline: "flat graphite illusion", variant: "mocked shallow-relief shadow" },
      { variable: "installation/display context", baseline: "framed drawing", variant: "gallery-lit wall object cue" }
    ],
    MARKET_EVIDENCE_REFERENCES: ["ev-institutional-drawing-validation"],
    CREATIVE_RATIONALE: "Lets object-language curiosity be evaluated visually without buying materials.",
    DIFFERENTIATION_RATIONALE: "Connects future relief optionality to graphite authorship instead of generic sculpture.",
    SHORT_PATH_RATIONALE: "Useful only as a visualization; actual relief remains deferred.",
    RISKS: ["Could overstate readiness for object work", "Mocked relief may distract from graphite mastery"],
    WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["It is not fabrication proof.", "It is not market evidence.", "It does not authorize sculpture or material purchases."],
    KEEGAN_FEEDBACK: feedback("LESS_LIKE_THIS", "Keep the shadow idea, but make the drawing feel less like a product mockup."),
    NEXT_ITERATION: "Reduce relief emphasis and isolate installation lighting as the only changed variable.",
    lineage: [
      { version: 1, action: "INITIAL_VARIANT", changed_variable: null, parent_concept_id: null, created_at: "2026-08-17T00:10:00.000Z" },
      { version: 2, action: "LESS_LIKE_THIS", changed_variable: "material/relief/depth treatment", parent_concept_id: "viz-concept-relief-shadow-03", created_at: "2026-08-17T00:20:00.000Z" }
    ]
  },
  {
    CONCEPT_ID: "viz-concept-process-reveal-04",
    PARENT_RECOMMENDATION_VERSION: PARENT_VERSION,
    STRATEGIC_HYPOTHESIS: "A physical-plus-moving-image companion can be scoped as provenance/process, not a digital pivot.",
    VISUALIZATION_STATUS: "REJECTED",
    MEDIUM: "Physical graphite anchor with moving-image companion prompt",
    MATERIALS: ["finished graphite work", "process animation prompt", "collector certificate concept"],
    "DIMENSIONS/ASPECT": "Physical 48 x 60 inch work plus 16:9 companion loop",
    COMPOSITION_SPEC: "Finished figure remains static while digital companion reveals graphite construction in timed layers.",
    SUBJECT_SPEC: "Same cultural figure thesis as the physical work; no standalone digital subject.",
    PALETTE_SPEC: "Graphite physical work with minimal digital light sweep.",
    LIGHTING_SPEC: "Digital light sweep reveals process but does not alter the physical composition.",
    "DETAIL/EDGE_SPEC": "Physical detail is final; moving image shows construction edges and erasure marks.",
    NEGATIVE_SPACE_SPEC: "Timed fade uses negative space as silence between process states.",
    TRANSFORMATION_MECHANISM: "Motion reveals process history rather than transforming the artwork itself.",
    "PHYSICAL_DEPTH/RELIEF_SPEC": "No relief; physical authorship remains the collectible anchor.",
    DISPLAY_CONTEXT: "Private collector viewing companion only; no public publishing implied.",
    GENERATION_PROMPT_SPEC: promptFor({
      conceptId: "viz-concept-process-reveal-04",
      composition: "static finished graphite work with process-reveal companion loop",
      subject: "same physical artwork subject, no standalone digital subject",
      palette: "graphite with minimal digital light sweep",
      lighting: "process reveal light over finished work",
      transformation: "timed graphite construction reveal",
      depth: "physical flat artwork plus digital companion"
    }),
    CONTROLLED_VARIABLES: [
      { variable: "display context", baseline: "single physical wall work", variant: "private physical-plus-moving-image companion" },
      { variable: "transformation mechanism", baseline: "symbolic environment", variant: "process reveal" }
    ],
    MARKET_EVIDENCE_REFERENCES: ["ev-first-party-collector-graphite"],
    CREATIVE_RATIONALE: "Tests digital as process/provenance support, not replacement.",
    DIFFERENTIATION_RATIONALE: "Process reveal could deepen craft authority if kept private and scarce.",
    SHORT_PATH_RATIONALE: "Rejected for now because it risks pulling focus from the physical object.",
    RISKS: ["Could look like content marketing", "Public release and rights constraints are not approved", "May dilute the fine-art object"],
    WHAT_THIS_VISUAL_DOES_NOT_PROVE: ["It is not digital-art market evidence.", "It does not prove younger collector demand.", "It does not permit publication."],
    KEEGAN_FEEDBACK: feedback("REJECTED", "Too close to content; revisit only as private provenance after the physical work is strong."),
    NEXT_ITERATION: "Do not regenerate unless a collector asks for private provenance support.",
    lineage: [{ version: 1, action: "INITIAL_VARIANT", changed_variable: null, parent_concept_id: null, created_at: "2026-08-17T00:15:00.000Z" }]
  }
];

export const CREATIVE_VISUALIZATION_COMPARISON_SET_FIXTURE_V1: CreativeVisualizationComparisonSetV1 = {
  comparison_set_id: "viz-set-graphite-surreal-selective-color-v1",
  request: CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
  concepts: CREATIVE_VISUALIZATION_CONCEPT_FIXTURES_V1,
  comparison_axes: [
    "composition",
    "crop/viewpoint",
    "negative space",
    "lighting",
    "palette/selective-color logic",
    "realism vs abstraction/surrealism",
    "transformation mechanism",
    "material/relief/depth treatment",
    "installation/display context"
  ],
  epistemic_guardrail:
    "Generated concepts are design research artifacts, not market evidence, not proof of future artwork success, and not grounds for increasing strategic confidence.",
  dashboard_actions: ["PIN", "FAVORITE", "REJECT", "ANNOTATE_VOICE", "ANNOTATE_TEXT", "MORE_LIKE_THIS", "LESS_LIKE_THIS", "ISOLATE_VARIABLE_REGENERATE", "COMPARE_TO_EVIDENCE"]
};

export function buildVisualizationRequestFromRecommendation(input: {
  recommendationVersion: number;
  directionId: string;
  evidenceIds: string[];
}): CreativeVisualizationRequestV1 {
  return {
    ...CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
    request_id: `viz-request-${input.directionId}-v${input.recommendationVersion}`,
    parent_recommendation_version: `CreativeDirectionRecommendationVersion:${input.recommendationVersion}`,
    direction_id: input.directionId,
    evidence_references: [...input.evidenceIds].sort()
  };
}

export function isolateControlledVariable(input: {
  concept: CreativeVisualizationConceptV1;
  variable: string;
}): CreativeVisualizationConceptV1 {
  return {
    ...input.concept,
    CONCEPT_ID: `${input.concept.CONCEPT_ID}-isolate-${input.variable.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`,
    VISUALIZATION_STATUS: "NEEDS_ITERATION",
    CONTROLLED_VARIABLES: input.concept.CONTROLLED_VARIABLES.filter((item) => item.variable === input.variable),
    KEEGAN_FEEDBACK: feedback("UNREVIEWED"),
    NEXT_ITERATION: `Regenerate while changing only ${input.variable}.`,
    lineage: [
      ...input.concept.lineage,
      {
        version: input.concept.lineage.length + 1,
        action: "VARIABLE_ISOLATION",
        changed_variable: input.variable,
        parent_concept_id: input.concept.CONCEPT_ID,
        created_at: "2026-08-17T00:30:00.000Z"
      }
    ]
  };
}

export function conceptConfidenceDeltaFromGeneratedImage(): 0 {
  return 0;
}
