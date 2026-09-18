import { createHash } from "node:crypto";

import type { RelationshipPathV1 } from "@/lib/relationship-intelligence/relationship-pathfinder-v1";

export const DEAL_ARCHITECT_POLICY_VERSION_V1 = "deal_architect_policy_v1.0.0" as const;

export type DealTruthStateV1 = "KNOWN" | "INFERRED" | "HYPOTHESIS" | "UNKNOWN" | "CONFLICTED";
export type DealArchetypeV1 = "COLLECTOR_ONE_OF_ONE" | "SPONSOR_FUNDED_CHARITY" | "VIP_FAN_ACTIVATION";
export type DealComponentTypeV1 = "ORIGINAL" | "EDITION" | "VIP" | "FAN" | "CHARITY" | "PUBLICITY" | "CONTENT" | "EVENT" | "DIGITAL";
export type DealStakeholderRoleV1 = "RIGHTS_HOLDER" | "SPONSOR_FUNDER" | "CHARITY" | "BUYER_COLLECTOR" | "DISTRIBUTION" | "PUBLICITY" | "TALENT_PARTNER" | "OTHER";
export type DealRightsStateV1 = "GRANTED" | "PENDING" | "UNKNOWN" | "CONFLICTED" | "NOT_REQUIRED";
export type DealWindowStateV1 = "OPEN" | "SOON" | "CLOSED" | "UNKNOWN";
export type DealReadinessV1 = "PREPARE" | "RESEARCH_REQUIRED" | "BLOCKED" | "KILL";
export type DealAuthorityLevelV1 = "DECISION_MAKER" | "INFLUENCER" | "CONNECTOR" | "UNKNOWN";

export type EvidenceBoundValueV1<T> = {
  state: DealTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
};

export type CanonicalDealStakeholderV1 = {
  stakeholderId: string;
  role: DealStakeholderRoleV1;
  entityRef: string | null;
  valueStatement: EvidenceBoundValueV1<string>;
  required: boolean;
};

export type CanonicalDealComponentV1 = {
  componentId: string;
  type: DealComponentTypeV1;
  canonicalRef: string;
  state: DealTruthStateV1;
  evidenceRefs: readonly string[];
  requiredKeeganHours: number | null;
};

export type DealRangeV1 = {
  min: number;
  max: number;
};

export type DealEconomicsEvidenceV1 = {
  archetype: DealArchetypeV1;
  currency: string;
  revenueRange: EvidenceBoundValueV1<DealRangeV1>;
  directCostRange: EvidenceBoundValueV1<DealRangeV1>;
  sponsorFundingRange: EvidenceBoundValueV1<DealRangeV1>;
  charitableProceedsRange: EvidenceBoundValueV1<DealRangeV1>;
};

export type CanonicalDealRightV1 = {
  rightId: string;
  canonicalRef: string;
  label: string;
  required: boolean;
  state: DealRightsStateV1;
  evidenceRefs: readonly string[];
};

export type CanonicalDealDecisionMakerV1 = {
  decisionMakerId: string;
  entityRef: string;
  role: string;
  authority: DealAuthorityLevelV1;
  truthState: DealTruthStateV1;
  evidenceRefs: readonly string[];
};

export type DealPlanningWindowV1 = {
  state: DealWindowStateV1;
  opensAt: string | null;
  closesAt: string | null;
  evidenceRefs: readonly string[];
  rationale: string;
};

export type DealArchitectInputV1 = {
  opportunityId: string;
  opportunityRef: string;
  opportunityTitle: string;
  qualificationState: "QUALIFIED" | "UNQUALIFIED" | "UNKNOWN" | "CONFLICTED";
  generatedAt: string;
  stakeholders: readonly CanonicalDealStakeholderV1[];
  components: readonly CanonicalDealComponentV1[];
  economics: readonly DealEconomicsEvidenceV1[];
  rights: readonly CanonicalDealRightV1[];
  decisionMakers: readonly CanonicalDealDecisionMakerV1[];
  planningWindow: DealPlanningWindowV1;
  availableKeeganHours: EvidenceBoundValueV1<number>;
  distributionPath: EvidenceBoundValueV1<string>;
  publicityHook: EvidenceBoundValueV1<string>;
  relationshipPaths?: readonly RelationshipPathV1[];
  dependencies: readonly string[];
  risks: readonly string[];
};

