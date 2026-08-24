export type ExecutiveWorkspaceTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type ExecutiveWorkspaceFeedbackActionV1 =
  | "COMPLETE"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "NEEDS_VERIFICATION"
  | "APPROVE"
  | "REJECT"
  | "DEFER"
  | "NOT_INTERESTED"
  | "CONTACTED"
  | "RESPONSE_RECEIVED"
  | "MEETING_HELD"
  | "CORRECT"
  | "INCORRECT"
  | "ADD_CONTEXT";

export type ExecutiveWorkspaceDomainV1 =
  | "EXECUTIVE_HOME"
  | "STRATEGY"
  | "OPPORTUNITIES_ACTIONS"
  | "RELATIONSHIPS_CRM"
  | "EVENTS_MARKET_WINDOWS"
  | "SPECIALISTS"
  | "LEARNING"
  | "DATA_EVIDENCE"
  | "ASK_JEEVES";

export type ExecutiveEntityRouteKindV1 =
  | "person"
  | "organization"
  | "opportunity"
  | "event"
  | "project"
  | "decision"
  | "action"
  | "metric"
  | "artwork"
  | "experiment"
  | "relationship"
  | "source-evidence";

export type ExecutiveWorkspaceNavItemV1 = {
  id: ExecutiveWorkspaceDomainV1;
  label: string;
  href: string;
  short_label: string;
  summary: string;
  owns: string[];
};

export type ExecutiveWorkspaceCardV1 = {
  id: string;
  title: string;
  state: ExecutiveWorkspaceTruthStateV1;
  what_matters: string;
  why: string;
  next: string;
  detail_href: string;
  owner: "SYSTEM" | "KEEGAN" | "SHARED";
};

export type ExecutiveWorkspaceViewModelV1 = {
  contract_version: "executive_workspace_ia_v1";
  workspace: ExecutiveWorkspaceNavItemV1;
  headline: string;
  description: string;
  primary_question: string;
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    cards: ExecutiveWorkspaceCardV1[];
  }>;
  entity_routes: Array<{ kind: ExecutiveEntityRouteKindV1; href_pattern: string; label: string }>;
  feedback_actions: ExecutiveWorkspaceFeedbackActionV1[];
  evidence_policy: {
    hides_low_level_ingestion_noise: true;
    unknown_stale_conflicted_remain_explicit: true;
    no_duplicate_truth_store: true;
    canonical_state_updates_preserve_history: true;
  };
};

export const EXECUTIVE_WORKSPACE_NAV_V1: ExecutiveWorkspaceNavItemV1[] = [
  {
    id: "EXECUTIVE_HOME",
    label: "Executive Home",
    short_label: "Home",
    href: "/dashboard",
    summary: "Concise command-center overview: what changed, what matters, what needs Keegan, and where to go deeper.",
    owns: ["daily brief", "top priorities", "decision inbox", "system health"]
  },
  {
    id: "STRATEGY",
    label: "Strategy",
    short_label: "Strategy",
    href: "/strategy",
    summary: "Target state, current path, ordered steps, bottlenecks, bets, alternatives, and what to ignore.",
    owns: ["target state", "trajectory", "major bets", "counterfactuals", "revision history"]
  },
  {
    id: "OPPORTUNITIES_ACTIONS",
    label: "Opportunities & Actions",
    short_label: "Actions",
    href: "/opportunities-actions",
    summary: "Active opportunities and execution queue with owner, urgency, effort, dependencies, and audit-safe controls.",
    owns: ["opportunities", "action queue", "approvals", "defer/waiting", "completion audit"]
  },
  {
    id: "RELATIONSHIPS_CRM",
    label: "Relationships / CRM",
    short_label: "CRM",
    href: "/relationships",
    summary: "Priority people, organizations, cultural power map, warm paths, commitments, and follow-up windows.",
    owns: ["people", "organizations", "introducers", "gatekeepers", "active asks"]
  },
  {
    id: "EVENTS_MARKET_WINDOWS",
    label: "Events & Market Windows",
    short_label: "Events",
    href: "/events-market-windows",
    summary: "Events worth attending, access routes, planning windows, target attendees, effort, and outcomes.",
    owns: ["events", "market windows", "access routes", "encounter objectives", "follow-up"]
  },
  {
    id: "SPECIALISTS",
    label: "Specialists",
    short_label: "Specialists",
    href: "/specialists",
    summary: "Shared specialist workspace for finance, revenue, PR, market, creative, partnerships, risk, and weak signals.",
    owns: ["financial", "commerce", "media/PR", "creative", "partnerships", "risk", "weak signals"]
  },
  {
    id: "LEARNING",
    label: "Learning",
    short_label: "Learning",
    href: "/learning",
    summary: "Predictions, actions taken or rejected, outcomes, calibration, lessons, and changed recommendations.",
    owns: ["predictions", "outcomes", "attribution", "calibration", "policy changes"]
  },
  {
    id: "DATA_EVIDENCE",
    label: "Data & Evidence",
    short_label: "Evidence",
    href: "/data-evidence",
    summary: "Coverage, freshness, provenance, conflicts, memory evidence, and highest-value missing information.",
    owns: ["source coverage", "freshness", "provenance", "conflicts", "business memory"]
  },
  {
    id: "ASK_JEEVES",
    label: "Ask Jeeves / Search",
    short_label: "Ask",
    href: "/ask-jeeves",
    summary: "Global natural-language access with deep links to records and preserved context/provenance.",
    owns: ["search", "natural-language answers", "deep links", "conversation context"]
  }
];

