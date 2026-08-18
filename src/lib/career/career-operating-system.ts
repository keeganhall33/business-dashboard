export type CareerLane = "REVENUE" | "RELATIONSHIP" | "AUDIENCE" | "CAREER" | "OWNED_FUTURE";
export type CareerFeedbackState = "DONE_WAITING" | "DONE_RESULT" | "BLOCKED" | "SKIPPED";
export type CareerResult = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNKNOWN";
export type CareerFeedbackMode = "IMMEDIATE" | "DELAYED";
export type CareerGateMode = "EXECUTION" | "OUTCOME";

export type CareerActionDefinition = {
  id: string;
  phaseId: string;
  lane: CareerLane;
  order: number;
  title: string;
  description: string;
  why: string;
  doneWhen: string;
  feedbackMode: CareerFeedbackMode;
  gateMode: CareerGateMode;
  reviewAfterDays: number;
};

export type CareerPhaseDefinition = {
  id: string;
  number: number;
  title: string;
  objective: string;
};

export type CareerOutcomeRow = {
  id?: string;
  title?: string | null;
  summary?: string | null;
  happened_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CareerActionStatus = "READY" | "WAITING" | "COMPLETE" | "BLOCKED" | "ADJUST" | "SKIPPED";

export type CareerMove = CareerActionDefinition & {
  status: CareerActionStatus;
  latestNote: string | null;
  latestResult: CareerResult | null;
  lastRecordedAt: string | null;
  followUpAt: string | null;
};

export type CareerPhaseProgress = CareerPhaseDefinition & {
  completed: number;
  total: number;
  percent: number;
  state: "COMPLETE" | "CURRENT" | "FUTURE";
};

export type CareerOperatingSystemSnapshot = {
  generatedAt: string;
  currentPhase: CareerPhaseDefinition;
  phaseCompletionPercent: number;
  primaryBottleneck: string;
  todayMoves: CareerMove[];
  awaitingResults: CareerMove[];
  phaseRoadmap: CareerPhaseProgress[];
  lastFeedbackAt: string | null;
  loop: string[];
};

export const CAREER_PHASES: CareerPhaseDefinition[] = [
  {
    id: "foundation-transition",
    number: 1,
    title: "Foundation Transition",
    objective: "Protect current revenue while installing the systems that make the career deliberate, measurable, and repeatable."
  },
  {
    id: "identity",
    number: 2,
    title: "Identity",
    objective: "Develop a visual language and collector proposition that are recognizably Keegan Hall, not merely technically excellent."
  },
  {
    id: "cultural-relevance",
    number: 3,
    title: "Cultural Relevance",
    objective: "Replace spike-and-collapse attention with repeatable cultural moments, stronger distribution, and deeper power-network access."
  },
  {
    id: "scarcity",
    number: 4,
    title: "Scarcity",
    objective: "Use demonstrated demand to become more selective, more collectible, and less dependent on low-leverage volume."
  },
  {
    id: "ownership",
    number: 5,
    title: "Ownership",
    objective: "Shift economic value from labor and borrowed IP toward owned IP, recurring properties, royalties, and capital deployment."
  },
  {
    id: "institution",
    number: 6,
    title: "Institution",
    objective: "Build Keegan Hall into a durable cultural institution that compounds beyond the artist's available hours."
  }
];

export const CAREER_ACTIONS: CareerActionDefinition[] = [
  // Phase 1 — Foundation Transition
  action("p1-revenue-collector-positioning", "foundation-transition", "REVENUE", 1,
    "Make the $395 edition unmistakably collectible",
    "Separate the $395 offer from the $75 print by proposition, not just paper quality. Clarify the 100-copy production limit, presentation, provenance, certificate, and permanence of the format.",
    "The current two-price architecture is only confusing if both products feel like the same print.",
    "The product page clearly explains why the Collector Edition exists, why only 100 will be produced, and what the buyer receives that is materially different from the $75 product.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-revenue-collector-test", "foundation-transition", "REVENUE", 2,
    "Run a real Collector Edition launch test",
    "Promote one $395 Collector Edition through a defined email/social/retargeting launch instead of judging demand from an unpromoted product page.",
    "Zero sales without a real launch is not a useful market signal.",
    "A documented launch runs with audience, dates, traffic, units sold, revenue, and conversion captured for review.",
    "DELAYED", "OUTCOME", 14),
  action("p1-relationship-power-map", "foundation-transition", "RELATIONSHIP", 1,
    "Activate the 100-person Cultural Power Map",
    "Restore the existing target list into the operating system and select the first 20 relationships to actively manage based on access, leverage, fit, and relationship equity.",
    "A target list only becomes valuable when it drives specific introductions, gifts, reconnects, and room-access moves.",
    "Twenty people have a current relationship state, best access path, next move, and next-touch timing.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-relationship-first-moves", "foundation-transition", "RELATIONSHIP", 2,
    "Execute the first five power-network moves",
    "Use the highest-leverage mix of warm introductions, reconnects, value-giving, gifts, and event pathways. Do not default to cold outreach.",
    "Relationship equity compounds only when the map produces real interactions.",
    "Five targeted relationship actions are executed and each has a recorded outcome or follow-up date.",
    "DELAYED", "OUTCOME", 14),
  action("p1-audience-heartbeat", "foundation-transition", "AUDIENCE", 1,
    "Restart the content heartbeat",
    "Return to a sustainable 4–5 useful posts per week before optimizing toward higher frequency. Use process, impossible detail, story, archive, reveal, cultural proof, and commerce as repeatable content types.",
    "Going silent between major projects creates the spike-and-collapse cycle.",
    "At least four quality posts are published within seven days without requiring Keegan to become a full-time editor.",
    "DELAYED", "OUTCOME", 7),
  action("p1-audience-content-system", "foundation-transition", "AUDIENCE", 2,
    "Install the one-artwork content package",
    "Create a capture checklist so each major artwork automatically produces vertical clips, progress frames, macro details, reveal assets, story material, and commerce assets.",
    "One drawing should create weeks of distribution rather than one post.",
    "A reusable capture-and-repurpose checklist exists and is used on the next active artwork.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-career-gift-system", "foundation-transition", "CAREER", 1,
    "Create the Studio Gift system",
    "Define a non-retail Studio Gift or Studio Proof format, presentation standard, letter template, and Tier A/B gifting rules so gifting creates relationship value without cheapening the public Collector Edition.",
    "Strategic gifts can create elite-network word of mouth, but indiscriminate free retail product can weaken perceived value.",
    "The gift format, packaging, qualification rules, and first five candidate recipients are defined.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-career-room-playbook", "foundation-transition", "CAREER", 2,
    "Install the room-access and Encounter Card playbook",
    "For priority events, track host/sponsor/access paths, expected targets, introducers, the three things each target should remember, and the follow-up move.",
    "Merely attending important events is low leverage; engineered access and prepared encounters are high leverage.",
    "A reusable event-access template and Encounter Card exist and are populated for the next priority room or event.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-owned-concepts", "foundation-transition", "OWNED_FUTURE", 1,
    "Generate 20–30 literal owned-art concepts",
    "Translate themes such as pressure, flight, obsession, legacy, sacrifice, time, and victory into actual compositions using the formula: hyperreal reality + one impossible physical phenomenon + one human truth.",
    "The owned-IP transition cannot advance through themes alone; it needs images only Keegan would make.",
    "At least 20 concrete compositions exist, with five selected for deeper development.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p1-owned-first-study", "foundation-transition", "OWNED_FUTURE", 2,
    "Produce the first serious visual-language study",
    "Take the strongest owned concept far enough to test whether the visual mechanism feels distinctive, emotionally legible, and compatible with Keegan's graphite mastery.",
    "A finished study creates evidence that brainstorming cannot.",
    "One serious study is completed and reviewed against distinctiveness, emotional clarity, collector potential, and desire to make more work in the language.",
    "DELAYED", "OUTCOME", 7),

  // Phase 2 — Identity
  action("p2-revenue-premium-architecture", "identity", "REVENUE", 1,
    "Validate the premium product architecture",
    "Use real sales data to decide which work belongs in accessible archive editions, Collector Editions, prestige editions, and originals.",
    "Pricing should follow buyer behavior and positioning evidence, not arbitrary gaps.",
    "The product ladder has documented rules and at least one premium offer has validated demand.",
    "DELAYED", "OUTCOME", 30),
  action("p2-relationship-identity-validation", "identity", "RELATIONSHIP", 1,
    "Get high-quality identity feedback",
    "Show the strongest owned visual-language work to a small set of trusted collectors, cultural operators, curators, and sophisticated creative peers.",
    "The goal is not consensus; it is evidence about memorability, meaning, and market fit.",
    "At least five high-quality reactions are captured and synthesized into what to keep, change, or reject.",
    "DELAYED", "OUTCOME", 14),
  action("p2-audience-visual-story", "identity", "AUDIENCE", 1,
    "Teach the audience the new visual language",
    "Publish the concept, process, symbolism, and evolution of the new work so the audience learns to recognize the mechanism, not just the subject.",
    "Recognition compounds when the audience understands what to look for.",
    "A multi-post story arc has introduced the visual language and audience response is recorded.",
    "DELAYED", "OUTCOME", 14),
  action("p2-career-three-signature-works", "identity", "CAREER", 1,
    "Complete three signature works",
    "Create a small body of owned work that demonstrates the visual language across more than one idea or composition.",
    "One successful image can be accidental; three begin to establish authorship.",
    "Three finished works feel related, distinctive, and strong enough to show as a new chapter of the career.",
    "DELAYED", "OUTCOME", 30),
  action("p2-owned-language-rules", "identity", "OWNED_FUTURE", 1,
    "Codify the Keegan visual-language rules",
    "Document the recurring visual mechanisms, compositional principles, graphite treatment, emotional territory, and what is explicitly off-brand.",
    "A recognizable language needs constraints that can guide future work without becoming formulaic.",
    "A concise creative-direction standard can evaluate whether a proposed work is unmistakably inside or outside the new language.",
    "IMMEDIATE", "EXECUTION", 0),

  // Phase 3 — Cultural Relevance
  action("p3-revenue-tentpole-economics", "cultural-relevance", "REVENUE", 1,
    "Attach economics to the tentpole calendar",
    "Give every major cultural project a revenue path, collector path, licensing path, or deliberate prestige-only rationale before resources are committed.",
    "Cultural relevance should compound the business rather than repeatedly consume cash and time.",
    "The next four tentpoles each have an explicit economic or career-capital model.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p3-relationship-tier1-25", "cultural-relevance", "RELATIONSHIP", 1,
    "Build 25 strong Tier-1 relationships",
    "Deepen the highest-leverage cultural, gatekeeper, connector, collector, and capital relationships until there is genuine two-way familiarity and a natural reason to stay in touch.",
    "Ten thousand weak contacts cannot replace a small number of people who actively want to help.",
    "Twenty-five Tier-1 relationships meet the dashboard's warm/strong relationship standard.",
    "DELAYED", "OUTCOME", 90),
  action("p3-audience-cultural-calendar", "cultural-relevance", "AUDIENCE", 1,
    "Run a 12-month cultural and content calendar",
    "Plan four tentpole moments, monthly secondary moments, and connective storytelling between them.",
    "A planned cadence prevents public awareness from collapsing between breakthroughs.",
    "The next 12 months contain four tentpoles plus monthly secondary moments with lead times and content arcs.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p3-career-distribution-partner", "cultural-relevance", "CAREER", 1,
    "Secure a major distribution or cultural amplifier",
    "Create at least one collaboration where a major brand, institution, media platform, league, or cultural operator materially expands reach and status.",
    "The next ceiling is not drawing quality; it is distribution and association at scale.",
    "One high-leverage partner has committed meaningful distribution, access, or institutional validation.",
    "DELAYED", "OUTCOME", 90),
  action("p3-owned-high-profile-integration", "cultural-relevance", "OWNED_FUTURE", 1,
    "Integrate the signature language into a high-profile moment",
    "When rights and fit allow, combine the owned visual mechanism with a culturally important sports or entertainment project.",
    "This bridges existing fame-network credibility with owned authorship.",
    "One high-profile project is recognized for the Keegan visual idea, not only its celebrity subject.",
    "DELAYED", "OUTCOME", 60),

  // Phase 4 — Scarcity
  action("p4-revenue-demand-thresholds", "scarcity", "REVENUE", 1,
    "Use demand thresholds to raise prices",
    "Define evidence-based triggers for original pricing, edition pricing, commission selectivity, and retirement rather than raising prices for appearance alone.",
    "Real scarcity works when demand supports it.",
    "Pricing and supply rules include measurable triggers and have been applied to at least one offer.",
    "DELAYED", "OUTCOME", 30),
  action("p4-relationship-collector-priority", "scarcity", "RELATIONSHIP", 1,
    "Create collector priority access",
    "Build a collector priority or waitlist mechanism for important originals and editions.",
    "Scarcity is more powerful when the best collectors have a structured path to access rather than random availability.",
    "Priority collectors are identified and the access process is operating.",
    "IMMEDIATE", "EXECUTION", 0),
  action("p4-audience-retirement-story", "scarcity", "AUDIENCE", 1,
    "Communicate the archive-to-scarcity transition",
    "Explain retirements and new edition rules as the natural evolution of the studio, not an abrupt attempt to become expensive.",
    "Existing supporters should understand the transition rather than feel punished by it.",
    "The audience has received a clear transition story and selected legacy inventory has a retirement plan.",
    "DELAYED", "OUTCOME", 14),
  action("p4-career-decline-low-leverage", "scarcity", "CAREER", 1,
    "Reduce low-leverage commitments",
    "Apply Career ROI scoring and decline or delegate opportunities that do not sufficiently improve money, status, access, ownership, distribution, or strategic learning.",
    "Scarcity of Keegan's time is part of the premium position.",
    "A measurable share of low-ROI requests is being declined or delegated without harming necessary cash flow.",
    "DELAYED", "OUTCOME", 30),
  action("p4-owned-scarce-edition", "scarcity", "OWNED_FUTURE", 1,
    "Launch a scarce owned-work edition",
    "Release an owned visual-language work in a genuinely limited collector format with no athlete likeness dependency.",
    "This tests whether Keegan-owned imagery can carry collector demand independently.",
    "A limited owned-work edition launches and its sell-through, buyer mix, and price response are measured.",
    "DELAYED", "OUTCOME", 30),

  // Phase 5 — Ownership
  action("p5-revenue-recurring-owned", "ownership", "REVENUE", 1,
    "Create recurring owned revenue",
    "Build at least one property where revenue can recur without restarting from a blank sheet every time.",
    "The business becomes materially more valuable when revenue is not perfectly correlated with drawing hours.",
    "An owned property has produced repeatable revenue in at least two cycles.",
    "DELAYED", "OUTCOME", 90),
  action("p5-relationship-rights-partners", "ownership", "RELATIONSHIP", 1,
    "Build a rights-and-ownership partner network",
    "Develop direct relationships with the managers, estates, leagues, brands, platforms, and dealmakers who can structure rights rather than treating licensing as a last-minute obstacle.",
    "Better access to rights can turn borrowed cultural relevance into scalable economics.",
    "A working rights-partner network exists and has produced at least one favorable structured collaboration.",
    "DELAYED", "OUTCOME", 90),
  action("p5-audience-owned-channel", "ownership", "AUDIENCE", 1,
    "Strengthen owned audience distribution",
    "Increase the share of collectors and fans reachable directly through email, collector CRM, and other owned channels rather than relying on social algorithms.",
    "Owned distribution protects the business from platform volatility.",
    "The owned collector/fan channel is growing and drives measurable direct response.",
    "DELAYED", "OUTCOME", 90),
  action("p5-career-deal-ownership", "ownership", "CAREER", 1,
    "Negotiate for royalties, rights, or equity",
    "For sufficiently valuable partnerships, move beyond one-time talent fees and seek participation in the upside where Keegan's brand or IP materially creates value.",
    "Talent income pays once; ownership can compound.",
    "At least one meaningful deal includes royalty, rights participation, equity, or another durable ownership component.",
    "DELAYED", "OUTCOME", 120),
  action("p5-owned-ip-registry", "ownership", "OWNED_FUTURE", 1,
    "Build the owned-IP portfolio and rights registry",
    "Track what the studio owns, what is licensed, where source rights came from, permitted uses, edition commitments, expirations, and monetization options.",
    "Ownership only compounds when rights are known and usable.",
    "Every strategically important work/property has a clear rights status and monetization map.",
    "IMMEDIATE", "EXECUTION", 0),

  // Phase 6 — Institution
  action("p6-revenue-nonartist-capacity", "institution", "REVENUE", 1,
    "Make revenue less dependent on Keegan's hours",
    "Grow owned products, licensing, media, partnerships, investment income, and delegated operations until the enterprise can grow while Keegan protects creative time.",
    "An institution cannot require its founder to personally execute every revenue-producing action.",
    "A meaningful and growing share of revenue is generated without direct hourly drawing labor.",
    "DELAYED", "OUTCOME", 180),
  action("p6-relationship-advisory-circle", "institution", "RELATIONSHIP", 1,
    "Build the institutional advisory circle",
    "Formalize a small group of high-trust cultural, business, collector, philanthropic, and legal advisors who expand judgment and access.",
    "The quality of the institution's network becomes a durable competitive advantage.",
    "A functioning advisory circle has recurring engagement and clearly useful contributions.",
    "DELAYED", "OUTCOME", 120),
  action("p6-audience-media-property", "institution", "AUDIENCE", 1,
    "Launch a durable media or publishing property",
    "Create a repeatable storytelling vehicle such as documentary, publishing, interview, exhibition-media, or another format that expands cultural reach beyond product launches.",
    "Institutions tell stories continuously rather than appearing only when something is for sale.",
    "A media property has a repeatable format, distribution plan, and multiple releases.",
    "DELAYED", "OUTCOME", 120),
  action("p6-career-operating-layer", "institution", "CAREER", 1,
    "Install the leadership and operating layer",
    "Build the team, responsibilities, decision rights, reporting cadence, and capital discipline required for the company to operate without Keegan doing everything.",
    "The founder should increasingly create, decide, relate, and perform while the operating layer handles repeatable execution.",
    "Core business functions have accountable owners and operate reliably without daily founder intervention.",
    "DELAYED", "OUTCOME", 180),
  action("p6-owned-legacy-property", "institution", "OWNED_FUTURE", 1,
    "Create the long-term legacy property",
    "Build a durable philanthropic, exhibition, collection, scholarship, cultural, or educational initiative that expresses what Keegan Hall stands for beyond individual transactions.",
    "The final stage is cultural permanence, not merely commercial scale.",
    "A durable legacy initiative exists with clear mission, governance, partners, and repeatable impact.",
    "DELAYED", "OUTCOME", 180)
];

function action(
  id: string,
  phaseId: string,
  lane: CareerLane,
  order: number,
  title: string,
  description: string,
  why: string,
  doneWhen: string,
  feedbackMode: CareerFeedbackMode,
  gateMode: CareerGateMode,
  reviewAfterDays: number
): CareerActionDefinition {
  return { id, phaseId, lane, order, title, description, why, doneWhen, feedbackMode, gateMode, reviewAfterDays };
}

export function getCareerAction(actionId: string) {
  return CAREER_ACTIONS.find((item) => item.id === actionId) ?? null;
}

export function buildCareerOperatingSystem(
  rows: CareerOutcomeRow[],
  generatedAt = new Date().toISOString()
): CareerOperatingSystemSnapshot {
  const latestByAction = latestFeedbackByAction(rows);
  const phasesWithProgress = CAREER_PHASES.map((phase) => {
    const phaseActions = CAREER_ACTIONS.filter((item) => item.phaseId === phase.id);
    const completed = phaseActions.filter((item) => gateSatisfied(item, latestByAction.get(item.id))).length;
    return { phase, phaseActions, completed, total: phaseActions.length };
  });

  const current = phasesWithProgress.find((phase) => phase.completed < phase.total) ?? phasesWithProgress[phasesWithProgress.length - 1];
  const currentPhase = current.phase;
  const currentPhaseActions = current.phaseActions;
  const phaseCompletionPercent = current.total ? Math.round((current.completed / current.total) * 100) : 100;

  const todayMoves = (Object.keys(LANE_ORDER) as CareerLane[])
    .sort((a, b) => LANE_ORDER[a] - LANE_ORDER[b])
    .map((lane) => {
      const candidates = currentPhaseActions
        .filter((item) => item.lane === lane)
        .sort((a, b) => a.order - b.order);
      const next = candidates.find((item) => !executionComplete(item, latestByAction.get(item.id)));
      return next ? toMove(next, latestByAction.get(next.id)) : null;
    })
    .filter((move): move is CareerMove => Boolean(move));

  const awaitingResults = CAREER_ACTIONS
    .filter((item) => feedbackState(latestByAction.get(item.id)) === "DONE_WAITING")
    .map((item) => toMove(item, latestByAction.get(item.id)))
    .sort((a, b) => (a.followUpAt ?? "9999").localeCompare(b.followUpAt ?? "9999"));

  const primaryCandidate = todayMoves[0] ?? awaitingResults[0] ?? null;
  const phaseRoadmap: CareerPhaseProgress[] = phasesWithProgress.map(({ phase, completed, total }) => ({
    ...phase,
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 100,
    state: phase.number < currentPhase.number ? "COMPLETE" : phase.number === currentPhase.number ? "CURRENT" : "FUTURE"
  }));

  const feedbackTimes = rows
    .filter((row) => isCareerFeedbackRow(row))
    .map((row) => row.happened_at ?? row.created_at ?? null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .reverse();

  return {
    generatedAt,
    currentPhase,
    phaseCompletionPercent,
    primaryBottleneck: primaryCandidate?.title ?? "No active bottleneck. Review the next phase before advancing.",
    todayMoves,
    awaitingResults,
    phaseRoadmap,
    lastFeedbackAt: feedbackTimes[0] ?? null,
    loop: ["Ingest new intelligence", "Prioritize the highest-leverage moves", "Execute", "Record feedback", "Observe outcomes", "Recalculate strategy"]
  };
}

function latestFeedbackByAction(rows: CareerOutcomeRow[]) {
  const map = new Map<string, CareerOutcomeRow>();
  const sorted = [...rows].sort((a, b) => feedbackTime(b).localeCompare(feedbackTime(a)));
  for (const row of sorted) {
    if (!isCareerFeedbackRow(row)) continue;
    const actionId = stringMeta(row, "actionId");
    if (actionId && !map.has(actionId)) map.set(actionId, row);
  }
  return map;
}

function isCareerFeedbackRow(row: CareerOutcomeRow) {
  return stringMeta(row, "source") === "career_os_v1" && Boolean(stringMeta(row, "actionId"));
}

function feedbackTime(row: CareerOutcomeRow) {
  return row.happened_at ?? row.created_at ?? "";
}

function feedbackState(row: CareerOutcomeRow | undefined): CareerFeedbackState | null {
  const state = row ? stringMeta(row, "state") : null;
  return state === "DONE_WAITING" || state === "DONE_RESULT" || state === "BLOCKED" || state === "SKIPPED" ? state : null;
}

function feedbackResult(row: CareerOutcomeRow | undefined): CareerResult | null {
  const result = row ? stringMeta(row, "result") : null;
  return result === "POSITIVE" || result === "NEUTRAL" || result === "NEGATIVE" || result === "UNKNOWN" ? result : null;
}

function executionComplete(action: CareerActionDefinition, row: CareerOutcomeRow | undefined) {
  const state = feedbackState(row);
  const result = feedbackResult(row);
  if (state === "DONE_WAITING") return true;
  if (state === "DONE_RESULT") return result !== "NEGATIVE";
  return false;
}

function gateSatisfied(action: CareerActionDefinition, row: CareerOutcomeRow | undefined) {
  const state = feedbackState(row);
  const result = feedbackResult(row);
  if (action.gateMode === "EXECUTION") return state === "DONE_RESULT" || state === "DONE_WAITING";
  return state === "DONE_RESULT" && (result === "POSITIVE" || result === "NEUTRAL");
}

function toMove(action: CareerActionDefinition, row: CareerOutcomeRow | undefined): CareerMove {
  const state = feedbackState(row);
  const result = feedbackResult(row);
  const note = row ? stringMeta(row, "userNote") : null;
  const followUpAt = row ? stringMeta(row, "followUpAt") : null;
  let status: CareerActionStatus = "READY";
  if (state === "DONE_WAITING") status = "WAITING";
  else if (state === "BLOCKED") status = "BLOCKED";
  else if (state === "SKIPPED") status = "SKIPPED";
  else if (state === "DONE_RESULT" && result === "NEGATIVE") status = "ADJUST";
  else if (state === "DONE_RESULT") status = "COMPLETE";

  return {
    ...action,
    status,
    latestNote: note,
    latestResult: result,
    lastRecordedAt: row?.happened_at ?? row?.created_at ?? null,
    followUpAt
  };
}

function stringMeta(row: CareerOutcomeRow, key: string) {
  const value = row.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

const LANE_ORDER: Record<CareerLane, number> = {
  REVENUE: 1,
  RELATIONSHIP: 2,
  AUDIENCE: 3,
  CAREER: 4,
  OWNED_FUTURE: 5
};
