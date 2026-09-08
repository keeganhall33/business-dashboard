export type OpportunityTruthStateV1 = "KNOWN" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type OpportunityPlanningSignalClassV1 =
  | "MUSEUM_EXHIBITION"
  | "ATHLETE_BRAND_CAMPAIGN"
  | "EVENT_FESTIVAL"
  | "CHARITY_BENEFIT"
  | "COLLECTIBLES_PLATFORM"
  | "GALLERY_OPEN_CALL"
  | "OTHER";
export type OpportunityArtworkClassV1 =
  | "EXISTING_ARTWORK"
  | "SMALL_FAST_ORIGINAL"
  | "STANDARD_ORIGINAL"
  | "MAJOR_ORIGINAL"
  | "NON_ART_ACTIVATION"
  | "UNKNOWN";
export type OpportunityCapacityFitV1 = "FIT" | "TIGHT" | "NOT_FIT" | "UNKNOWN";
export type OpportunityDifferentiationRoleV1 =
  | "DISTINCTIVE_LEAD_ARTIST"
  | "EXCLUSIVE_OR_FEATURED_ARTIST"
  | "STRATEGIC_COLLABORATOR"
  | "ONE_OF_FEW_CURATED_ARTISTS"
  | "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS"
  | "OPEN_CALL_COMMODITY"
  | "UNKNOWN";
export type EvidenceTriStateV1 = "YES" | "NO" | "UNKNOWN";
export type StrategicUpsideLevelV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type OpportunityRunwayBucketV1 =
  | "LT_30_DAYS"
  | "ONE_TO_THREE_MONTHS"
  | "THREE_TO_SIX_MONTHS"
  | "SIX_TO_TWELVE_MONTHS"
  | "TWELVE_PLUS_MONTHS"
  | "UNKNOWN";
export type OpportunityProductionDemandV1 = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type OpportunityCrowdingRiskV1 = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type OpportunityMinimumActivationV1 =
  | "EXISTING_ARTWORK_ACTIVATION"
  | "SMALLER_FASTER_WORK"
  | "NON_ART_ACTIVATION"
  | "FULL_SCOPE"
  | "UNKNOWN";
export type OpportunityStrategicEconomicsV1 = "ATTRACTIVE" | "CONDITIONAL" | "UNATTRACTIVE" | "UNKNOWN";
export type OpportunityEligibilityV1 = "ACTIONABLE" | "PREPARE_EARLY" | "MONITOR" | "DEPRIORITIZE" | "UNKNOWN";

export type ProductionWindowDaysV1 = "UNKNOWN" | { minDays: number; maxDays: number };

export type OpportunityEconomicsEvidenceV1 = {
  originalSaleAllowed: EvidenceTriStateV1;
  printProceedsDonation: EvidenceTriStateV1;
  sponsorUnderwriting: EvidenceTriStateV1;
  artistFeeCostRecovery: EvidenceTriStateV1;
  smallerFasterWorkOption: EvidenceTriStateV1;
};

export type OpportunityStrategicUpsideV1 = {
  access: StrategicUpsideLevelV1;
  prestige: StrategicUpsideLevelV1;
  relationship: StrategicUpsideLevelV1;
  charityImpact: StrategicUpsideLevelV1;
};

export type OpportunityCollectiblesEvidenceV1 = {
  genericSketchCard: EvidenceTriStateV1;
  differentiatedRecurringPlatform: EvidenceTriStateV1;
  licensingAdvantage: EvidenceTriStateV1;
  marqueeRelationshipAccess: EvidenceTriStateV1;
};

export type OpportunityPlanningReadinessInputV1 = {
  opportunityId: string;
  now: string | Date;
  detectedAt: string | Date;
  engageBy: string | Date | null;
  deliverBy: string | Date | null;
  planningSignalClass: OpportunityPlanningSignalClassV1;
  artworkClass: OpportunityArtworkClassV1;
  productionWindowDays: ProductionWindowDaysV1;
  capacityFit: OpportunityCapacityFitV1;
  differentiationRole: OpportunityDifferentiationRoleV1;
  economics: OpportunityEconomicsEvidenceV1;
  strategicUpside: OpportunityStrategicUpsideV1;
  collectibles: OpportunityCollectiblesEvidenceV1;
  evidenceRefs: readonly string[];
  truthState: OpportunityTruthStateV1;
};