export const EXECUTIVE_ENTITY_ROUTES_V1: ExecutiveWorkspaceViewModelV1["entity_routes"] = [
  { kind: "person", href_pattern: "/relationships/person/[id]", label: "Person" },
  { kind: "organization", href_pattern: "/relationships/organization/[id]", label: "Organization" },
  { kind: "opportunity", href_pattern: "/opportunities-actions/opportunity/[id]", label: "Opportunity" },
  { kind: "event", href_pattern: "/events-market-windows/event/[id]", label: "Event" },
  { kind: "project", href_pattern: "/strategy/project/[id]", label: "Project" },
  { kind: "decision", href_pattern: "/strategy/decision/[id]", label: "Decision" },
  { kind: "action", href_pattern: "/opportunities-actions/action/[id]", label: "Action" },
  { kind: "metric", href_pattern: "/data-evidence/metric/[id]", label: "Metric" },
  { kind: "artwork", href_pattern: "/specialists/creative/artwork/[id]", label: "Artwork / product" },
  { kind: "experiment", href_pattern: "/learning/experiment/[id]", label: "Experiment" },
  { kind: "relationship", href_pattern: "/relationships/relationship/[id]", label: "Relationship" },
  { kind: "source-evidence", href_pattern: "/data-evidence/source/[id]", label: "Source / evidence" }
];

export const EXECUTIVE_FEEDBACK_ACTIONS_V1: ExecutiveWorkspaceFeedbackActionV1[] = [
  "COMPLETE",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "NEEDS_VERIFICATION",
  "APPROVE",
  "REJECT",
  "DEFER",
  "NOT_INTERESTED",
  "CONTACTED",
  "RESPONSE_RECEIVED",
  "MEETING_HELD",
  "CORRECT",
  "INCORRECT",
  "ADD_CONTEXT"
];

