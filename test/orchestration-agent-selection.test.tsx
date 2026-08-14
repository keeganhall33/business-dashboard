import test from "node:test";
import assert from "node:assert/strict";

import { selectWorkerLocalAgentIdV1, shouldEnableLocalRoutingV1 } from "../scripts/orchestration-agent-selection.mjs";

test("stream -> worker local agent mapping", () => {
  assert.equal(selectWorkerLocalAgentIdV1("CORE_INTELLIGENCE"), "local-a");
  assert.equal(selectWorkerLocalAgentIdV1("DISCOVERY_INTELLIGENCE"), "local-b");
  assert.equal(selectWorkerLocalAgentIdV1("INTELLIGENCE_UX"), "local-c");
  assert.equal(selectWorkerLocalAgentIdV1("ORCHESTRATION_SYSTEMS"), "local-d");
});

test("local routing enabled when stream has worker local agent", () => {
  assert.equal(
    shouldEnableLocalRoutingV1({ stream: "ORCHESTRATION_SYSTEMS", explicitLocalAgentId: "", explicitLocalRoutingEnabled: false }),
    true
  );
});

test("explicit local routing / local agent id enables local routing", () => {
  assert.equal(
    shouldEnableLocalRoutingV1({ stream: "OTHER", explicitLocalAgentId: "local-d", explicitLocalRoutingEnabled: false }),
    true
  );
  assert.equal(
    shouldEnableLocalRoutingV1({ stream: "OTHER", explicitLocalAgentId: "", explicitLocalRoutingEnabled: true }),
    true
  );
});

