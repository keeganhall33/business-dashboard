export const CAPACITY_AWARE_PORTFOLIO_V2_VERSION = "capacity_aware_portfolio_v2.0" as const;
export const CAPACITY_AWARE_PORTFOLIO_V2_MAX_OPPORTUNITIES = 50 as const;

export type PortfolioLaneV2 = "NOW" | "NEXT" | "LATER" | "IGNORE";
export type CapacityTruthV2 = "KNOWN" | "UNKNOWN";
export type PortfolioExecutionOwnerV2 = "KEEGAN" | "IOANA" | "JEEVES" | "PARTNER" | "UNASSIGNED";

export type CapacityVectorV2 = {
  cash: number | null;
  keegan_hours: number | null;
  energy: number | null;
};

export type QualitativeValueV2 = {
  kind: "PRESTIGE" | "RELATIONSHIP" | "AUTHORITY" | "LEARNING" | "OPTIONALITY" | "MISSION";
  label: string;
  not_monetized: true;
  evidence_refs: string[];
};

export type DirectEconomicsV2 = {
  currency: "USD" | null;
  potential_value_range: { min: number; max: number } | null;
  evidence_refs: string[];
};

export type DelegationOptionV2 = {
  owner: Exclude<PortfolioExecutionOwnerV2, "KEEGAN" | "UNASSIGNED">;
  available: boolean;
  resource_demand: CapacityVectorV2;
  evidence_refs: string[];
};

export type CapacityAwareOpportunityV2 = {
  opportunity_id: string;
  title: string;
  priority_score: number;
  preferred_lane: Exclude<PortfolioLaneV2, "IGNORE">;
  eligible: boolean;
  resource_demand: CapacityVectorV2;
  owner_dependence: "KEEGAN_REQUIRED" | "DELEGATABLE" | "NO_KEEGAN_REQUIRED";
  delegation: DelegationOptionV2 | null;
  direct_economics: DirectEconomicsV2;
  qualitative_value: QualitativeValueV2[];
  evidence_refs: string[];
};

export type CapacityAwarePortfolioInputV2 = {
  capacity: CapacityVectorV2;
  opportunities: CapacityAwareOpportunityV2[];
};

export type CapacityConstraintCodeV2 =
  | "CASH_CAPACITY"
  | "KEEGAN_HOURS_CAPACITY"
  | "ENERGY_CAPACITY"
  | "UNKNOWN_CASH_CAPACITY"
  | "UNKNOWN_KEEGAN_HOURS_CAPACITY"
  | "UNKNOWN_ENERGY_CAPACITY"
  | "UNKNOWN_CASH_DEMAND"
  | "UNKNOWN_KEEGAN_HOURS_DEMAND"
  | "UNKNOWN_ENERGY_DEMAND"
  | "NOT_ELIGIBLE";

export type CapacityAwarePortfolioItemV2 = {
  opportunity_id: string;
  title: string;
  lane: PortfolioLaneV2;
  execution_owner: PortfolioExecutionOwnerV2;
  delegated: boolean;
  effective_resource_demand: CapacityVectorV2;
  constraint_codes: CapacityConstraintCodeV2[];
  required_displacement: string[];
  direct_economics: DirectEconomicsV2;
  qualitative_value: QualitativeValueV2[];
  evidence_refs: string[];
  rationale: string;
};

export type CapacityAwarePortfolioOutputV2 = {
  contract_version: typeof CAPACITY_AWARE_PORTFOLIO_V2_VERSION;
  capacity_truth: {
    cash: CapacityTruthV2;
    keegan_hours: CapacityTruthV2;
    energy: CapacityTruthV2;
  };
  capacity: CapacityVectorV2;
  remaining_capacity: CapacityVectorV2;
  items: CapacityAwarePortfolioItemV2[];
  lanes: Record<PortfolioLaneV2, string[]>;
  unknown_capacity_inputs: Array<keyof CapacityVectorV2>;
  decision_support_only: true;
  external_action_authorized: false;
};

type FitResult = {
  state: "FIT" | "NO_FIT" | "UNKNOWN";
  constraints: CapacityConstraintCodeV2[];
};

const RESOURCE_KEYS: Array<keyof CapacityVectorV2> = ["cash", "keegan_hours", "energy"];

