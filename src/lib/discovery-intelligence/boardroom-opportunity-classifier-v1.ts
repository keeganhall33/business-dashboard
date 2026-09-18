export const BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION = "BOARDROOM_OPPORTUNITY_CLASSIFIER_V1" as const;

export type BoardroomTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";
export type BoardroomDispositionV1 = "IGNORE" | "WATCH" | "CANDIDATE" | "QUALIFIED_FOR_RESEARCH";
export type BoardroomInternalActionV1 = "IGNORE" | "WATCH" | "RESEARCH" | "LINK_TO_EXISTING";
export type BoardroomMaterialityV1 = "LOW" | "MEDIUM" | "HIGH";
export type BoardroomEvidenceSupportV1 = "WEAK" | "PARTIAL" | "STRONG";
export type BoardroomSignalClassV1 =
  | "SPONSORSHIP"
  | "PARTNERSHIP"
  | "EXECUTIVE_MOVE"
  | "ATHLETE_TALENT_DEAL"
  | "COLLECTIBLES_LICENSING"
  | "EVENT"
  | "VENUE"
  | "MEDIA"
  | "CHARITY"
  | "BRAND_ACTIVATION"
  | "ACQUISITION_INVESTMENT";

export type BoardroomKeeganFitReasonV1 =
  | "SPORTS_BUSINESS"
  | "BRAND_PARTNERSHIP"
  | "COLLECTIBLES_LICENSING"
  | "EVENT_VENUE"
  | "MEDIA_CULTURE"
  | "CHARITY_IMPACT"
  | "DECISION_MAKER_CHANGE";

export type BoardroomOpportunityClassV1 =
  | "SPONSOR_LED_ACTIVATION"
  | "BRAND_OR_PARTNER_COLLABORATION"
  | "ATHLETE_OR_TALENT_PARTNERSHIP"
  | "LICENSED_COLLECTIBLE_OR_ART"
  | "EVENT_OR_ANNIVERSARY_ACTIVATION"
  | "MEDIA_OR_STORYTELLING_COLLABORATION"
  | "CHARITY_OR_FOUNDATION_PROJECT"
  | "RELATIONSHIP_RESEARCH"
  | "STRATEGIC_ORGANIZATION_RESEARCH";

export type BoardroomStoryV1 = {
  storyId: string;
  title: string;
  summary: string;
  publishedAt: string | Date;
  sourceRef: string;
  evidenceRefs: readonly string[];
  evidenceState: BoardroomTruthStateV1;
  entityRefs?: readonly string[];
  organizationRefs?: readonly string[];
  syndicationKey?: string | null;
  existingOpportunityRef?: string | null;
};

export type BoardroomOpportunityClassifierInputV1 = {
  stories: readonly BoardroomStoryV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
  maximumSurfaced?: number;
};

export type BoardroomOpportunityDecisionV1 = Readonly<{
  storyId: string;
  title: string;
  publishedAt: string;
  disposition: BoardroomDispositionV1;
  recommendedAction: BoardroomInternalActionV1;
  signalClass: BoardroomSignalClassV1 | null;
  fitReasons: readonly BoardroomKeeganFitReasonV1[];
  opportunityClass: BoardroomOpportunityClassV1 | null;
  materiality: BoardroomMaterialityV1;
  evidenceSupport: BoardroomEvidenceSupportV1;
  evidenceState: BoardroomTruthStateV1;
  whyNow: string | null;
  researchQuestions: readonly string[];
  entityRefs: readonly string[];
  organizationRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceRef: string;
  existingOpportunityRef: string | null;
  duplicateOfStoryId: string | null;
  reasonCodes: readonly string[];
}>;

export type BoardroomOpportunityClassifierResultV1 = Readonly<{
  version: typeof BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION;
  generatedAt: string;
  decisions: readonly BoardroomOpportunityDecisionV1[];
  surfaced: readonly BoardroomOpportunityDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    ignored: number;
    watched: number;
    candidates: number;
    qualifiedForResearch: number;
    surfaced: number;
  }>;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
}>;