const workspaceCards: Record<ExecutiveWorkspaceDomainV1, ExecutiveWorkspaceViewModelV1["sections"]> = {
  EXECUTIVE_HOME: [
    {
      id: "home-overview",
      title: "Decision-ready overview",
      summary: "Home stays capped to the highest-value changes and sends depth to owning workspaces.",
      cards: [
        {
          id: "home-daily-brief",
          title: "Daily brief, not an alert feed",
          state: "KNOWN",
          what_matters: "Only material changes, required decisions, risks, opportunities, and completed work should surface.",
          why: "Attention is the scarce resource. Routine ingestion and telemetry stay hidden unless they affect trust or action.",
          next: "Open Strategy or Opportunities & Actions when a Home card needs depth.",
          detail_href: "/dashboard#WHAT_MATTERS_NOW",
          owner: "SYSTEM"
        }
      ]
    }
  ],
  STRATEGY: [
    {
      id: "strategy-path",
      title: "Now / next / later path",
      summary: "Ordered strategic steps with dependencies, bottlenecks, revision history, and what to ignore.",
      cards: [
        {
          id: "strategy-premium-path",
          title: "Premium collector-room path",
          state: "INFERRED",
          what_matters: "Current step is access validation; the room-fit step remains waiting until the access check is explicit.",
          why: "This keeps a high-upside bet reversible and prevents public commitment before evidence is strong enough.",
          next: "Complete only the eligible current step through the approval-safe action model.",
          detail_href: "/strategy/decision/premium-collector-room",
          owner: "SHARED"
        },
        {
          id: "strategy-ignore-volume",
          title: "Ignore volume-led growth",
          state: "KNOWN",
          what_matters: "The strategy workspace preserves what to ignore instead of letting every channel compete for attention.",
          why: "Premium scarcity is damaged by low-signal volume work.",
          next: "Keep low-prestige growth ideas behind the strategy ignore lane.",
          detail_href: "/strategy/project/premium-scarcity",
          owner: "SYSTEM"
        }
      ]
    }
  ],
  OPPORTUNITIES_ACTIONS: [
    {
      id: "execution-queue",
      title: "Decision inbox and execution queue",
      summary: "Owner, urgency, effort, timing, dependency, state, and history are visible before any completion.",
      cards: [
        {
          id: "actions-needs-me",
          title: "Needs me",
          state: "KNOWN",
          what_matters: "Keegan-owned approvals are separated from system-owned preparation.",
          why: "A decision inbox prevents passive awareness from looking like required action.",
          next: "Use APPROVE, REJECT, DEFER, WAITING, or ADD_CONTEXT with actor/timestamp/reason preserved.",
          detail_href: "/opportunities-actions?actionView=needs-me",
          owner: "KEEGAN"
        },
        {
          id: "actions-high-upside",
          title: "High upside, low-risk test",
          state: "UNKNOWN",
          what_matters: "Qualitative upside can be compared without fake precision.",
          why: "UNKNOWN economics are not zero, and missing evidence should change the next move rather than disappear.",
          next: "Open the opportunity detail for evidence, assumptions, alternatives, downside, and revision history.",
          detail_href: "/opportunities-actions/opportunity/elite-network-optionality",
          owner: "SHARED"
        }
      ]
    }
  ],
  RELATIONSHIPS_CRM: [
    {
      id: "relationship-map",
      title: "Cultural power map",
      summary: "People, organizations, warm paths, gatekeepers, commitments, and follow-up windows.",
      cards: [
        {
          id: "crm-warm-path",
          title: "Warm path before cold outreach",
          state: "INFERRED",
          what_matters: "Relationships are navigated by introducers, gatekeepers, and encounter objectives.",
          why: "A premium fine-art brand should protect social capital and avoid low-status outreach patterns.",
          next: "Open person or organization details before creating an ask.",
          detail_href: "/relationships/person/priority-introducer",
          owner: "SHARED"
        }
      ]
    }
  ],
  EVENTS_MARKET_WINDOWS: [
    {
      id: "event-windows",
      title: "Event and market timing",
      summary: "Worth attending, access route, target attendees, capacity, follow-up, and outcome closure.",
      cards: [
        {
          id: "event-planning-window",
          title: "Planning window before attendance",
          state: "UNKNOWN",
          what_matters: "Event value stays UNKNOWN until access, attendee fit, and capacity are credible.",
          why: "Attendance without a target encounter objective turns time into noise.",
          next: "Open event detail and verify access route before recommending travel or spend.",
          detail_href: "/events-market-windows/event/prestige-window",
          owner: "SYSTEM"
        }
      ]
    }
  ],
  SPECIALISTS: [
    {
      id: "specialist-lanes",
      title: "Shared specialist template",
      summary: "Domain views use one pattern while preserving finance, commerce, PR, creative, market, risk, and weak-signal differences.",
      cards: [
        {
          id: "specialist-creative",
          title: "Creative Direction",
          state: "KNOWN",
          what_matters: "Creative evidence has a workspace; Home only shows the material change.",
          why: "Specialist detail should not stretch Executive Home into a long feed.",
          next: "Open the creative specialist lane for roadmap, revision, and concept studies.",
          detail_href: "/creative-direction",
          owner: "SYSTEM"
        },
        {
          id: "specialist-finance",
          title: "Financial intelligence",
          state: "UNKNOWN",
          what_matters: "Direct economics are visible as UNKNOWN until supported.",
          why: "Prestige and network value must not be fake-dollarized.",
          next: "Use financial lane detail when economics materially affect a decision.",
          detail_href: "/specialists/financial",
          owner: "SYSTEM"
        }
      ]
    }
  ],
  LEARNING: [
    {
      id: "learning-loop",
      title: "Outcome closure and calibration",
      summary: "Predictions, actions taken or rejected, outcomes, lessons, and changed recommendations.",
      cards: [
        {
          id: "learning-outcome-closure",
          title: "Close stale actions with an outcome",
          state: "INFERRED",
          what_matters: "Open actions should ask what happened instead of staying open forever.",
          why: "Learning depends on outcome memory, attribution confidence, and correction safety.",
          next: "Record COMPLETE, INCORRECT, or ADD_CONTEXT with provenance when an outcome is known.",
          detail_href: "/learning/experiment/collector-room-validation",
          owner: "SHARED"
        }
      ]
    }
  ],
  DATA_EVIDENCE: [
    {
      id: "evidence-trust",
      title: "Evidence trust and gaps",
      summary: "Coverage, freshness, provenance, conflicts, memory evidence, and highest-value missing facts.",
      cards: [
        {
          id: "evidence-unknowns",
          title: "UNKNOWN, STALE, and CONFLICTED stay visible",
          state: "UNKNOWN",
          what_matters: "Missing direct economics, stale sources, and conflicts remain explicit.",
          why: "Low-level ingestion detail stays hidden, but evidence state must affect trust and decisions.",
          next: "Open source/evidence detail when a gap materially affects the recommendation.",
          detail_href: "/data-evidence/source/direct-economics",
          owner: "SYSTEM"
        }
      ]
    }
  ],
  ASK_JEEVES: [
    {
      id: "ask-global",
      title: "Global answer surface",
      summary: "Natural-language access with deep links to records and preserved conversation provenance.",
      cards: [
        {
          id: "ask-context",
          title: "Ask with provenance",
          state: "KNOWN",
          what_matters: "Answers should deep-link to the person, opportunity, evidence, metric, decision, or action underneath.",
          why: "Search is useful only when it preserves source context and does not become a second truth store.",
          next: "Use Ask Jeeves to find the record, then act in the owning workspace.",
          detail_href: "/ask-jeeves?q=why-this",
          owner: "KEEGAN"
        }
      ]
    }
  ]
};