export type DealComponentProjectionV1 = {
  type: DealComponentTypeV1;
  state: DealTruthStateV1;
  canonicalRef: string | null;
  evidenceRefs: readonly string[];
  requiredKeeganHours: number | null;
};

export type DealStakeholderProjectionV1 = {
  stakeholderId: string;
  role: DealStakeholderRoleV1;
  entityRef: string | null;
  valueState: DealTruthStateV1;
  valueStatement: string | null;
  required: boolean;
  evidenceRefs: readonly string[];
};

export type DealEconomicsProjectionV1 = {
  currency: string | null;
  revenueRange: EvidenceBoundValueV1<DealRangeV1>;
  directCostRange: EvidenceBoundValueV1<DealRangeV1>;
  sponsorFundingRange: EvidenceBoundValueV1<DealRangeV1>;
  charitableProceedsRange: EvidenceBoundValueV1<DealRangeV1>;
};

export type DealStructureV1 = {
  structureId: string;
  archetype: DealArchetypeV1;
  label: string;
  strategicIntent: string;
  readiness: DealReadinessV1;
  components: readonly DealComponentProjectionV1[];
  stakeholders: readonly DealStakeholderProjectionV1[];
  economics: DealEconomicsProjectionV1;
  capacity: {
    requiredKeeganHours: number | null;
    availableKeeganHours: number | null;
    state: DealTruthStateV1;
  };
  rights: readonly CanonicalDealRightV1[];
  decisionMakers: readonly CanonicalDealDecisionMakerV1[];
  planningWindow: DealPlanningWindowV1 & {
    urgency: "NORMAL" | "DECAYING" | "EXPIRED" | "UNKNOWN";
  };
  relationshipPaths: readonly RelationshipPathV1[];
  distributionPath: EvidenceBoundValueV1<string>;
  publicityHook: EvidenceBoundValueV1<string>;
  dependencies: readonly string[];
  risks: readonly string[];
  blockers: readonly string[];
  researchNeeds: readonly string[];
  killConditions: readonly string[];
  rollbackConditions: readonly string[];
  nextSafePreparedAction: string;
  approval: {
    keeganApprovalRequired: true;
    externalActionAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    rightsCommitmentAuthorized: false;
    outreachAuthorized: false;
  };
  evidenceRefs: readonly string[];
};

export type DealArchitectResultV1 = {
  contractVersion: "DealArchitectV1";
  policyVersion: typeof DEAL_ARCHITECT_POLICY_VERSION_V1;
  resultId: string;
  opportunityId: string;
  opportunityRef: string;
  generatedAt: string;
  status: "STRUCTURES_READY" | "RESEARCH_REQUIRED" | "BLOCKED";
  structures: readonly DealStructureV1[];
  actionAuthority: {
    analysisOnly: true;
    externalActionAuthorized: false;
  };
};

export class DealArchitectError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DealArchitectError";
  }
}

const ARCHETYPES: readonly {
  archetype: DealArchetypeV1;
  label: string;
  strategicIntent: string;
  componentTypes: readonly DealComponentTypeV1[];
}[] = [
  {
    archetype: "COLLECTOR_ONE_OF_ONE",
    label: "Collector-led one-of-one",
    strategicIntent: "Lead with a scarce original and use only evidence-supported distribution and publicity around the singular work.",
    componentTypes: ["ORIGINAL", "PUBLICITY", "CONTENT"]
  },
  {
    archetype: "SPONSOR_FUNDED_CHARITY",
    label: "Sponsor-funded charity edition",
    strategicIntent: "Use a sponsor or funder to support a rights-safe original/edition activation with an explicit charitable component.",
    componentTypes: ["ORIGINAL", "EDITION", "CHARITY", "PUBLICITY"]
  },
  {
    archetype: "VIP_FAN_ACTIVATION",
    label: "VIP and fan activation",
    strategicIntent: "Pair limited-edition or experience components with a bounded VIP/fan distribution path without assuming rights or demand.",
    componentTypes: ["EDITION", "VIP", "FAN", "EVENT", "PUBLICITY"]
  }
] as const;