export type OpportunityPlanningReadinessResultV1 = {
  opportunityId: string;
  truthState: OpportunityTruthStateV1;
  evidenceRefs: readonly string[];
  planningRunwayDays: number | null;
  planningRunwayBucket: OpportunityRunwayBucketV1;
  missedPlanningWindow: boolean;
  productionDemand: OpportunityProductionDemandV1;
  capacityFit: OpportunityCapacityFitV1;
  differentiationRole: OpportunityDifferentiationRoleV1;
  crowdingRisk: OpportunityCrowdingRiskV1;
  minimumViableActivation: OpportunityMinimumActivationV1;
  netStrategicEconomics: OpportunityStrategicEconomicsV1;
  eligibility: OpportunityEligibilityV1;
  reasons: readonly string[];
  whatWouldChange: readonly string[];
};

const INPUT_KEYS = new Set([
  "opportunityId",
  "now",
  "detectedAt",
  "engageBy",
  "deliverBy",
  "planningSignalClass",
  "artworkClass",
  "productionWindowDays",
  "capacityFit",
  "differentiationRole",
  "economics",
  "strategicUpside",
  "collectibles",
  "evidenceRefs",
  "truthState"
]);
const ECONOMICS_KEYS = new Set([
  "originalSaleAllowed",
  "printProceedsDonation",
  "sponsorUnderwriting",
  "artistFeeCostRecovery",
  "smallerFasterWorkOption"
]);
const UPSIDE_KEYS = new Set(["access", "prestige", "relationship", "charityImpact"]);
const COLLECTIBLES_KEYS = new Set([
  "genericSketchCard",
  "differentiatedRecurringPlatform",
  "licensingAdvantage",
  "marqueeRelationshipAccess"
]);
const RANGE_KEYS = new Set(["minDays", "maxDays"]);
const SIGNALS = new Set<OpportunityPlanningSignalClassV1>([
  "MUSEUM_EXHIBITION",
  "ATHLETE_BRAND_CAMPAIGN",
  "EVENT_FESTIVAL",
  "CHARITY_BENEFIT",
  "COLLECTIBLES_PLATFORM",
  "GALLERY_OPEN_CALL",
  "OTHER"
]);
const ARTWORK_CLASSES = new Set<OpportunityArtworkClassV1>([
  "EXISTING_ARTWORK",
  "SMALL_FAST_ORIGINAL",
  "STANDARD_ORIGINAL",
  "MAJOR_ORIGINAL",
  "NON_ART_ACTIVATION",
  "UNKNOWN"
]);
const CAPACITY = new Set<OpportunityCapacityFitV1>(["FIT", "TIGHT", "NOT_FIT", "UNKNOWN"]);
const DIFFERENTIATION = new Set<OpportunityDifferentiationRoleV1>([
  "DISTINCTIVE_LEAD_ARTIST",
  "EXCLUSIVE_OR_FEATURED_ARTIST",
  "STRATEGIC_COLLABORATOR",
  "ONE_OF_FEW_CURATED_ARTISTS",
  "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS",
  "OPEN_CALL_COMMODITY",
  "UNKNOWN"
]);
const TRI = new Set<EvidenceTriStateV1>(["YES", "NO", "UNKNOWN"]);
const UPSIDE = new Set<StrategicUpsideLevelV1>(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
const TRUTH = new Set<OpportunityTruthStateV1>(["KNOWN", "UNKNOWN", "STALE", "CONFLICTED"]);
const DAY_MS = 86_400_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkKeys(value: unknown, keys: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function parseTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  return parseTimestamp(value, label);
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}

function finiteDay(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative integer`);
  }
  return value;
}

function validateRange(value: unknown): ProductionWindowDaysV1 {
  if (value === "UNKNOWN") return "UNKNOWN";
  checkKeys(value, RANGE_KEYS, "productionWindowDays");
  const minDays = finiteDay(value.minDays, "productionWindowDays.minDays");
  const maxDays = finiteDay(value.maxDays, "productionWindowDays.maxDays");
  if (minDays > maxDays) throw new Error("productionWindowDays minDays must not exceed maxDays");
  return { minDays, maxDays };
}

function uniqueEvidence(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("evidenceRefs must be a non-empty array");
  const refs = value.map((item, index) => requiredString(item, `evidenceRefs[${index}]`));
  if (new Set(refs).size !== refs.length) throw new Error("evidenceRefs must not contain duplicates");
  return [...refs].sort((a, b) => a.localeCompare(b));
}

function validateTriObject(value: unknown, keys: ReadonlySet<string>, label: string): Record<string, EvidenceTriStateV1> {
  checkKeys(value, keys, label);
  const output: Record<string, EvidenceTriStateV1> = {};
  for (const key of keys) output[key] = enumValue(value[key], TRI, `${label}.${key}`);
  return output;
}

function validateUpside(value: unknown): OpportunityStrategicUpsideV1 {
  checkKeys(value, UPSIDE_KEYS, "strategicUpside");
  return {
    access: enumValue(value.access, UPSIDE, "strategicUpside.access"),
    prestige: enumValue(value.prestige, UPSIDE, "strategicUpside.prestige"),
    relationship: enumValue(value.relationship, UPSIDE, "strategicUpside.relationship"),
    charityImpact: enumValue(value.charityImpact, UPSIDE, "strategicUpside.charityImpact")
  };
}

function runwayBucket(days: number | null): OpportunityRunwayBucketV1 {
  if (days == null) return "UNKNOWN";
  if (days < 30) return "LT_30_DAYS";
  if (days < 90) return "ONE_TO_THREE_MONTHS";
  if (days < 180) return "THREE_TO_SIX_MONTHS";
  if (days < 365) return "SIX_TO_TWELVE_MONTHS";
  return "TWELVE_PLUS_MONTHS";
}

function productionDemand(artworkClass: OpportunityArtworkClassV1): OpportunityProductionDemandV1 {
  switch (artworkClass) {
    case "EXISTING_ARTWORK":
    case "NON_ART_ACTIVATION":
      return "NONE";
    case "SMALL_FAST_ORIGINAL":
      return "LOW";
    case "STANDARD_ORIGINAL":
      return "MEDIUM";
    case "MAJOR_ORIGINAL":
      return "HIGH";
    default:
      return "UNKNOWN";
  }
}

function crowdingRisk(role: OpportunityDifferentiationRoleV1): OpportunityCrowdingRiskV1 {
  if (role === "OPEN_CALL_COMMODITY" || role === "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS") return "HIGH";
  if (role === "ONE_OF_FEW_CURATED_ARTISTS" || role === "STRATEGIC_COLLABORATOR") return "MEDIUM";
  if (role === "DISTINCTIVE_LEAD_ARTIST" || role === "EXCLUSIVE_OR_FEATURED_ARTIST") return "LOW";
  return "UNKNOWN";
}

function highUpside(upside: OpportunityStrategicUpsideV1): boolean {
  return Object.values(upside).some((value) => value === "HIGH");
}

function hasCollectiblesException(collectibles: OpportunityCollectiblesEvidenceV1): boolean {
  return (
    collectibles.differentiatedRecurringPlatform === "YES" ||
    collectibles.licensingAdvantage === "YES" ||
    collectibles.marqueeRelationshipAccess === "YES"
  );
}

function minimumActivation(
  artworkClass: OpportunityArtworkClassV1,
  capacityFit: OpportunityCapacityFitV1,
  smallerFaster: EvidenceTriStateV1
): OpportunityMinimumActivationV1 {
  if (artworkClass === "EXISTING_ARTWORK") return "EXISTING_ARTWORK_ACTIVATION";
  if (artworkClass === "NON_ART_ACTIVATION") return "NON_ART_ACTIVATION";
  if (smallerFaster === "YES") return "SMALLER_FASTER_WORK";
  if (artworkClass !== "UNKNOWN" && (capacityFit === "FIT" || capacityFit === "TIGHT")) return "FULL_SCOPE";
  return "UNKNOWN";
}

function strategicEconomics(
  input: OpportunityPlanningReadinessInputV1,
  economics: OpportunityEconomicsEvidenceV1,
  upside: OpportunityStrategicUpsideV1,
  collectibles: OpportunityCollectiblesEvidenceV1
): OpportunityStrategicEconomicsV1 {
  if (input.truthState !== "KNOWN") return "UNKNOWN";

  const charity = input.planningSignalClass === "CHARITY_BENEFIT";
  if (charity) {
    if (economics.originalSaleAllowed === "YES" && economics.printProceedsDonation === "YES") return "ATTRACTIVE";
    const compensated = economics.artistFeeCostRecovery === "YES" || economics.sponsorUnderwriting === "YES";
    const laborHeavy = input.artworkClass === "STANDARD_ORIGINAL" || input.artworkClass === "MAJOR_ORIGINAL";
    if (laborHeavy && economics.originalSaleAllowed === "NO" && !compensated && !highUpside(upside)) return "UNATTRACTIVE";
    return "CONDITIONAL";
  }

  if (input.planningSignalClass === "COLLECTIBLES_PLATFORM" && collectibles.genericSketchCard === "YES" && !hasCollectiblesException(collectibles)) {
    return "UNATTRACTIVE";
  }

  if (hasCollectiblesException(collectibles)) return "ATTRACTIVE";
  if (highUpside(upside)) return "ATTRACTIVE";
  if (Object.values(upside).some((value) => value === "UNKNOWN")) return "UNKNOWN";
  return "CONDITIONAL";
}

export function evaluateOpportunityPlanningReadinessV1(
  rawInput: OpportunityPlanningReadinessInputV1
): OpportunityPlanningReadinessResultV1 {
  checkKeys(rawInput, INPUT_KEYS, "input");
  const opportunityId = requiredString(rawInput.opportunityId, "opportunityId");
  const now = parseTimestamp(rawInput.now, "now");
  const detectedAt = parseTimestamp(rawInput.detectedAt, "detectedAt");
  const engageBy = optionalTimestamp(rawInput.engageBy, "engageBy");
  const deliverBy = optionalTimestamp(rawInput.deliverBy, "deliverBy");
  const nowMs = Date.parse(now);
  const detectedMs = Date.parse(detectedAt);
  if (detectedMs > nowMs) throw new Error("detectedAt must not be future-dated");
  if (engageBy && Date.parse(engageBy) < detectedMs) throw new Error("engageBy must not precede detectedAt");
  if (deliverBy && Date.parse(deliverBy) < detectedMs) throw new Error("deliverBy must not precede detectedAt");
  if (engageBy && deliverBy && Date.parse(engageBy) > Date.parse(deliverBy)) throw new Error("engageBy must not follow deliverBy");

  const planningSignalClass = enumValue(rawInput.planningSignalClass, SIGNALS, "planningSignalClass");
  const artworkClass = enumValue(rawInput.artworkClass, ARTWORK_CLASSES, "artworkClass");
  const productionWindowDays = validateRange(rawInput.productionWindowDays);
  const capacityFit = enumValue(rawInput.capacityFit, CAPACITY, "capacityFit");
  const differentiationRole = enumValue(rawInput.differentiationRole, DIFFERENTIATION, "differentiationRole");
  const economicsRaw = validateTriObject(rawInput.economics, ECONOMICS_KEYS, "economics");
  const economics: OpportunityEconomicsEvidenceV1 = economicsRaw as OpportunityEconomicsEvidenceV1;
  const strategicUpside = validateUpside(rawInput.strategicUpside);
  const collectiblesRaw = validateTriObject(rawInput.collectibles, COLLECTIBLES_KEYS, "collectibles");
  const collectibles = collectiblesRaw as OpportunityCollectiblesEvidenceV1;
  const evidenceRefs = uniqueEvidence(rawInput.evidenceRefs);
  const truthState = enumValue(rawInput.truthState, TRUTH, "truthState");

  const runwayDays = deliverBy == null ? null : Math.floor((Date.parse(deliverBy) - detectedMs) / DAY_MS);
  const bucket = runwayBucket(runwayDays);
  const demand = productionDemand(artworkClass);
  const crowding = crowdingRisk(differentiationRole);
  const activation = minimumActivation(artworkClass, capacityFit, economics.smallerFasterWorkOption);
  const economicsResult = strategicEconomics({ ...rawInput, truthState, planningSignalClass, artworkClass }, economics, strategicUpside, collectibles);

  const requiresNewArtwork = artworkClass === "SMALL_FAST_ORIGINAL" || artworkClass === "STANDARD_ORIGINAL" || artworkClass === "MAJOR_ORIGINAL";
  const missedPlanningWindow =
    truthState === "KNOWN" &&
    requiresNewArtwork &&
    runwayDays != null &&
    productionWindowDays !== "UNKNOWN" &&
    productionWindowDays.minDays > runwayDays;

  const crowdedCommodity = crowding === "HIGH";
  const exceptionalEvidence = highUpside(strategicUpside) || hasCollectiblesException(collectibles);
  const genericSketchCard = collectibles.genericSketchCard === "YES" && !hasCollectiblesException(collectibles);
  const materialUnknown =
    truthState !== "KNOWN" ||
    artworkClass === "UNKNOWN" ||
    capacityFit === "UNKNOWN" ||
    differentiationRole === "UNKNOWN" ||
    economicsResult === "UNKNOWN";

  let eligibility: OpportunityEligibilityV1;
  if (materialUnknown) eligibility = "UNKNOWN";
  else if (missedPlanningWindow) eligibility = "DEPRIORITIZE";
  else if (capacityFit === "NOT_FIT" && economics.smallerFasterWorkOption !== "YES") eligibility = "DEPRIORITIZE";
  else if (genericSketchCard) eligibility = "DEPRIORITIZE";
  else if (crowdedCommodity && !exceptionalEvidence) eligibility = "DEPRIORITIZE";
  else if (economicsResult === "UNATTRACTIVE") eligibility = "DEPRIORITIZE";
  else if (runwayDays != null && runwayDays >= 90) eligibility = "PREPARE_EARLY";
  else if (capacityFit === "FIT" || capacityFit === "TIGHT" || artworkClass === "EXISTING_ARTWORK" || artworkClass === "NON_ART_ACTIVATION") eligibility = "ACTIONABLE";
  else eligibility = "MONITOR";

  const reasons: string[] = [];
  if (truthState !== "KNOWN") reasons.push(`Material evidence is ${truthState}; actionability remains unknown.`);
  if (runwayDays != null) reasons.push(`Planning runway is ${runwayDays} days (${bucket}).`);
  else reasons.push("Delivery runway is UNKNOWN because no supported deliver-by date was supplied.");
  if (missedPlanningWindow) reasons.push("MISSED_PLANNING_WINDOW: minimum supported production time exceeds the available runway.");
  if (artworkClass === "EXISTING_ARTWORK") reasons.push("Existing artwork avoids a new-original production dependency.");
  if (crowdedCommodity && !exceptionalEvidence) reasons.push("Crowded or commodity artist positioning lacks exceptional supported upside.");
  if (genericSketchCard) reasons.push("Generic sketch-card evidence alone is not strategically differentiated.");
  if (hasCollectiblesException(collectibles)) reasons.push("Differentiated recurring/licensing/access evidence supports a stronger collectibles platform.");
  if (planningSignalClass === "CHARITY_BENEFIT" && economics.originalSaleAllowed === "YES" && economics.printProceedsDonation === "YES") {
    reasons.push("Charity structure preserves original-sale economics while allowing print-proceeds donation.");
  }
  if (economicsResult === "UNATTRACTIVE") reasons.push("Supported economics indicate excessive uncompensated production demand relative to upside.");
  if (capacityFit === "NOT_FIT") reasons.push("Current capacity evidence is NOT_FIT.");

  const whatWouldChange: string[] = [];
  if (truthState !== "KNOWN") whatWouldChange.push("Current KNOWN evidence resolving truth/freshness uncertainty.");
  if (capacityFit === "UNKNOWN" || capacityFit === "NOT_FIT") whatWouldChange.push("Evidence of FIT/TIGHT capacity or a smaller viable activation.");
  if (missedPlanningWindow) whatWouldChange.push("A later delivery date, shorter supported production window, or existing-artwork activation.");
  if (crowdedCommodity && !exceptionalEvidence) whatWouldChange.push("Evidence of exclusivity, marquee access, unusual commercial upside, or a differentiated recurring platform.");
  if (genericSketchCard) whatWouldChange.push("A differentiated recurring platform, licensing advantage, marquee relationship access, or meaningful original-art activation.");
  if (economicsResult === "UNATTRACTIVE" && planningSignalClass === "CHARITY_BENEFIT") {
    whatWouldChange.push("Original-sale permission, sponsor underwriting, artist fee/cost recovery, or exceptional career/access upside.");
  }

  return {
    opportunityId,
    truthState,
    evidenceRefs,
    planningRunwayDays: runwayDays,
    planningRunwayBucket: bucket,
    missedPlanningWindow,
    productionDemand: demand,
    capacityFit,
    differentiationRole,
    crowdingRisk: crowding,
    minimumViableActivation: activation,
    netStrategicEconomics: economicsResult,
    eligibility,
    reasons,
    whatWouldChange
  };
}