const DAY_MS = 86_400_000;
const MAX_STORIES = 500;
const DEFAULT_MAX_SURFACED = 8;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 30;
const TRUTH_STATES = new Set<BoardroomTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"]);

const SIGNAL_RULES: readonly Readonly<{ signal: BoardroomSignalClassV1; patterns: readonly RegExp[] }>[] = [
  { signal: "SPONSORSHIP", patterns: [/\bsponsor(?:ship|s|ed|ing)?\b/i, /\bnaming rights\b/i] },
  { signal: "COLLECTIBLES_LICENSING", patterns: [/\bcollectibles?\b/i, /\btrading cards?\b/i, /\blicens(?:e|ed|ing)\b/i, /\bmemorabilia\b/i] },
  { signal: "BRAND_ACTIVATION", patterns: [/\bbrand activation\b/i, /\bexperiential\b/i, /\bcampaign activation\b/i] },
  { signal: "ATHLETE_TALENT_DEAL", patterns: [/\bendorsement\b/i, /\bsigns? (?:a |an )?(?:deal|agreement) with\b/i, /\bambassador\b/i] },
  { signal: "PARTNERSHIP", patterns: [/\bpartnership\b/i, /\bpartners? with\b/i, /\bteams? up with\b/i, /\bcollaboration\b/i] },
  { signal: "CHARITY", patterns: [/\bcharit(?:y|able)\b/i, /\bfoundation\b/i, /\bfundraiser\b/i, /\bbenefit gala\b/i, /\bnonprofit\b/i] },
  { signal: "VENUE", patterns: [/\bstadium\b/i, /\barena\b/i, /\bvenue\b/i, /\bclubhouse\b/i] },
  { signal: "MEDIA", patterns: [/\bdocumentary\b/i, /\bdocuseries\b/i, /\bfilm\b/i, /\bseries\b/i, /\bmedia rights\b/i] },
  { signal: "ACQUISITION_INVESTMENT", patterns: [/\bacqui(?:res?|sition)\b/i, /\binvests?\b/i, /\bfunding round\b/i] },
  { signal: "EXECUTIVE_MOVE", patterns: [/\bappoints?\b/i, /\bnamed (?:as )?(?:chief|ceo|cmo|president|director|head|svp|vp)\b/i, /\bhires?\b/i, /\bjoins? as (?:chief|ceo|cmo|president|director|head|svp|vp)\b/i] },
  { signal: "EVENT", patterns: [/\banniversary\b/i, /\bgala\b/i, /\btournament\b/i, /\bchampionship\b/i, /\bfestival\b/i, /\bopening ceremony\b/i, /\blaunch event\b/i] }
] as const;

const GENERIC_NOISE_PATTERNS = [
  /\bfinal score\b/i,
  /\bbeats?\b.*\b(?:to|-)\b/i,
  /\bwins? (?:the )?(?:game|match)\b/i,
  /\bbox score\b/i,
  /\bhighlights?\b/i,
  /\bstat(?:s|istics)\b/i,
  /\bnamed mvp\b/i,
  /\bcelebrates? birthday\b/i,
  /\bspotted at\b/i
] as const;

const HIGH_INTENT_SIGNALS = new Set<BoardroomSignalClassV1>([
  "SPONSORSHIP",
  "PARTNERSHIP",
  "ATHLETE_TALENT_DEAL",
  "COLLECTIBLES_LICENSING",
  "CHARITY",
  "BRAND_ACTIVATION"
]);

function asDate(value: string | Date, label: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function uniqueTextList(value: readonly string[] | undefined, label: string, allowEmpty = true): readonly string[] {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b));
  if (!allowEmpty && normalized.length === 0) throw new Error(`${label} must not be empty`);
  return Object.freeze(normalized);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function detectSignal(text: string): BoardroomSignalClassV1 | null {
  for (const rule of SIGNAL_RULES) if (rule.patterns.some((pattern) => pattern.test(text))) return rule.signal;
  return null;
}

