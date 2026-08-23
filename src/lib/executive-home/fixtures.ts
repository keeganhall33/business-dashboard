export type IntelligenceStateV1 = "FACT" | "INFERENCE" | "HYPOTHESIS" | "RECOMMENDATION" | "ACTION" | "WARNING" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type IntelligencePriorityV1 = "DO_NOW" | "PREPARE" | "MONITOR";
export type ConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type ApprovalStateV1 = "NONE" | "KEEGAN_ACTION_REQUIRED" | "APPROVED" | "BLOCKED";
export type FreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";
export type SpecialistDomainV1 = "STRATEGY" | "FINANCIAL" | "CREATIVE" | "OPERATIONS" | "EVIDENCE" | "LEARNING";
export type ExecutiveCommandCenterTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type ExecutiveActionStepStateV1 = "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "COMPLETED" | "NEEDS_VERIFICATION";

export type ExecutiveCommandCenterKpiV1 = {
  id: string;
  label: string;
  value: string;
  detail: string;
  trend: Array<number | null>;
  truth_state: ExecutiveCommandCenterTruthStateV1;
  last_updated: string | null;
  source: string;
};

export type ExecutiveCommandCenterOpportunityV1 = {
  id: string;
  title: string;
  upside: string;
  fit: string;
  timing: string;
  effort: string;
  evidence: ExecutiveCommandCenterTruthStateV1;
  next_move: string;
  detail_href: string;
};

export type ExecutiveExecutionHistoryEntryV1 = {
  step_id: string;
  from_state: ExecutiveActionStepStateV1;
  to_state: ExecutiveActionStepStateV1;
  changed_at: string;
  actor: "KEEGAN" | "SYSTEM";
  provenance: "EXPLICIT_USER_COMPLETION" | "FIXTURE_PREVIEW";
  note: string;
};

export type ExecutiveExecutionStepV1 = {
  id: string;
  label: string;
  why_it_matters: string;
  state: ExecutiveActionStepStateV1;
  dependency_ids: string[];
  unlocks_step_id: string | null;
  requires_verification: boolean;
  completed_at: string | null;
  provenance: "DASHBOARD_OVERVIEW" | "FIXTURE_PREVIEW";
};

export type ExecutiveCommandCenterV1 = {
  generated_at: string;
  kpis: ExecutiveCommandCenterKpiV1[];
  what_changed: Array<{
    id: string;
    label: string;
    value: string;
    why_it_matters: string;
    trend: Array<number | null>;
    truth_state: ExecutiveCommandCenterTruthStateV1;
  }>;
  strategy_path: {
    title: string;
    current_step_id: string;
    next_step_id: string | null;
    dependency_note: string;
    steps: ExecutiveExecutionStepV1[];
    history: ExecutiveExecutionHistoryEntryV1[];
  };
  do_now: Array<{ id: string; label: string; state: ExecutiveActionStepStateV1; progress: number | null; detail: string }>;
  keegan_actions: Array<{ id: string; label: string; approval_state: ApprovalStateV1; detail: string }>;
  opportunities: ExecutiveCommandCenterOpportunityV1[];
  system_glance: Array<{ id: string; label: string; value: string; truth_state: ExecutiveCommandCenterTruthStateV1; source: string }>;
  intelligence_engine: Array<{ id: string; lane: string; status: string; truth_state: ExecutiveCommandCenterTruthStateV1 }>;
};

export type ExecutiveIntelligenceCardV1 = {
  id: string;
  section:
    | "WHAT_MATTERS_NOW"
    | "WHAT_CHANGED"
    | "DO_NOW_PREPARE_MONITOR"
    | "KEEGAN_ACTION_REQUIRED"
    | "TOP_OPPORTUNITIES"
    | "CURRENT_HYPOTHESES_EXPERIMENTS"
    | "LEARNING_SINCE_LAST_REVIEW"
    | "DATA_COVERAGE_GAPS";
  title: string;
  summary: string;
  state: IntelligenceStateV1;
  priority: IntelligencePriorityV1;
  confidence: ConfidenceV1;
  approval_state: ApprovalStateV1;
  freshness: FreshnessV1;
  specialist_domain: SpecialistDomainV1;
  why: string;
  evidence: string[];
  next_action: string;
};

