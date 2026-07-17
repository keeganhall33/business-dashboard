import test from "node:test";
import assert from "node:assert/strict";

import { isActivePipelineStatus } from "../src/lib/pipeline/status.ts";

test("isActivePipelineStatus treats undefined as active", () => {
  assert.equal(isActivePipelineStatus(undefined), true);
  assert.equal(isActivePipelineStatus(null), true);
});

test("isActivePipelineStatus rejects inactive pipeline states", () => {
  ["won", "lost", "parked", "paused", "completed", "invalid"].forEach((status) => {
    assert.equal(isActivePipelineStatus(status), false);
    assert.equal(isActivePipelineStatus(status.toUpperCase()), false);
  });
});