function fitReasons(signal: BoardroomSignalClassV1 | null): readonly BoardroomKeeganFitReasonV1[] {
  switch (signal) {
    case "SPONSORSHIP": return ["SPORTS_BUSINESS", "BRAND_PARTNERSHIP"];
    case "PARTNERSHIP":
    case "ATHLETE_TALENT_DEAL":
    case "BRAND_ACTIVATION": return ["BRAND_PARTNERSHIP"];
    case "COLLECTIBLES_LICENSING": return ["COLLECTIBLES_LICENSING"];
    case "EVENT":
    case "VENUE": return ["EVENT_VENUE"];
    case "MEDIA": return ["MEDIA_CULTURE"];
    case "CHARITY": return ["CHARITY_IMPACT"];
    case "EXECUTIVE_MOVE": return ["DECISION_MAKER_CHANGE"];
    case "ACQUISITION_INVESTMENT": return ["SPORTS_BUSINESS"];
    default: return [];
  }
}

function opportunityClass(signal: BoardroomSignalClassV1 | null): BoardroomOpportunityClassV1 | null {
  switch (signal) {
    case "SPONSORSHIP": return "SPONSOR_LED_ACTIVATION";
    case "PARTNERSHIP":
    case "BRAND_ACTIVATION": return "BRAND_OR_PARTNER_COLLABORATION";
    case "ATHLETE_TALENT_DEAL": return "ATHLETE_OR_TALENT_PARTNERSHIP";
    case "COLLECTIBLES_LICENSING": return "LICENSED_COLLECTIBLE_OR_ART";
    case "EVENT":
    case "VENUE": return "EVENT_OR_ANNIVERSARY_ACTIVATION";
    case "MEDIA": return "MEDIA_OR_STORYTELLING_COLLABORATION";
    case "CHARITY": return "CHARITY_OR_FOUNDATION_PROJECT";
    case "EXECUTIVE_MOVE": return "RELATIONSHIP_RESEARCH";
    case "ACQUISITION_INVESTMENT": return "STRATEGIC_ORGANIZATION_RESEARCH";
    default: return null;
  }
}

function researchQuestions(signal: BoardroomSignalClassV1 | null): readonly string[] {
  switch (signal) {
    case "SPONSORSHIP": return ["What rights, activation windows, and approved partner channels are explicitly documented?", "Who owns activation planning, if publicly verifiable?"];
    case "PARTNERSHIP":
    case "BRAND_ACTIVATION": return ["What is the documented campaign scope and planning window?", "Is there an evidence-backed art, collectibles, gifting, or cultural activation fit?"];
    case "ATHLETE_TALENT_DEAL": return ["What categories and rights are explicitly included in the deal?", "Is there a documented partner or agency path relevant to a collaboration?"];
    case "COLLECTIBLES_LICENSING": return ["Who holds the relevant rights or license?", "What product or release window is publicly documented?"];
    case "EXECUTIVE_MOVE": return ["What responsibilities and decision authority are publicly documented for the new role?", "Does the organization have a verified activation or partnership need?"];
    case "EVENT":
    case "VENUE": return ["What is the documented planning calendar?", "Who controls programming, partnerships, licensing, or charitable activation?"];
    case "MEDIA": return ["Who controls production, partnerships, or licensed artwork?", "What production timeline is publicly documented?"];
    case "CHARITY": return ["What fundraising or activation format is publicly documented?", "Is there an evidence-backed mission and audience fit for Keegan?"];
    case "ACQUISITION_INVESTMENT": return ["What strategic priorities changed as a result of the transaction?", "Is there a verified partnership or cultural activation path worth researching?"];
    default: return [];
  }
}

function whyNow(signal: BoardroomSignalClassV1 | null, title: string): string | null {
  if (!signal) return null;
  return `New ${signal.toLocaleLowerCase("en-US").replaceAll("_", " ")} signal: ${title}`;
}