const SUPPORTED_VALUE_STATES = new Set<DealTruthStateV1>(["KNOWN", "INFERRED"]);
const MAX_ITEMS = 100;
const DAY_MS = 86_400_000;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DealArchitectError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function timestamp(value: string, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new DealArchitectError("INVALID_TIMESTAMP", `${label} is invalid`);
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_ITEMS) throw new DealArchitectError("INVALID_EVIDENCE", `${label} is invalid`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function stableId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeBoundValue<T>(bound: EvidenceBoundValueV1<T>, label: string): EvidenceBoundValueV1<T> {
  const evidenceRefs = refs(bound.evidenceRefs, `${label}.evidenceRefs`);
  if (SUPPORTED_VALUE_STATES.has(bound.state)) {
    if (bound.value == null || evidenceRefs.length === 0) {
      return { state: "UNKNOWN", value: null, evidenceRefs: [] };
    }
    return { state: bound.state, value: bound.value, evidenceRefs };
  }
  return { state: bound.state, value: null, evidenceRefs };
}

function normalizeRange(bound: EvidenceBoundValueV1<DealRangeV1>, label: string): EvidenceBoundValueV1<DealRangeV1> {
  const normalized = normalizeBoundValue(bound, label);
  if (normalized.value == null) return normalized;
  const { min, max } = normalized.value;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw new DealArchitectError("INVALID_RANGE", `${label} range is invalid`);
  }
  return { ...normalized, value: { min, max } };
}

function planningWindow(input: DealArchitectInputV1): DealStructureV1["planningWindow"] {
  const window = input.planningWindow;
  const evidenceRefs = refs(window.evidenceRefs, "planningWindow.evidenceRefs");
  const generated = Date.parse(timestamp(input.generatedAt, "generatedAt"));
  const closes = window.closesAt == null ? null : Date.parse(timestamp(window.closesAt, "planningWindow.closesAt"));
  if (window.opensAt != null) timestamp(window.opensAt, "planningWindow.opensAt");

  let urgency: DealStructureV1["planningWindow"]["urgency"] = "UNKNOWN";
  if (window.state === "CLOSED" || (closes != null && closes < generated)) urgency = "EXPIRED";
  else if (window.state === "OPEN" || window.state === "SOON") {
    urgency = closes != null && closes - generated <= 45 * DAY_MS ? "DECAYING" : "NORMAL";
  }

  return {
    ...window,
    rationale: required(window.rationale, "planningWindow.rationale"),
    evidenceRefs,
    urgency
  };
}

function componentProjection(input: DealArchitectInputV1, type: DealComponentTypeV1): DealComponentProjectionV1 {
  const supported = input.components
    .filter((component) => component.type === type)
    .sort((a, b) => a.componentId.localeCompare(b.componentId))[0];
  if (!supported) {
    return { type, state: "HYPOTHESIS", canonicalRef: null, evidenceRefs: [], requiredKeeganHours: null };
  }
  const evidenceRefs = refs(supported.evidenceRefs, `${supported.componentId}.evidenceRefs`);
  const state = SUPPORTED_VALUE_STATES.has(supported.state) && evidenceRefs.length > 0 ? supported.state : supported.state === "CONFLICTED" ? "CONFLICTED" : "UNKNOWN";
  const hours = supported.requiredKeeganHours;
  if (hours != null && (!Number.isFinite(hours) || hours < 0)) throw new DealArchitectError("INVALID_CAPACITY", `${supported.componentId}.requiredKeeganHours is invalid`);
  return {
    type,
    state,
    canonicalRef: required(supported.canonicalRef, `${supported.componentId}.canonicalRef`),
    evidenceRefs,
    requiredKeeganHours: hours
  };
}

function stakeholderProjection(stakeholder: CanonicalDealStakeholderV1): DealStakeholderProjectionV1 {
  const value = normalizeBoundValue(stakeholder.valueStatement, `${stakeholder.stakeholderId}.valueStatement`);
  return {
    stakeholderId: required(stakeholder.stakeholderId, "stakeholderId"),
    role: stakeholder.role,
    entityRef: stakeholder.entityRef == null ? null : required(stakeholder.entityRef, `${stakeholder.stakeholderId}.entityRef`),
    valueState: value.state,
    valueStatement: value.value,
    required: stakeholder.required,
    evidenceRefs: value.evidenceRefs
  };
}

