import type { OpportunitySeed, OpportunityPipelineRow } from "@/lib/opportunity-discovery-v2/types";
import { inferArchetypes } from "@/lib/opportunity-discovery-v2/archetypes";
import type { OpportunityCoverageProfile, CoverageVariable, CoverageState, ArtifactRef } from "./types";

export type OpportunityGraphRollupRow = {
  opportunity_id: string;
  links: Array<{
    target_type: ArtifactRef["target_type"];
    target_id: string;
    target_content_hash: string | null;
    role: string;
    match_method: string;
    confidence: number | null;
    explanation: string;
  }>;
  link_count: number;
  supported_claim_count: number;
  supported_event_count: number;
  trigger_signal_count: number;
};

function countStates(vars: CoverageVariable[]) {
  const out: Record<CoverageState, number> = {
    KNOWN: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
    CONFLICTED: 0,
    NOT_APPLICABLE: 0
  };
  for (const v of vars) out[v.state] += 1;
  return out;
}

function refsFromRollup(rollup: OpportunityGraphRollupRow | null | undefined): ArtifactRef[] {
  if (!rollup || !Array.isArray(rollup.links)) return [];
  return rollup.links.map((l) => ({
    target_type: l.target_type,
    target_id: l.target_id,
    target_content_hash: l.target_content_hash,
    role: l.role,
    confidence: l.confidence
  }));
}

export function buildCoverageProfile(params: {
  pipeline: OpportunityPipelineRow;
  rollup?: OpportunityGraphRollupRow | null;
}): OpportunityCoverageProfile {
  const pipeline = params.pipeline;

  // For archetype conditioning, reuse the same inference used by discovery.
  const seed: OpportunitySeed = {
    layer: "first_party_active",
    seedId: `pipeline:${pipeline.id}`,
    name: pipeline.name,
    organization: pipeline.organization,
    sourceSummary: pipeline.source ?? null,
    evidence: [],
    claims: [],
    artifacts: [],
    linkedPipelineOpportunityId: pipeline.id
  };
  const plausible_archetypes = inferArchetypes(seed, pipeline);

  const artifacts = refsFromRollup(params.rollup);
  const hasAnyGraph = artifacts.length > 0;

  const identity: CoverageVariable = {
    key: "IDENTITY_COVERAGE",
    state: pipeline.organization ? "PARTIAL" : "UNKNOWN",
    notes: pipeline.organization
      ? ["Organization name present on opportunity, but no canonical entity id is stored on opportunity."]
      : ["No organization provided on opportunity."] ,
    supportingArtifacts: []
  };

  const programSurfaces: CoverageVariable = {
    key: "PROGRAM_SURFACES",
    state: hasAnyGraph && artifacts.some((a) => a.role === "CONTEXT_FOR" || a.role === "SUPPORTS") ? "PARTIAL" : "UNKNOWN",
    notes: hasAnyGraph ? ["Graph links exist; program surface support may be present (inspect artifacts)."] : ["No linked program surface claims."],
    supportingArtifacts: artifacts.filter((a) => a.target_type === "claim_version")
  };

  const trigger: CoverageVariable = {
    key: "TRIGGER_CONTEXT",
    state: pipeline.source || (pipeline.notes_md && pipeline.notes_md.trim()) ? "PARTIAL" : "UNKNOWN",
    notes: pipeline.source ? [`Source hint present: ${pipeline.source}`] : ["No explicit trigger/campaign/event recorded on opportunity."],
    supportingArtifacts: artifacts.filter((a) => a.role === "TRIGGERED_BY" || a.role === "TIMING_SIGNAL")
  };

  const timing: CoverageVariable = {
    key: "TIMING_CONTEXT",
    state: pipeline.next_step_due_at ? "PARTIAL" : hasAnyGraph && artifacts.some((a) => a.role === "TIMING_SIGNAL") ? "PARTIAL" : "UNKNOWN",
    notes: pipeline.next_step_due_at ? ["next_step_due_at present (operational timing)."] : ["No event/campaign window linked."],
    supportingArtifacts: artifacts.filter((a) => a.role === "TIMING_SIGNAL")
  };

  const access: CoverageVariable = {
    key: "ACCESS_CONTEXT",
    state: pipeline.next_step ? "PARTIAL" : "UNKNOWN",
    notes: pipeline.next_step ? ["Next step indicates some access path exists, but contact identity is not structured."] : ["No access path recorded."],
    supportingArtifacts: artifacts.filter((a) => a.role === "ACCESS_PATH")
  };

  const buyerIntent: CoverageVariable = {
    key: "BUYER_INTENT",
    state: hasAnyGraph && artifacts.some((a) => a.role === "VALUE_SIGNAL" || a.role === "SUPPORTS") ? "PARTIAL" : "UNKNOWN",
    notes: hasAnyGraph ? ["Graph contains some support/value artifacts; buyer intent may be derivable."] : ["No persisted buyer intent/procurement artifacts."],
    supportingArtifacts: artifacts
  };

  const commercial: CoverageVariable = {
    key: "COMMERCIAL_CONTEXT",
    state: typeof pipeline.value_estimate === "number" ? "PARTIAL" : hasAnyGraph && artifacts.some((a) => a.role === "VALUE_SIGNAL") ? "PARTIAL" : "UNKNOWN",
    notes:
      typeof pipeline.value_estimate === "number"
        ? ["value_estimate present on opportunity (signal only)."]
        : ["No budget/procurement/licensing evidence linked."] ,
    supportingArtifacts: artifacts.filter((a) => a.role === "VALUE_SIGNAL")
  };

  const orgContext: CoverageVariable = {
    key: "ORGANIZATION_CONTEXT",
    state: pipeline.organization ? "PARTIAL" : "UNKNOWN",
    notes: pipeline.organization
      ? ["Organization label exists, but no structured classification/geo/scale facts linked."]
      : ["No organization label."] ,
    supportingArtifacts: artifacts
  };

  const projectInputs: CoverageVariable = {
    key: "PROJECT_MODEL_INPUTS",
    state: "UNKNOWN",
    notes: ["Requires trigger + program + usage scope facts; none are persisted/linked yet."],
    supportingArtifacts: []
  };

  const valuationInputs: CoverageVariable = {
    key: "VALUATION_INPUTS",
    state: typeof pipeline.value_estimate === "number" ? "PARTIAL" : "UNKNOWN",
    notes:
      typeof pipeline.value_estimate === "number"
        ? ["Existing value_estimate provides a starting signal, but rights/scope assumptions are unknown."]
        : ["No persisted scope/rights inputs."],
    supportingArtifacts: artifacts
  };

  const contactCoverage: CoverageVariable = {
    key: "CONTACT_COVERAGE",
    state: "UNKNOWN",
    notes: ["No structured contacts table linked to opportunities in this repo; contact coverage is not yet persisted as graph artifacts."],
    supportingArtifacts: []
  };

  const variables: CoverageVariable[] = [
    identity,
    orgContext,
    trigger,
    programSurfaces,
    projectInputs,
    commercial,
    timing,
    access,
    buyerIntent,
    valuationInputs,
    contactCoverage
  ];

  return {
    opportunity_id: pipeline.id,
    opportunity_name: pipeline.name,
    organization: pipeline.organization,
    plausible_archetypes,
    variables,
    summaryCounts: countStates(variables)
  };
}

