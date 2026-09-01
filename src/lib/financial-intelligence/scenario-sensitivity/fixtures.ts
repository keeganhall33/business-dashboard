import {
  CAPITAL_ALLOCATION_BASE_FIXTURE_V1,
  CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1
} from "@/lib/financial-intelligence/capital-allocation/fixtures";
import { buildScenarioSensitivityV1 } from "@/lib/financial-intelligence/scenario-sensitivity/adapter";

export const SCENARIO_SENSITIVITY_BASE_FIXTURE_V1 = buildScenarioSensitivityV1({
  sensitivity_id: "scenario-sensitivity-base-capital-allocation",
  assessment: CAPITAL_ALLOCATION_BASE_FIXTURE_V1
});

export const SCENARIO_SENSITIVITY_UNKNOWN_COST_FIXTURE_V1 = buildScenarioSensitivityV1({
  sensitivity_id: "scenario-sensitivity-unknown-cost-capital-allocation",
  assessment: CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1
});

export const SCENARIO_SENSITIVITY_FIXTURES_V1 = [
  SCENARIO_SENSITIVITY_BASE_FIXTURE_V1,
  SCENARIO_SENSITIVITY_UNKNOWN_COST_FIXTURE_V1
].sort((a, b) => a.sensitivity_id.localeCompare(b.sensitivity_id));