function economicsProjection(input: DealArchitectInputV1, archetype: DealArchetypeV1): DealEconomicsProjectionV1 {
  const evidence = input.economics.find((item) => item.archetype === archetype);
  if (!evidence) {
    const unknownRange: EvidenceBoundValueV1<DealRangeV1> = { state: "UNKNOWN", value: null, evidenceRefs: [] };
    return {
      currency: null,
      revenueRange: unknownRange,
      directCostRange: unknownRange,
      sponsorFundingRange: unknownRange,
      charitableProceedsRange: unknownRange
    };
  }
  return {
    currency: required(evidence.currency, `${archetype}.currency`),
    revenueRange: normalizeRange(evidence.revenueRange, `${archetype}.revenueRange`),
    directCostRange: normalizeRange(evidence.directCostRange, `${archetype}.directCostRange`),
    sponsorFundingRange: normalizeRange(evidence.sponsorFundingRange, `${archetype}.sponsorFundingRange`),
    charitableProceedsRange: normalizeRange(evidence.charitableProceedsRange, `${archetype}.charitableProceedsRange`)
  };
}

function structureFor(input: DealArchitectInputV1, blueprint: typeof ARCHETYPES[number]): DealStructureV1 {
  const components = blueprint.componentTypes.map((type) => componentProjection(input, type));
  const stakeholders = [...input.stakeholders].map(stakeholderProjection).sort((a, b) => a.stakeholderId.localeCompare(b.stakeholderId));
  const economics = economicsProjection(input, blueprint.archetype);
  const window = planningWindow(input);
  const normalizedCapacity = normalizeBoundValue(input.availableKeeganHours, "availableKeeganHours");
  if (normalizedCapacity.value != null && (!Number.isFinite(normalizedCapacity.value) || normalizedCapacity.value < 0)) {
    throw new DealArchitectError("INVALID_CAPACITY", "availableKeeganHours is invalid");
  }
  const componentHours = components.map((component) => component.requiredKeeganHours);
  const requiredHours = componentHours.some((hours) => hours == null) ? null : componentHours.reduce<number>((sum, hours) => sum + (hours ?? 0), 0);

  const rights = [...input.rights]
    .map((right) => ({ ...right, rightId: required(right.rightId, "rightId"), canonicalRef: required(right.canonicalRef, `${right.rightId}.canonicalRef`), label: required(right.label, `${right.rightId}.label`), evidenceRefs: refs(right.evidenceRefs, `${right.rightId}.evidenceRefs`) }))
    .sort((a, b) => a.rightId.localeCompare(b.rightId));
  const decisionMakers = [...input.decisionMakers]
    .map((maker) => ({ ...maker, decisionMakerId: required(maker.decisionMakerId, "decisionMakerId"), entityRef: required(maker.entityRef, `${maker.decisionMakerId}.entityRef`), role: required(maker.role, `${maker.decisionMakerId}.role`), evidenceRefs: refs(maker.evidenceRefs, `${maker.decisionMakerId}.evidenceRefs`) }))
    .sort((a, b) => a.decisionMakerId.localeCompare(b.decisionMakerId));

  const blockers: string[] = [];
  const researchNeeds: string[] = [];
  const killConditions: string[] = [
    "Required rights are denied or become legally unavailable.",
    "A required stakeholder rejects the structure with no supported alternate path.",
    "Economics become demonstrably negative outside approved strategic/charitable intent."
  ];
  const rollbackConditions: string[] = [
    "New evidence conflicts with a material assumption used to prepare the structure.",
    "Capacity or timing changes invalidate the approved preparation plan.",
    "A rights, sponsor, charity, or distribution dependency changes materially."
  ];

  for (const right of rights) {
    if (!right.required) continue;
    if (right.state === "PENDING") blockers.push(`RIGHT_PENDING:${right.rightId}`);
    if (right.state === "UNKNOWN") researchNeeds.push(`VERIFY_RIGHT:${right.rightId}`);
    if (right.state === "CONFLICTED") blockers.push(`RIGHT_CONFLICTED:${right.rightId}`);
  }
  if (rights.some((right) => right.required && right.state === "CONFLICTED")) killConditions.push("A required right remains conflicted after bounded verification.");

  for (const stakeholder of stakeholders) {
    if (!stakeholder.required) continue;
    if (stakeholder.entityRef == null) researchNeeds.push(`RESOLVE_STAKEHOLDER:${stakeholder.stakeholderId}`);
    if (!SUPPORTED_VALUE_STATES.has(stakeholder.valueState) || stakeholder.valueStatement == null) researchNeeds.push(`VERIFY_STAKEHOLDER_VALUE:${stakeholder.stakeholderId}`);
  }

  const supportedDecisionMaker = decisionMakers.some((maker) => maker.authority === "DECISION_MAKER" && SUPPORTED_VALUE_STATES.has(maker.truthState) && maker.evidenceRefs.length > 0);
  if (!supportedDecisionMaker) researchNeeds.push("VERIFY_DECISION_AUTHORITY");
  if (window.urgency === "EXPIRED") blockers.push("PLANNING_WINDOW_EXPIRED");
  if (window.urgency === "UNKNOWN") researchNeeds.push("VERIFY_PLANNING_WINDOW");
  if (requiredHours == null) researchNeeds.push("VERIFY_KEEGAN_CAPACITY_DEMAND");
  if (normalizedCapacity.value == null) researchNeeds.push("VERIFY_AVAILABLE_KEEGAN_CAPACITY");
  if (requiredHours != null && normalizedCapacity.value != null && requiredHours > normalizedCapacity.value) blockers.push("KEEGAN_CAPACITY_EXCEEDED");

  if (components.some((component) => component.state === "HYPOTHESIS" || component.state === "UNKNOWN")) researchNeeds.push("VERIFY_HYPOTHETICAL_COMPONENTS");
  if (components.some((component) => component.state === "CONFLICTED")) blockers.push("COMPONENT_EVIDENCE_CONFLICTED");
  if (economics.revenueRange.value == null) researchNeeds.push("VERIFY_REVENUE_ECONOMICS");
  if (economics.directCostRange.value == null) researchNeeds.push("VERIFY_DIRECT_COST_ECONOMICS");
  if (blueprint.archetype === "SPONSOR_FUNDED_CHARITY" && economics.sponsorFundingRange.value == null) researchNeeds.push("VERIFY_SPONSOR_FUNDING");
  if (blueprint.archetype === "SPONSOR_FUNDED_CHARITY" && economics.charitableProceedsRange.value == null) researchNeeds.push("VERIFY_CHARITABLE_ECONOMICS");

  const relationshipPaths = [...(input.relationshipPaths ?? [])]
    .filter((path) => path.readiness !== "RESEARCH_REQUIRED")
    .sort((a, b) => a.pathId.localeCompare(b.pathId));
  if (relationshipPaths.length === 0) researchNeeds.push("VERIFY_RELATIONSHIP_PATH");

  const distributionPath = normalizeBoundValue(input.distributionPath, "distributionPath");
  const publicityHook = normalizeBoundValue(input.publicityHook, "publicityHook");
  if (distributionPath.value == null) researchNeeds.push("VERIFY_DISTRIBUTION_PATH");
  if (publicityHook.value == null) researchNeeds.push("VERIFY_PUBLICITY_HOOK");

  const uniqueBlockers = [...new Set(blockers)].sort((a, b) => a.localeCompare(b));
  const uniqueResearch = [...new Set(researchNeeds)].sort((a, b) => a.localeCompare(b));
  const readiness: DealReadinessV1 = window.urgency === "EXPIRED" ? "KILL" : uniqueBlockers.length > 0 ? "BLOCKED" : uniqueResearch.length > 0 ? "RESEARCH_REQUIRED" : "PREPARE";
  const nextSafePreparedAction = readiness === "PREPARE"
    ? "Prepare an internal evidence packet, stakeholder map, draft economics, and approval brief; do not contact, spend, contract, or commit rights."
    : readiness === "RESEARCH_REQUIRED"
      ? `Resolve bounded information gaps: ${uniqueResearch.join(", ")}.`
      : readiness === "BLOCKED"
        ? `Resolve blockers before preparation: ${uniqueBlockers.join(", ")}.`
        : "Do not advance this structure unless new evidence reopens the planning window.";

  const evidenceRefs = refs([
    ...stakeholders.flatMap((stakeholder) => stakeholder.evidenceRefs),
    ...components.flatMap((component) => component.evidenceRefs),
    ...rights.flatMap((right) => right.evidenceRefs),
    ...decisionMakers.flatMap((maker) => maker.evidenceRefs),
    ...economics.revenueRange.evidenceRefs,
    ...economics.directCostRange.evidenceRefs,
    ...economics.sponsorFundingRange.evidenceRefs,
    ...economics.charitableProceedsRange.evidenceRefs,
    ...window.evidenceRefs,
    ...normalizedCapacity.evidenceRefs,
    ...distributionPath.evidenceRefs,
    ...publicityHook.evidenceRefs,
    ...relationshipPaths.flatMap((path) => path.evidenceRefs)
  ], `${blueprint.archetype}.evidenceRefs`);

  const projectionWithoutId = {
    archetype: blueprint.archetype,
    label: blueprint.label,
    strategicIntent: blueprint.strategicIntent,
    readiness,
    components,
    stakeholders,
    economics,
    capacity: {
      requiredKeeganHours: requiredHours,
      availableKeeganHours: normalizedCapacity.value,
      state: requiredHours == null || normalizedCapacity.value == null ? "UNKNOWN" as const : "KNOWN" as const
    },
    rights,
    decisionMakers,
    planningWindow: window,
    relationshipPaths,
    distributionPath,
    publicityHook,
    dependencies: [...new Set(input.dependencies.map((item) => required(item, "dependencies")))].sort((a, b) => a.localeCompare(b)),
    risks: [...new Set(input.risks.map((item) => required(item, "risks")))].sort((a, b) => a.localeCompare(b)),
    blockers: uniqueBlockers,
    researchNeeds: uniqueResearch,
    killConditions: [...new Set(killConditions)].sort((a, b) => a.localeCompare(b)),
    rollbackConditions: [...new Set(rollbackConditions)].sort((a, b) => a.localeCompare(b)),
    nextSafePreparedAction,
    approval: {
      keeganApprovalRequired: true as const,
      externalActionAuthorized: false as const,
      spendAuthorized: false as const,
      contractAuthorized: false as const,
      rightsCommitmentAuthorized: false as const,
      outreachAuthorized: false as const
    },
    evidenceRefs
  };

  return {
    structureId: stableId({ opportunityId: input.opportunityId, generatedAt: input.generatedAt, policyVersion: DEAL_ARCHITECT_POLICY_VERSION_V1, ...projectionWithoutId }),
    ...projectionWithoutId
  };
}