export type ExecutiveHomeFixtureV1 = {
  generated_at: string;
  hero: {
    title: string;
    summary: string;
  };
  command_center: ExecutiveCommandCenterV1;
  cards: ExecutiveIntelligenceCardV1[];
  empty_state: string;
  loading_state: string;
  error_state: string;
};

export const EXECUTIVE_HOME_FIXTURE_V1: ExecutiveHomeFixtureV1 = {
  generated_at: "2026-08-17T00:00:00.000Z",
  hero: {
    title: "Executive Home",
    summary: "A light-first command surface for the few intelligence changes that matter now."
  },
  command_center: {
    generated_at: "2026-08-17T00:00:00.000Z",
    kpis: [
      { id: "material-change", label: "What changed", value: "1 material shift", detail: "Creative direction confidence moved after collector and institutional evidence.", trend: [1, 1, 2, 2, 3], truth_state: "KNOWN", last_updated: "2026-08-17T00:00:00.000Z", source: "Executive Home fixture" },
      { id: "automation-health", label: "Automation health", value: "On track", detail: "No approval-gated automation work is blocked in this fixture.", trend: [72, 78, 82, 84, 86], truth_state: "KNOWN", last_updated: "2026-08-17T00:00:00.000Z", source: "Operations fixture" },
      { id: "keegan-review", label: "Keegan review", value: "None required", detail: "Read-only recommendations only; no outreach, price, purchase, or publish approval is queued.", trend: [0, 0, 0, 0], truth_state: "KNOWN", last_updated: "2026-08-17T00:00:00.000Z", source: "Safety fixture" },
      { id: "data-health", label: "Data health", value: "UNKNOWN economics", detail: "Direct economics for prestige event concepts remain UNKNOWN rather than zero.", trend: [null, null, null], truth_state: "UNKNOWN", last_updated: null, source: "Evidence fixture" },
      { id: "engine-state", label: "Intelligence engine", value: "4 lanes visible", detail: "Strategy, evidence, operations, and learning lanes are visible without collapsing to one score.", trend: [4, 4, 4, 4], truth_state: "KNOWN", last_updated: "2026-08-17T00:00:00.000Z", source: "Executive Home fixture" }
    ],
    what_changed: [
      { id: "creative-confidence", label: "Creative confidence improved", value: "Version 2", why_it_matters: "The next move can stay narrow and premium instead of broadening into volume work.", trend: [1, 1, 2], truth_state: "KNOWN" },
      { id: "economic-gap", label: "Direct economics still missing", value: "UNKNOWN", why_it_matters: "Prestige/network value is useful, but it cannot be converted into fake dollars.", trend: [null, null, null], truth_state: "UNKNOWN" }
    ],
    strategy_path: {
      title: "Validate the premium collector-room path",
      current_step_id: "step-access-check",
      next_step_id: "step-room-fit",
      dependency_note: "Access check unlocks room-fit validation; nothing is auto-completed from inferred evidence.",
      steps: [
        { id: "step-access-check", label: "Confirm one credible access path", why_it_matters: "This keeps the move reversible before budget or public positioning changes.", state: "IN_PROGRESS", dependency_ids: [], unlocks_step_id: "step-room-fit", requires_verification: false, completed_at: null, provenance: "FIXTURE_PREVIEW" },
        { id: "step-room-fit", label: "Verify the room has the right buyers", why_it_matters: "The system needs buyer fit before treating prestige as near-term revenue.", state: "WAITING", dependency_ids: ["step-access-check"], unlocks_step_id: "step-small-test", requires_verification: true, completed_at: null, provenance: "FIXTURE_PREVIEW" },
        { id: "step-small-test", label: "Run the smallest prestige test", why_it_matters: "A small test creates evidence without committing the brand to a public campaign.", state: "NOT_STARTED", dependency_ids: ["step-room-fit"], unlocks_step_id: null, requires_verification: true, completed_at: null, provenance: "FIXTURE_PREVIEW" }
      ],
      history: []
    },
    do_now: [
      { id: "do-access-check", label: "Confirm one credible access path", state: "IN_PROGRESS", progress: 45, detail: "Current step in the strategy path." },
      { id: "do-economics", label: "Collect minimum economics", state: "NOT_STARTED", progress: null, detail: "Do not treat UNKNOWN economics as zero." }
    ],
    keegan_actions: [{ id: "no-approval-required", label: "No Keegan approval required", approval_state: "NONE", detail: "This implementation slice is read-only and fixture-backed." }],
    opportunities: [
      { id: "elite-network", title: "Elite network optionality", upside: "High qualitative upside", fit: "Strong brand fit", timing: "Prepare", effort: "Low-risk test", evidence: "UNKNOWN", next_move: "Validate access before financializing it.", detail_href: "#decision-private-collector-room" }
    ],
    system_glance: [
      { id: "projects", label: "Projects", value: "Known", truth_state: "KNOWN", source: "Executive Home fixture" },
      { id: "decisions", label: "Decisions", value: "1 drill-down", truth_state: "KNOWN", source: "Decision Room fixture" },
      { id: "memory", label: "Memory freshness", value: "UNKNOWN", truth_state: "UNKNOWN", source: "Fixture evidence" }
    ],
    intelligence_engine: [
      { id: "strategy", lane: "Strategy", status: "On track", truth_state: "KNOWN" },
      { id: "evidence", lane: "Evidence", status: "UNKNOWN economics", truth_state: "UNKNOWN" },
      { id: "operations", lane: "Operations", status: "No approval block", truth_state: "KNOWN" },
      { id: "learning", lane: "Learning", status: "Revision history visible", truth_state: "KNOWN" }
    ]
  },
  empty_state: "No material intelligence changes need attention right now.",
  loading_state: "Loading executive intelligence with provenance intact.",
  error_state: "Unable to verify executive intelligence. Do not treat unavailable data as zero.",
  cards: [
    {
      id: "matters-now-premium-scarcity",
      section: "WHAT_MATTERS_NOW",
      title: "Protect premium scarcity while choosing the next move",
      summary: "The strongest immediate lever is a narrow, high-prestige creative decision rather than a broad volume push.",
      state: "RECOMMENDATION",
      priority: "DO_NOW",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "STRATEGY",
      why: "This keeps Home focused on the highest-value strategic decision instead of a wall of metrics.",
      evidence: ["Strategy fixture: premium positioning priority", "Creative fixture: graphite path confidence is rising"],
      next_action: "Open the Decision Room for the next artwork/series choice."
    },
    {
      id: "changed-creative-direction",
      section: "WHAT_CHANGED",
      title: "Creative direction confidence changed",
      summary: "Graphite moved from KEEP_NOW toward DEVELOP_NEXT after material collector and institutional signals.",
      state: "FACT",
      priority: "PREPARE",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "CREATIVE",
      why: "Material evidence changed confidence; routine scans remain silent.",
      evidence: ["Creative Direction fixture: RecommendationVersion 2", "Evidence fixture: material first-party and institutional signals"],
      next_action: "Review the before/after recommendation version history."
    },
    {
      id: "triage-private-collector-room",
      section: "DO_NOW_PREPARE_MONITOR",
      title: "Validate one warm collector-room access path",
      summary: "Do the smallest validation step before building a full prestige-event concept.",
      state: "ACTION",
      priority: "DO_NOW",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "STRATEGY",
      why: "It buys option value without committing public positioning or budget.",
      evidence: ["Decision Room fixture: access path is biggest bottleneck"],
      next_action: "Ask: who can credibly get this into the right room?"
    },
    {
      id: "keegan-action-required-none",
      section: "KEEGAN_ACTION_REQUIRED",
      title: "No Keegan approval required in this fixture",
      summary: "No outreach, purchases, pricing, publishing, or production commitments are queued.",
      state: "FACT",
      priority: "MONITOR",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "OPERATIONS",
      why: "Executive Home should distinguish actual required action from passive awareness.",
      evidence: ["Safety fixture: read-only recommendation surfaces only"],
      next_action: "Keep monitoring for approval-gated actions."
    },
    {
      id: "top-opportunity-elite-network",
      section: "TOP_OPPORTUNITIES",
      title: "Elite network optionality is the highest-upside opportunity",
      summary: "Prestige/network upside is high, but direct economics remain UNKNOWN.",
      state: "INFERENCE",
      priority: "PREPARE",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "FINANCIAL",
      why: "The surface keeps qualitative strategic value separate from dollar estimates.",
      evidence: ["Strategic Advantage fixture: prestige network optionality", "Financial fixture: direct economics UNKNOWN"],
      next_action: "Validate access before treating it as a financial opportunity."
    },
    {
      id: "hypothesis-graphite-shortest-path",
      section: "CURRENT_HYPOTHESES_EXPERIMENTS",
      title: "Graphite remains the shortest prestige path",
      summary: "Hypothesis is stronger, but still tested through collector response and institutional-fit evidence.",
      state: "HYPOTHESIS",
      priority: "MONITOR",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "LEARNING",
      why: "Hypotheses should not be rendered as facts.",
      evidence: ["Learning fixture: material evidence increased but did not remove uncertainty"],
      next_action: "Track one focused experiment instead of multiplying media."
    },
    {
      id: "learning-noise-control",
      section: "LEARNING_SINCE_LAST_REVIEW",
      title: "Noise control prevented recommendation churn",
      summary: "A non-material market article did not change the creative recommendation.",
      state: "FACT",
      priority: "MONITOR",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "LEARNING",
      why: "This preserves trust: new information is not the same as material evidence.",
      evidence: ["Creative Direction fixture: noisy evidence produced no version change"],
      next_action: "Keep routine scans silent unless materiality changes."
    },
    {
      id: "coverage-gap-unknown-direct-economics",
      section: "DATA_COVERAGE_GAPS",
      title: "Direct economics for prestige event concepts remain UNKNOWN",
      summary: "Do not convert prestige or network value into dollars until direct evidence exists.",
      state: "UNKNOWN",
      priority: "PREPARE",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "EVIDENCE",
      why: "UNKNOWN must stay visually distinct from zero, stale, or healthy.",
      evidence: ["Financial/Strategic fixtures: direct economics missing"],
      next_action: "Collect minimum cost, buyer access, and timing facts."
    }
  ]
};

