import test from "node:test";
import assert from "node:assert/strict";

import { executeAutoContinueWithLocalFirstV1 } from "../scripts/orchestration-routing-core.mjs";

test("loose json extraction can parse json even if prefixed with a line", async () => {
  const routingState = {
    attemptedAgents: [] as string[],
    localAttempted: false,
    localResult: null as any,
    escalatedToCloud: false,
    escalationReason: null as any
  };

  let call = 0;
  const run = async () => {
    call += 1;
    const text =
      call === 1
        ? "not json"
        : "NOTE: here is the object\n{\"status\":\"pass\",\"summary\":\"ok\"}";
    return JSON.stringify({ payloads: [{ text }], meta: { agentMeta: { provider: "ollama", model: "mistral" } } });
  };

  const res = await executeAutoContinueWithLocalFirstV1({
    taskId: "337",
    taskBody: "STATUS PASS",
    promptText: "p",
    strictRetryPrompt: "r",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: "main",
    cloudForbidden: true,
    run,
    routingState,
    extractFinalText: (env: any) => env?.payloads?.[0]?.text ?? "",
    parseStructured: () => ({ kind: "invalid" } as any),
    deltaDemandsPass: () => true,
    coerceLooseJsonToResultContract: (obj: any, id: string) => (obj ? { TASK_ID: id, STATUS: "PASS", SUMMARY: obj.summary } : null)
  });

  assert.ok(res.coerced);
  assert.equal(res.coerced.STATUS, "PASS");
});

