import type { OpportunitySeed, OpportunityPipelineRow } from "@/lib/opportunity-discovery-v2/types";
import { inferArchetypes } from "@/lib/opportunity-discovery-v2/archetypes";
import type { OpportunityCoverageProfile, CoverageVariable, CoverageState, ArtifactRef } from "./types";
import { resolveOpportunitySubject } from "./subject";

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
  const subject = resolveOpportunitySubject(pipeline);

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
    state: subject.target_organization.state === "PARTIAL" ? "PARTIAL" : "UNKNOWN",
    notes: [subject.target_organization.rationale],
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
    state: subject.trigger_state === "PARTIAL" ? "PARTIAL" : "UNKNOWN",
    notes: subject.trigger_summary ? [`First-party trigger hint: ${subject.trigger_summary}`] : ["No explicit trigger/campaign/event recorded on opportunity."],
    supportingArtifacts: artifacts.filter((a) => a.role === "TRIGGERED_BY" || a.role === "TIMING_SIGNAL")
  };

  const timing: CoverageVariable = {
    key: "TIMING_CONTEXT",
    // Semantic firewall: internal task deadlines do NOT establish external opportunity timing.
    state: artifacts.some((a) => a.role === "TIMING_SIGNAL") ? "PARTIAL" : "UNKNOWN",
    notes: artifacts.some((a) => a.role === "TIMING_SIGNAL")
      ? ["Has linked timing artifacts (event/campaign/planning window)."]
      : ["No external event/campaign/planning timing artifacts linked (internal due dates are not timing context)."],
    supportingArtifacts: artifacts.filter((a) => a.role === "TIMING_SIGNAL")
  };

  const access: CoverageVariable = {
    key: "ACCESS_CONTEXT",
    // Semantic firewall: a planned next_step is NOT evidence of access.
    // Access requires a named contact/intro/relationship artifact or an explicit ACCESS_PATH graph link.
    state:
      Boolean(pipeline.contact_name) ||
      /\bintro\b\s*:/i.test(pipeline.notes_md ?? "") ||
      artifacts.some((a) => a.role === "ACCESS_PATH")
        ? "PARTIAL"
        : "UNKNOWN",
    notes:
      Boolean(pipeline.contact_name)
        ? ["Named contact present on opportunity."]
        : /\bintro\b\s*:/i.test(pipeline.notes_md ?? "")
          ? ["Notes include an intro hint (first-party assertion)."]
          : artifacts.some((a) => a.role === "ACCESS_PATH")
            ? ["Has linked access-path artifacts."]
            : ["No access-path evidence (planned next steps do not count)."],
    supportingArtifacts: artifacts.filter((a) => a.role === "ACCESS_PATH")
  };

  const buyerIntent: CoverageVariable = {
    key: "BUYER_INTENT",
    // Semantic firewall:
    // Program-surface / capability claims (e.g., operates_merchandising) do NOT imply willingness to procure/commission.
    // In V1, we only treat explicit TRIGGER signals (signal_version links) or VALUE_SIGNAL links as buyer-intent evidence.
    state:
      (params.rollup?.trigger_signal_count ?? 0) > 0 || artifacts.some((a) => a.role === "VALUE_SIGNAL")
        ? "PARTIAL"
        : "UNKNOWN",
    notes:
      (params.rollup?.trigger_signal_count ?? 0) > 0 || artifacts.some((a) => a.role === "VALUE_SIGNAL")
        ? ["Has explicit trigger/value signals; buyer intent may be derivable from those artifacts."]
        : ["No persisted buyer-intent/procurement signals (program surfaces/capabilities are not buyer intent)."],
    supportingArtifacts: artifacts.filter((a) => a.role === "VALUE_SIGNAL" || a.target_type === "signal_version")
  };

  const commercial: CoverageVariable = {
    key: "COMMERCIAL_CONTEXT",
    // Semantic firewall: legacy/unvalidated value_estimate does NOT establish commercial context.
    // Commercial context requires budget/procurement/rights/revenue-scale artifacts (VALUE_SIGNAL links).
    state: artifacts.some((a) => a.role === "VALUE_SIGNAL") ? "PARTIAL" : "UNKNOWN",
    notes:
      artifacts.some((a) => a.role === "VALUE_SIGNAL")
        ? ["Has linked commercial/value-signal artifacts."]
        : ["No commercial evidence linked (legacy value_estimate alone is not commercial context)."],
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
    // Semantic firewall: valuation inputs require scope/rights/economic drivers (VALUE_SIGNAL links, events, etc.).
    // A legacy value_estimate alone is not an input.
    state: artifacts.some((a) => a.role === "VALUE_SIGNAL") ? "PARTIAL" : "UNKNOWN",
    notes: artifacts.some((a) => a.role === "VALUE_SIGNAL")
      ? ["Has linked valuation driver artifacts (scope/rights/economics)."]
      : ["No valuation driver artifacts linked (legacy value_estimate alone is not a valuation input)."],
    supportingArtifacts: artifacts.filter((a) => a.role === "VALUE_SIGNAL" || a.role === "TIMING_SIGNAL")
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