export function cardsBySection(section: ExecutiveIntelligenceCardV1["section"]) {
  return EXECUTIVE_HOME_FIXTURE_V1.cards.filter((card) => card.section === section);
}

export function advanceExecutiveStrategyStepV1(
  commandCenter: ExecutiveCommandCenterV1,
  stepId: string,
  changedAt: string,
  actor: "KEEGAN" | "SYSTEM" = "KEEGAN"
): ExecutiveCommandCenterV1 {
  const target = commandCenter.strategy_path.steps.find((step) => step.id === stepId);
  if (!target || target.state !== "IN_PROGRESS") return commandCenter;

  const nextStepId = target.unlocks_step_id;
  const updatedSteps = commandCenter.strategy_path.steps.map((step) => {
    if (step.id === stepId) {
      return { ...step, state: "COMPLETED" as const, completed_at: changedAt };
    }
    if (step.id === nextStepId && step.state === "WAITING") {
      return { ...step, state: step.requires_verification ? "NEEDS_VERIFICATION" as const : "IN_PROGRESS" as const };
    }
    return step;
  });
  const nextStep = updatedSteps.find((step) => step.id === nextStepId);

  return {
    ...commandCenter,
    strategy_path: {
      ...commandCenter.strategy_path,
      current_step_id: nextStep?.id ?? stepId,
      next_step_id: nextStep?.unlocks_step_id ?? null,
      steps: updatedSteps,
      history: [
        ...commandCenter.strategy_path.history,
        {
          step_id: stepId,
          from_state: target.state,
          to_state: "COMPLETED",
          changed_at: changedAt,
          actor,
          provenance: "EXPLICIT_USER_COMPLETION",
          note: nextStep?.requires_verification
            ? `${target.label} was explicitly marked complete; ${nextStep.label} now needs verification before it can be treated as complete.`
            : `${target.label} was explicitly marked complete; the next step is now visible.`
        }
      ]
    },
    do_now: commandCenter.do_now.map((item) =>
      item.id === "do-access-check"
        ? { ...item, state: "COMPLETED", progress: 100, detail: "Completed explicitly in the dashboard preview; history is preserved." }
        : item
    )
  };
}