function assertFiniteNonNegative(value: number | null, label: string): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be null or a finite non-negative number`);
}

function assertInput(input: CapacityAwarePortfolioInputV2): void {
  if (input.opportunities.length > CAPACITY_AWARE_PORTFOLIO_V2_MAX_OPPORTUNITIES) {
    throw new Error(`capacity-aware portfolio accepts at most ${CAPACITY_AWARE_PORTFOLIO_V2_MAX_OPPORTUNITIES} opportunities`);
  }

  RESOURCE_KEYS.forEach((key) => assertFiniteNonNegative(input.capacity[key], `capacity.${key}`));

  const ids = new Set<string>();
  for (const opportunity of input.opportunities) {
    if (!opportunity.opportunity_id.trim()) throw new Error("opportunity_id is required");
    if (ids.has(opportunity.opportunity_id)) throw new Error(`duplicate opportunity_id: ${opportunity.opportunity_id}`);
    ids.add(opportunity.opportunity_id);
    if (!Number.isFinite(opportunity.priority_score) || opportunity.priority_score < 0 || opportunity.priority_score > 100) {
      throw new Error(`priority_score for ${opportunity.opportunity_id} must be between 0 and 100`);
    }
    RESOURCE_KEYS.forEach((key) =>
      assertFiniteNonNegative(opportunity.resource_demand[key], `${opportunity.opportunity_id}.resource_demand.${key}`)
    );
    if (opportunity.delegation) {
      RESOURCE_KEYS.forEach((key) =>
        assertFiniteNonNegative(
          opportunity.delegation!.resource_demand[key],
          `${opportunity.opportunity_id}.delegation.resource_demand.${key}`
        )
      );
    }
    const range = opportunity.direct_economics.potential_value_range;
    if (range && (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min < 0 || range.max < range.min)) {
      throw new Error(`invalid direct economics range for ${opportunity.opportunity_id}`);
    }
  }
}

function cloneVector(vector: CapacityVectorV2): CapacityVectorV2 {
  return { cash: vector.cash, keegan_hours: vector.keegan_hours, energy: vector.energy };
}

function fitConstraintFor(key: keyof CapacityVectorV2, kind: "capacity" | "demand"): CapacityConstraintCodeV2 {
  if (kind === "capacity") {
    if (key === "cash") return "UNKNOWN_CASH_CAPACITY";
    if (key === "keegan_hours") return "UNKNOWN_KEEGAN_HOURS_CAPACITY";
    return "UNKNOWN_ENERGY_CAPACITY";
  }
  if (key === "cash") return "UNKNOWN_CASH_DEMAND";
  if (key === "keegan_hours") return "UNKNOWN_KEEGAN_HOURS_DEMAND";
  return "UNKNOWN_ENERGY_DEMAND";
}

function exhaustedConstraintFor(key: keyof CapacityVectorV2): CapacityConstraintCodeV2 {
  if (key === "cash") return "CASH_CAPACITY";
  if (key === "keegan_hours") return "KEEGAN_HOURS_CAPACITY";
  return "ENERGY_CAPACITY";
}

function assessFit(remaining: CapacityVectorV2, demand: CapacityVectorV2): FitResult {
  const constraints: CapacityConstraintCodeV2[] = [];
  let hasUnknown = false;
  let hasNoFit = false;

  for (const key of RESOURCE_KEYS) {
    const required = demand[key];
    const available = remaining[key];
    if (required === null) {
      constraints.push(fitConstraintFor(key, "demand"));
      hasUnknown = true;
      continue;
    }
    if (required === 0) continue;
    if (available === null) {
      constraints.push(fitConstraintFor(key, "capacity"));
      hasUnknown = true;
      continue;
    }
    if (required > available) {
      constraints.push(exhaustedConstraintFor(key));
      hasNoFit = true;
    }
  }

  return {
    state: hasNoFit ? "NO_FIT" : hasUnknown ? "UNKNOWN" : "FIT",
    constraints
  };
}

function subtractKnownCapacity(remaining: CapacityVectorV2, demand: CapacityVectorV2): CapacityVectorV2 {
  const next = cloneVector(remaining);
  for (const key of RESOURCE_KEYS) {
    if (next[key] !== null && demand[key] !== null) next[key] = next[key]! - demand[key]!;
  }
  return next;
}

function addBackKnownCapacity(remaining: CapacityVectorV2, demand: CapacityVectorV2): CapacityVectorV2 {
  const next = cloneVector(remaining);
  for (const key of RESOURCE_KEYS) {
    if (next[key] !== null && demand[key] !== null) next[key] = next[key]! + demand[key]!;
  }
  return next;
}

function displacementNeeded(
  currentNow: Array<{ id: string; demand: CapacityVectorV2 }>,
  remaining: CapacityVectorV2,
  demand: CapacityVectorV2
): string[] {
  if (assessFit(remaining, demand).state === "UNKNOWN") return [];
  let simulated = cloneVector(remaining);
  const displaced: string[] = [];
  for (const selected of [...currentNow].reverse()) {
    simulated = addBackKnownCapacity(simulated, selected.demand);
    displaced.push(selected.id);
    if (assessFit(simulated, demand).state === "FIT") return displaced;
  }
  return displaced;
}

function defaultOwner(opportunity: CapacityAwareOpportunityV2): PortfolioExecutionOwnerV2 {
  return opportunity.owner_dependence === "NO_KEEGAN_REQUIRED" ? "JEEVES" : "KEEGAN";
}

function cloneEconomics(economics: DirectEconomicsV2): DirectEconomicsV2 {
  return {
    currency: economics.currency,
    potential_value_range: economics.potential_value_range
      ? { min: economics.potential_value_range.min, max: economics.potential_value_range.max }
      : null,
    evidence_refs: [...economics.evidence_refs]
  };
}

function cloneQualitative(values: QualitativeValueV2[]): QualitativeValueV2[] {
  return values.map((value) => ({ ...value, evidence_refs: [...value.evidence_refs] }));
}

export function buildCapacityAwarePortfolioV2(input: CapacityAwarePortfolioInputV2): CapacityAwarePortfolioOutputV2 {
  assertInput(input);

  const capacity = cloneVector(input.capacity);
  let remaining = cloneVector(input.capacity);
  const currentNow: Array<{ id: string; demand: CapacityVectorV2 }> = [];
  const items: CapacityAwarePortfolioItemV2[] = [];

  const ordered = [...input.opportunities].sort(
    (a, b) => b.priority_score - a.priority_score || a.opportunity_id.localeCompare(b.opportunity_id)
  );

  for (const opportunity of ordered) {
    const base = {
      opportunity_id: opportunity.opportunity_id,
      title: opportunity.title,
      direct_economics: cloneEconomics(opportunity.direct_economics),
      qualitative_value: cloneQualitative(opportunity.qualitative_value),
      evidence_refs: [...opportunity.evidence_refs]
    };

    if (!opportunity.eligible) {
      items.push({
        ...base,
        lane: "IGNORE",
        execution_owner: "UNASSIGNED",
        delegated: false,
        effective_resource_demand: cloneVector(opportunity.resource_demand),
        constraint_codes: ["NOT_ELIGIBLE"],
        required_displacement: [],
        rationale: "Opportunity is not currently eligible for portfolio allocation."
      });
      continue;
    }

    if (opportunity.preferred_lane !== "NOW") {
      items.push({
        ...base,
        lane: opportunity.preferred_lane,
        execution_owner: defaultOwner(opportunity),
        delegated: false,
        effective_resource_demand: cloneVector(opportunity.resource_demand),
        constraint_codes: assessFit(remaining, opportunity.resource_demand).constraints,
        required_displacement: [],
        rationale: `Opportunity remains ${opportunity.preferred_lane}; no capacity is reserved until it enters NOW.`
      });
      continue;
    }

    const directFit = assessFit(remaining, opportunity.resource_demand);
    if (directFit.state === "FIT") {
      const demand = cloneVector(opportunity.resource_demand);
      remaining = subtractKnownCapacity(remaining, demand);
      currentNow.push({ id: opportunity.opportunity_id, demand });
      items.push({
        ...base,
        lane: "NOW",
        execution_owner: defaultOwner(opportunity),
        delegated: false,
        effective_resource_demand: demand,
        constraint_codes: [],
        required_displacement: [],
        rationale: "Fits the currently known scarce-capacity envelope without displacing a higher-priority NOW item."
      });
      continue;
    }

    const delegation = opportunity.owner_dependence === "DELEGATABLE" && opportunity.delegation?.available
      ? opportunity.delegation
      : null;
    if (delegation) {
      const delegatedFit = assessFit(remaining, delegation.resource_demand);
      if (delegatedFit.state === "FIT") {
        const demand = cloneVector(delegation.resource_demand);
        remaining = subtractKnownCapacity(remaining, demand);
        currentNow.push({ id: opportunity.opportunity_id, demand });
        items.push({
          ...base,
          lane: "NOW",
          execution_owner: delegation.owner,
          delegated: true,
          effective_resource_demand: demand,
          constraint_codes: [],
          required_displacement: [],
          rationale: "Fits NOW only through the evidenced delegation option; no external action is authorized by this allocation."
        });
        continue;
      }
    }

    const displacement = displacementNeeded(currentNow, remaining, opportunity.resource_demand);
    items.push({
      ...base,
      lane: "NEXT",
      execution_owner: defaultOwner(opportunity),
      delegated: false,
      effective_resource_demand: cloneVector(opportunity.resource_demand),
      constraint_codes: directFit.constraints,
      required_displacement: displacement,
      rationale:
        directFit.state === "UNKNOWN"
          ? "NOW is withheld because required capacity or demand is UNKNOWN; availability is not inferred."
          : "NOW is withheld because the known capacity envelope would be exceeded; displacement is explicit."
    });
  }

  const lanes: Record<PortfolioLaneV2, string[]> = { NOW: [], NEXT: [], LATER: [], IGNORE: [] };
  for (const item of items) lanes[item.lane].push(item.opportunity_id);

  return {
    contract_version: CAPACITY_AWARE_PORTFOLIO_V2_VERSION,
    capacity_truth: {
      cash: capacity.cash === null ? "UNKNOWN" : "KNOWN",
      keegan_hours: capacity.keegan_hours === null ? "UNKNOWN" : "KNOWN",
      energy: capacity.energy === null ? "UNKNOWN" : "KNOWN"
    },
    capacity,
    remaining_capacity: remaining,
    items,
    lanes,
    unknown_capacity_inputs: RESOURCE_KEYS.filter((key) => capacity[key] === null),
    decision_support_only: true,
    external_action_authorized: false
  };
}
