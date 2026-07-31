import test from "node:test";
import assert from "node:assert/strict";

import { applyM12HarnessOverrides, getExecutionActor, getHarnessGateOverrides } from "@/lib/actions/execution/api-actor";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) prev[k] = process.env[k];
  Object.assign(process.env, patch);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("harness headers are ignored when server-side harness mode is disabled", () => {
  const req = new Request("https://local.invalid", {
    headers: {
      "x-m12-harness": "1",
      "x-m12-adapter-enabled": "0",
      "x-m12-execution-boundary-enabled": "0",
      "x-m12-mock-execution-enabled": "0",
      "x-m12-category-enabled": "0",
      "x-m12-emergency-stop": "1"
    }
  });

  const o = withEnv(
    {
      NODE_ENV: "test",
      ACTIONS_ENABLE_M12_HARNESS: undefined,
      DASHBOARD_ADMIN_TOKEN: "token"
    },
    () => getHarnessGateOverrides(req)
  );

  assert.deepEqual(o, {});
});

test("harness override parsing is disable-only (monotonic) and stop-only for emergency", () => {
  const req = new Request("https://local.invalid", {
    headers: {
      "x-m12-harness": "1",
      "x-m12-adapter-enabled": "0",
      "x-m12-execution-boundary-enabled": "0",
      "x-m12-mock-execution-enabled": "0",
      "x-m12-category-enabled": "0",
      "x-m12-emergency-stop": "1"
    }
  });

  const o = withEnv(
    {
      NODE_ENV: "test",
      ACTIONS_ENABLE_M12_HARNESS: "1",
      DASHBOARD_ADMIN_TOKEN: "token"
    },
    () => getHarnessGateOverrides(req)
  );

  assert.equal(o.adapterDisabled, true);
  assert.equal(o.executionBoundaryDisabled, true);
  assert.equal(o.mockExecutionDisabled, true);
  assert.equal(o.categoryDisabled, true);
  assert.equal(o.emergencyStopEnabled, true);
});

test("invalid or enabling values preserve server configuration", () => {
  const req = new Request("https://local.invalid", {
    headers: {
      "x-m12-harness": "1",
      // enabling values must not be treated as overrides
      "x-m12-adapter-enabled": "1",
      "x-m12-category-enabled": "true",
      "x-m12-execution-boundary-enabled": "true",
      // stop-only: disabling must be ignored
      "x-m12-emergency-stop": "0",
      // invalid
      "x-m12-mock-execution-enabled": "maybe"
    }
  });

  const o = withEnv(
    {
      NODE_ENV: "test",
      ACTIONS_ENABLE_M12_HARNESS: "1",
      DASHBOARD_ADMIN_TOKEN: "token"
    },
    () => getHarnessGateOverrides(req)
  );

  assert.deepEqual(o, {
    executionBoundaryDisabled: undefined,
    mockExecutionDisabled: undefined,
    adapterDisabled: undefined,
    categoryDisabled: undefined,
    emergencyStopEnabled: undefined
  });
});

test("applyM12HarnessOverrides is monotonic: cannot enable disabled gates or disable an emergency stop", () => {
  const overrides = {
    adapterDisabled: undefined,
    categoryDisabled: undefined,
    executionBoundaryDisabled: undefined,
    mockExecutionDisabled: undefined,
    emergencyStopEnabled: undefined
  };

  const registry = {
    isAdapterEnabled: () => false,
    isCategoryEnabled: () => false,
    isEmergencyStopEnabled: () => true
  };

  const applied = withEnv(
    {
      NODE_ENV: "test",
      ACTIONS_ENABLE_M12_HARNESS: "1",
      DASHBOARD_ADMIN_TOKEN: "token",
      ACTIONS_ENABLE_EXECUTION_BOUNDARY: "1",
      ACTIONS_ENABLE_MOCK_EXECUTION: "1"
    },
    () => applyM12HarnessOverrides({ registry, actionId: "a", adapterId: "mock", category: "email", overrides })
  );

  // Cannot enable disabled gates
  assert.equal(applied.adapterEnabled, false);
  assert.equal(applied.categoryEnabled, false);
  // Cannot disable an existing emergency stop
  assert.equal(applied.emergencyStop, true);
});

test("applyM12HarnessOverrides can only make kill-switch flags stricter (disable-only)", () => {
  const registry = {
    isAdapterEnabled: () => true,
    isCategoryEnabled: () => true,
    isEmergencyStopEnabled: () => false
  };

  const applied = withEnv(
    {
      NODE_ENV: "test",
      ACTIONS_ENABLE_M12_HARNESS: "1",
      DASHBOARD_ADMIN_TOKEN: "token",
      ACTIONS_ENABLE_EXECUTION_BOUNDARY: "1",
      ACTIONS_ENABLE_MOCK_EXECUTION: "1"
    },
    () =>
      applyM12HarnessOverrides({
        registry,
        actionId: "a",
        adapterId: "mock",
        category: "email",
        overrides: { executionBoundaryDisabled: true, mockExecutionDisabled: true, adapterDisabled: true, categoryDisabled: true, emergencyStopEnabled: true }
      })
  );

  assert.equal(applied.adapterEnabled, false);
  assert.equal(applied.categoryEnabled, false);
  assert.equal(applied.emergencyStop, true);
  assert.equal(applied.runtime.enableExecutionBoundaryFlag, "0");
  assert.equal(applied.runtime.enableMockExecutionFlag, "0");
});

test("actor identity is not derived from headers", () => {
  const req = new Request("https://local.invalid", {
    headers: {
      "x-m12-harness": "1"
    }
  });

  const actor = getExecutionActor(req);
  assert.deepEqual(actor, { actor: "dashboard", synthetic: false });
});
