import assert from "node:assert/strict";
import test from "node:test";

import { executeAutoContinueWithLocalFirstV1 } from "../scripts/orchestration-routing-core.mjs";

test("local structured-output retry preserves the original task prompt", async () => {
  const calls = [];
  const routingState = {
    attemptedAgents: [],
    localAttempted: false,
    localResult: null,
    escalatedToCloud: false,
    escalationReason: null
  };

  let attemptIndex = 0;
  const result = await executeAutoContinueWithLocalFirstV1({
    taskId: "issue-610",
    taskBody: "Implement the requested architecture fix.",
    promptText: "ORIGINAL TASK CONTEXT: issue #610 with repository and acceptance criteria",
    strictRetryPrompt: "Return only the required structured result object.",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: null,
    cloudForbidden: true,
    verifyStructuredResult: null,
    run: async (agentId, message) => {
      calls.push({ agentId, message });
      attemptIndex += 1;
      return JSON.stringify({ finalText: attemptIndex === 1 ? "invalid" : "valid" });
    },
    routingState,
    extractFinalText: (envelope) => envelope.finalText,
    parseStructured: (finalText) => finalText === "valid"
      ? { kind: "result", value: { TASK_ID: "issue-610", STATUS: "PASS" } }
      : { kind: "invalid" },
    deltaDemandsPass: () => false,
    coerceLooseJsonToResultContract: () => null
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].message, "ORIGINAL TASK CONTEXT: issue #610 with repository and acceptance criteria");
  assert.match(calls[1].message, /ORIGINAL TASK CONTEXT: issue #610/);
  assert.match(calls[1].message, /STRICT RETRY INSTRUCTIONS:/);
  assert.match(calls[1].message, /Return only the required structured result object\./);
  assert.equal(result.final.ok, true);
});
