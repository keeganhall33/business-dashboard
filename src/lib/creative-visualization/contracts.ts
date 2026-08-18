export type VisualizationStatusV1 = "READY_FOR_REVIEW" | "PINNED" | "REJECTED" | "NEEDS_ITERATION";
export type ConceptFeedbackStateV1 = "UNREVIEWED" | "PINNED" | "FAVORITE" | "REJECTED" | "MORE_LIKE_THIS" | "LESS_LIKE_THIS";
export type ConceptLineageActionV1 = "INITIAL_VARIANT" | "VARIABLE_ISOLATION" | "MORE_LIKE_THIS" | "LESS_LIKE_THIS" | "HUMAN_ANNOTATION";

export type ControlledVariableV1 = {
  variable: string;
  baseline: string;
  variant: string;
};

export type GenerationPromptSpecV1 = {
  provider_mode: "MOCKABLE_ADAPTER_ONLY";
  prompt: string;
  negative_prompt: string;
  seed_label: string;
  output_count: number;
};

export type KeeganFeedbackV1 = {
  state: ConceptFeedbackStateV1;
  annotation_channel: "NONE" | "VOICE" | "TEXT";
  note: string | null;
  learning_classification: "HUMAN_REPORTED_CREATIVE_PREFERENCE";
  market_evidence_weight: "NONE";
};

export type ConceptLineageV1 = {
  version: number;
  action: ConceptLineageActionV1;
  changed_variable: string | null;
  parent_concept_id: string | null;
  created_at: string;
};

export type CreativeVisualizationConceptV1 = {
  CONCEPT_ID: string;
  PARENT_RECOMMENDATION_VERSION: string;
  STRATEGIC_HYPOTHESIS: string;
  VISUALIZATION_STATUS: VisualizationStatusV1;
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
  GENERATION_PROMPT_SPEC: GenerationPromptSpecV1;
  CONTROLLED_VARIABLES: ControlledVariableV1[];
  MARKET_EVIDENCE_REFERENCES: string[];
  CREATIVE_RATIONALE: string;
  DIFFERENTIATION_RATIONALE: string;
  SHORT_PATH_RATIONALE: string;
  RISKS: string[];
  WHAT_THIS_VISUAL_DOES_NOT_PROVE: string[];
  KEEGAN_FEEDBACK: KeeganFeedbackV1;
  NEXT_ITERATION: string;
  lineage: ConceptLineageV1[];
};

export type CreativeVisualizationRequestV1 = {
  request_id: string;
  parent_recommendation_version: string;
  direction_id: string;
  prompt_intent: "VISUALIZE_THIS_RECOMMENDATION";
  concept_count: number;
  controlled_dimensions: string[];
  evidence_references: string[];
  confidence_change_policy: "NO_CONFIDENCE_CHANGE_FROM_GENERATED_IMAGE";
};

export type CreativeVisualizationComparisonSetV1 = {
  comparison_set_id: string;
  request: CreativeVisualizationRequestV1;
  concepts: CreativeVisualizationConceptV1[];
  comparison_axes: string[];
  epistemic_guardrail: string;
  dashboard_actions: Array<"PIN" | "FAVORITE" | "REJECT" | "ANNOTATE_VOICE" | "ANNOTATE_TEXT" | "MORE_LIKE_THIS" | "LESS_LIKE_THIS" | "ISOLATE_VARIABLE_REGENERATE" | "COMPARE_TO_EVIDENCE">;
};