function materiality(signal: BoardroomSignalClassV1 | null): BoardroomMaterialityV1 {
  if (!signal) return "LOW";
  return HIGH_INTENT_SIGNALS.has(signal) ? "HIGH" : "MEDIUM";
}

function evidenceSupport(state: BoardroomTruthStateV1): BoardroomEvidenceSupportV1 {
  if (state === "KNOWN") return "STRONG";
  if (state === "INFERRED" || state === "PARTIAL") return "PARTIAL";
  return "WEAK";
}

function priority(disposition: BoardroomDispositionV1): number {
  if (disposition === "QUALIFIED_FOR_RESEARCH") return 0;
  if (disposition === "CANDIDATE") return 1;
  if (disposition === "WATCH") return 2;
  return 3;
}

export function classifyBoardroomOpportunitiesV1(input: BoardroomOpportunityClassifierInputV1): BoardroomOpportunityClassifierResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.stories)) throw new Error("stories must be an array");
  if (input.stories.length > MAX_STORIES) throw new Error(`stories exceeds ${MAX_STORIES}`);

  const now = asDate(input.now, "now");
  const maximumEvidenceAgeDays = boundedInteger(input.maximumEvidenceAgeDays, DEFAULT_MAX_EVIDENCE_AGE_DAYS, 1, 3650, "maximumEvidenceAgeDays");
  const maximumSurfaced = boundedInteger(input.maximumSurfaced, DEFAULT_MAX_SURFACED, 1, 50, "maximumSurfaced");

  const normalized = input.stories.map((story, index) => {
    if (!story || typeof story !== "object" || Array.isArray(story)) throw new Error(`story ${index} must be an object`);
    const storyId = requiredText(story.storyId, `story ${index}.storyId`);
    const title = requiredText(story.title, `story ${index}.title`);
    const summary = requiredText(story.summary, `story ${index}.summary`);
    const publishedAt = asDate(story.publishedAt, `story ${index}.publishedAt`);
    if (publishedAt.getTime() > now.getTime()) throw new Error(`story ${index}.publishedAt must not be future-dated`);
    if (!TRUTH_STATES.has(story.evidenceState)) throw new Error(`story ${index}.evidenceState is unsupported`);
    return {
      storyId,
      title,
      summary,
      publishedAt,
      sourceRef: requiredText(story.sourceRef, `story ${index}.sourceRef`),
      evidenceRefs: uniqueTextList(story.evidenceRefs, `story ${index}.evidenceRefs`, false),
      evidenceState: story.evidenceState,
      entityRefs: uniqueTextList(story.entityRefs, `story ${index}.entityRefs`),
      organizationRefs: uniqueTextList(story.organizationRefs, `story ${index}.organizationRefs`),
      syndicationKey: optionalText(story.syndicationKey, `story ${index}.syndicationKey`),
      existingOpportunityRef: optionalText(story.existingOpportunityRef, `story ${index}.existingOpportunityRef`)
    };
  });

  const sorted = [...normalized].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.storyId.localeCompare(b.storyId));
  const canonicalByDedupKey = new Map<string, string>();

  const decisions: BoardroomOpportunityDecisionV1[] = sorted.map((story) => {
    const text = `${story.title}\n${story.summary}`;
    const signal = detectSignal(text);
    const genericNoise = GENERIC_NOISE_PATTERNS.some((pattern) => pattern.test(text));
    const dedupKey = story.syndicationKey ? `syndication:${normalizeKey(story.syndicationKey)}` : `title:${normalizeKey(story.title)}`;
    const duplicateOfStoryId = canonicalByDedupKey.get(dedupKey) ?? null;
    if (!duplicateOfStoryId) canonicalByDedupKey.set(dedupKey, story.storyId);

    const ageDays = (now.getTime() - story.publishedAt.getTime()) / DAY_MS;
    const staleByAge = ageDays > maximumEvidenceAgeDays;
    const reasons: string[] = [];
    if (duplicateOfStoryId) reasons.push("DUPLICATE_OR_SYNDICATED");
    if (!signal) reasons.push("NO_SUPPORTED_BUSINESS_SIGNAL");
    if (genericNoise && !signal) reasons.push("GENERIC_OR_RESULTS_NOISE");
    if (story.evidenceState === "CONFLICTED") reasons.push("CONFLICTED_EVIDENCE");
    if (story.evidenceState === "UNKNOWN") reasons.push("UNKNOWN_EVIDENCE");
    if (story.evidenceState === "STALE" || staleByAge) reasons.push("STALE_EVIDENCE");
    if (story.evidenceState === "INFERRED") reasons.push("INFERRED_EVIDENCE_REQUIRES_VERIFICATION");
    if (story.evidenceState === "PARTIAL") reasons.push("PARTIAL_EVIDENCE");

    let disposition: BoardroomDispositionV1;
    let recommendedAction: BoardroomInternalActionV1;

    if (duplicateOfStoryId || !signal || (genericNoise && !signal)) {
      disposition = "IGNORE";
      recommendedAction = "IGNORE";
    } else if (story.evidenceState === "CONFLICTED" || story.evidenceState === "UNKNOWN" || story.evidenceState === "STALE" || staleByAge || story.evidenceState === "INFERRED" || story.evidenceState === "PARTIAL") {
      disposition = "WATCH";
      recommendedAction = "WATCH";
    } else if (story.existingOpportunityRef) {
      disposition = "CANDIDATE";
      recommendedAction = "LINK_TO_EXISTING";
      reasons.push("EXISTING_OPPORTUNITY_LINK_SUPPLIED");
    } else if (HIGH_INTENT_SIGNALS.has(signal)) {
      disposition = "QUALIFIED_FOR_RESEARCH";
      recommendedAction = "RESEARCH";
      reasons.push("SUPPORTED_HIGH_INTENT_SIGNAL");
    } else {
      disposition = "CANDIDATE";
      recommendedAction = "RESEARCH";
      reasons.push("SUPPORTED_RESEARCH_SIGNAL");
    }

    return freezeDeep({
      storyId: story.storyId,
      title: story.title,
      publishedAt: story.publishedAt.toISOString(),
      disposition,
      recommendedAction,
      signalClass: signal,
      fitReasons: [...fitReasons(signal)],
      opportunityClass: opportunityClass(signal),
      materiality: materiality(signal),
      evidenceSupport: evidenceSupport(story.evidenceState),
      evidenceState: story.evidenceState,
      whyNow: disposition === "IGNORE" ? null : whyNow(signal, story.title),
      researchQuestions: disposition === "IGNORE" ? [] : [...researchQuestions(signal)],
      entityRefs: [...story.entityRefs],
      organizationRefs: [...story.organizationRefs],
      evidenceRefs: [...story.evidenceRefs],
      sourceRef: story.sourceRef,
      existingOpportunityRef: story.existingOpportunityRef,
      duplicateOfStoryId,
      reasonCodes: reasons
    });
  });

  const surfaced = decisions
    .filter((decision) => decision.disposition !== "IGNORE")
    .sort((a, b) => priority(a.disposition) - priority(b.disposition) || b.publishedAt.localeCompare(a.publishedAt) || a.storyId.localeCompare(b.storyId))
    .slice(0, maximumSurfaced);

  return freezeDeep({
    version: BOARDROOM_OPPORTUNITY_CLASSIFIER_VERSION,
    generatedAt: now.toISOString(),
    decisions,
    surfaced,
    counts: {
      reviewed: decisions.length,
      ignored: decisions.filter((item) => item.disposition === "IGNORE").length,
      watched: decisions.filter((item) => item.disposition === "WATCH").length,
      candidates: decisions.filter((item) => item.disposition === "CANDIDATE").length,
      qualifiedForResearch: decisions.filter((item) => item.disposition === "QUALIFIED_FOR_RESEARCH").length,
      surfaced: surfaced.length
    },
    externalResearchPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const
  });
}
