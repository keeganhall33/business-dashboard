export type WorkspaceIdV1 = "home" | "strategy" | "opportunities" | "specialists" | "relationships" | "financial" | "learning" | "data-evidence" | "decision-rooms" | "ask-jeeves";
export type ConversationInputClassificationV1 = "QUESTION_ONLY" | "HYPOTHETICAL" | "HUMAN_REPORTED_FACT" | "HUMAN_JUDGMENT" | "CORRECTION" | "DECISION";
export type VoiceControlStateV1 = "IDLE" | "LISTENING_MOCK" | "TRANSCRIPT_READY" | "DISABLED_UNSUPPORTED";

export type IntelligenceWorkspaceNavItemV1 = {
  id: WorkspaceIdV1;
  label: string;
  compactLabel: string;
  purpose: string;
  priority: "primary" | "workspace" | "deep";
};

export type AskJeevesControlV1 = {
  id: string;
  scope: "GLOBAL" | "DECISION_CONTEXT";
  placeholder: string;
  voice_state: VoiceControlStateV1;
  supported_classifications: ConversationInputClassificationV1[];
  transcript: string;
  spoken_answer: string;
  written_answer: string;
  memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION" | "READ_ONLY_FIXTURE";
};

export type DecisionRoomFixtureV1 = {
  decision_id: string;
  title: string;
  breadcrumb: string[];
  recommendation_summary: string;
  strategic_question: string;
  decision_state: "OPEN" | "RECOMMENDED" | "DEFERRED";
  primary_action: string;
  contextual_ask: AskJeevesControlV1;
  written_answer_sections: Array<{ heading: string; body: string }>;
  evidence: Array<{ id: string; label: string; detail: string }>;
  assumptions: Array<{ id: string; label: string; status: "KNOWN" | "UNKNOWN" | "NEEDS_REVIEW" }>;
};

export type ResponsiveShellFixtureV1 = {
  nav: IntelligenceWorkspaceNavItemV1[];
  home: {
    title: string;
    changed_since_last_review: string[];
    priority_cards: Array<{ id: string; label: string; summary: string; workspace_id: WorkspaceIdV1; decision_room_id: string; next_step_label: string }>;
  };
  global_ask: AskJeevesControlV1;
  decision_rooms: DecisionRoomFixtureV1[];
  responsive_behavior: { mobile: string[]; desktop: string[] };
};

const classifications: ConversationInputClassificationV1[] = ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"];

export const INTELLIGENCE_UX_SHELL_FIXTURE_V1: ResponsiveShellFixtureV1 = {
  nav: [
    { id: "home", label: "Executive Command Center", compactLabel: "Home", purpose: "Morning briefing and highest-leverage changes.", priority: "primary" },
    { id: "strategy", label: "Strategy", compactLabel: "Strategy", purpose: "Strategic analysis and recommendation detail.", priority: "workspace" },
    { id: "opportunities", label: "Opportunities / Actions", compactLabel: "Actions", purpose: "Recommendation triage and eligible approve/reject/defer actions.", priority: "workspace" },
    { id: "specialists", label: "Specialists", compactLabel: "Specialists", purpose: "Specialist disagreement surfaces.", priority: "workspace" },
    { id: "relationships", label: "Relationships", compactLabel: "Relationships", purpose: "Relationship graph and context.", priority: "workspace" },
    { id: "financial", label: "Financial", compactLabel: "Financial", purpose: "Financial/project economics and runway context.", priority: "workspace" },
    { id: "learning", label: "Learning", compactLabel: "Learning", purpose: "Outcome learning and revision history.", priority: "workspace" },
    { id: "data-evidence", label: "Data / Evidence", compactLabel: "Evidence", purpose: "Provenance, assumptions, and source confidence.", priority: "workspace" },
    { id: "decision-rooms", label: "Decision Rooms", compactLabel: "Rooms", purpose: "Deep decision analysis.", priority: "deep" },
    { id: "ask-jeeves", label: "Ask Jeeves", compactLabel: "Ask", purpose: "Persistent voice/text control surface.", priority: "primary" }
  ],
  home: {
    title: "Executive Command Center",
    changed_since_last_review: ["One strategy recommendation moved from summary to Decision Room review.", "Evidence coverage is sufficient for a first-pass written answer, but assumptions remain visible."],
    priority_cards: [{ id: "private-collector-room", label: "Private collector room concept", summary: "Prestige upside is strong, direct economics remain uncertain, and the next move is a narrow access validation.", workspace_id: "strategy", decision_room_id: "decision-private-collector-room", next_step_label: "Open Decision Room" }]
  },
  global_ask: { id: "global-ask-jeeves", scope: "GLOBAL", placeholder: "Ask Jeeves about strategy, evidence, or what changed...", voice_state: "IDLE", supported_classifications: classifications, transcript: "", spoken_answer: "Concise answer available after a question.", written_answer: "Full structured answer remains visible here after voice or text input.", memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION" },
  decision_rooms: [{
    decision_id: "decision-private-collector-room",
    title: "Decision Room: private collector room concept",
    breadcrumb: ["Home", "Strategy", "Private collector room", "Decision Room"],
    recommendation_summary: "Validate access before investing in a full prestige-event concept.",
    strategic_question: "Does this create durable advantage or just another speculative event idea?",
    decision_state: "RECOMMENDED",
    primary_action: "Validate one warm route into the host or sponsor ecosystem before building the full concept.",
    contextual_ask: { id: "contextual-ask-private-collector-room", scope: "DECISION_CONTEXT", placeholder: "Ask about this decision...", voice_state: "LISTENING_MOCK", supported_classifications: classifications, transcript: "What evidence would change this recommendation?", spoken_answer: "A verified sponsor path or buyer access would strengthen it; no access path would weaken it.", written_answer: "The recommendation changes if a credible host, sponsor, or collector access path is verified. It weakens if the opportunity only offers public exposure without decision-maker access.", memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION" },
    written_answer_sections: [{ heading: "Summary", body: "The advantage comes from prestige and network optionality, not proven direct economics." }, { heading: "Explanation", body: "This belongs in a Decision Room because the next action depends on evidence quality, assumptions, and access path verification." }, { heading: "Specialist analysis", body: "Strategy favors a small validation step; finance does not yet treat the upside as known revenue." }],
    evidence: [{ id: "ev-access", label: "Access path", detail: "Warm route is unverified and must be validated before a full concept." }, { id: "ev-prestige", label: "Prestige fit", detail: "Private collector context aligns with scarcity and premium positioning." }],
    assumptions: [{ id: "as-direct-economics", label: "Direct economics", status: "UNKNOWN" }, { id: "as-memory-write", label: "Ambiguous voice statements do not write to memory", status: "KNOWN" }]
  }],
  responsive_behavior: {
    mobile: ["Home prioritizes briefing, change summary, voice capture, triage, and compact Decision Room summary.", "Deep evidence and assumptions are expandable below the written answer."],
    desktop: ["Desktop uses persistent workspace rail, reading-width analysis, side panels for Ask Jeeves, evidence, and assumptions.", "Decision Rooms carry full breadcrumb orientation and deep inspection surfaces."]
  }
};