export function architectDealStructuresV1(input: DealArchitectInputV1): DealArchitectResultV1 {
  const opportunityId = required(input.opportunityId, "opportunityId");
  const opportunityRef = required(input.opportunityRef, "opportunityRef");
  required(input.opportunityTitle, "opportunityTitle");
  timestamp(input.generatedAt, "generatedAt");
  if (input.qualificationState !== "QUALIFIED") {
    throw new DealArchitectError("OPPORTUNITY_NOT_QUALIFIED", "Deal architecture requires a qualified canonical opportunity");
  }
  if (input.stakeholders.length > MAX_ITEMS || input.components.length > MAX_ITEMS || input.economics.length > MAX_ITEMS || input.rights.length > MAX_ITEMS || input.decisionMakers.length > MAX_ITEMS) {
    throw new DealArchitectError("INPUT_TOO_LARGE", "Deal architecture input exceeds bounded limits");
  }

  const duplicateStakeholders = input.stakeholders.map((item) => item.stakeholderId).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateStakeholders.length > 0) throw new DealArchitectError("DUPLICATE_STAKEHOLDER", "Stakeholder identities must be unique");
  const duplicateComponents = input.components.map((item) => item.componentId).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateComponents.length > 0) throw new DealArchitectError("DUPLICATE_COMPONENT", "Component identities must be unique");
  const duplicateEconomics = input.economics.map((item) => item.archetype).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateEconomics.length > 0) throw new DealArchitectError("DUPLICATE_ECONOMICS", "Economics evidence must be unique per archetype");

  const structures = ARCHETYPES.map((blueprint) => structureFor(input, blueprint));
  const status: DealArchitectResultV1["status"] = structures.every((structure) => structure.readiness === "PREPARE")
    ? "STRUCTURES_READY"
    : structures.every((structure) => structure.readiness === "BLOCKED" || structure.readiness === "KILL")
      ? "BLOCKED"
      : "RESEARCH_REQUIRED";

  return freeze({
    contractVersion: "DealArchitectV1" as const,
    policyVersion: DEAL_ARCHITECT_POLICY_VERSION_V1,
    resultId: stableId({ opportunityId, opportunityRef, generatedAt: input.generatedAt, structures }),
    opportunityId,
    opportunityRef,
    generatedAt: input.generatedAt,
    status,
    structures,
    actionAuthority: {
      analysisOnly: true as const,
      externalActionAuthorized: false as const
    }
  });
}
