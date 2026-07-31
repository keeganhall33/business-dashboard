import test from "node:test";
import assert from "node:assert/strict";

import { createMilestone12AdapterRegistry, milestone12RegisteredAdapterIds } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";

test("Milestone 12 adapter registry is deny-by-default and registers only mock", () => {
  const ids = milestone12RegisteredAdapterIds();
  assert.deepEqual(ids, ["mock"]);

  const registry = createMilestone12AdapterRegistry({
    enabledAdapters: new Set(["mock"]),
    enabledCategories: new Set(["email"]),
    emergencyStopActionIds: new Set()
  });

  assert.ok(registry.getAdapter("mock"));
  // Unknown adapter must be null.
  assert.equal(registry.getAdapter("mock")?.id, "mock");
});

test("guard: a second adapter registration would violate M12", () => {
  const ids = milestone12RegisteredAdapterIds();
  assert.equal(ids.length, 1);
});