export function getExecutiveWorkspaceByHrefV1(href: string): ExecutiveWorkspaceViewModelV1 {
  const workspace = EXECUTIVE_WORKSPACE_NAV_V1.find((item) => item.href === href);
  if (!workspace) throw new Error(`Unknown executive workspace href: ${href}`);

  return {
    contract_version: "executive_workspace_ia_v1",
    workspace,
    headline: workspace.label,
    description: workspace.summary,
    primary_question: primaryQuestionFor(workspace.id),
    sections: workspaceCards[workspace.id],
    entity_routes: EXECUTIVE_ENTITY_ROUTES_V1,
    feedback_actions: EXECUTIVE_FEEDBACK_ACTIONS_V1,
    evidence_policy: {
      hides_low_level_ingestion_noise: true,
      unknown_stale_conflicted_remain_explicit: true,
      no_duplicate_truth_store: true,
      canonical_state_updates_preserve_history: true
    }
  };
}

function primaryQuestionFor(id: ExecutiveWorkspaceDomainV1): string {
  const questions: Record<ExecutiveWorkspaceDomainV1, string> = {
    EXECUTIVE_HOME: "What matters, why, and where should I go deeper?",
    STRATEGY: "Are we on the right path, and what unlocks the next step?",
    OPPORTUNITIES_ACTIONS: "What should happen now, who owns it, and what decision is required?",
    RELATIONSHIPS_CRM: "Who matters, what is the warm path, and what commitment is active?",
    EVENTS_MARKET_WINDOWS: "Which windows are worth attention, and what access must be true?",
    SPECIALISTS: "What does each specialist know that materially changes a decision?",
    LEARNING: "What did we predict, what happened, and what should change?",
    DATA_EVIDENCE: "Can we trust the evidence, and what missing fact would change the decision?",
    ASK_JEEVES: "What do you need to find, explain, or trace back to evidence?"
  };
  return questions[id];
}
