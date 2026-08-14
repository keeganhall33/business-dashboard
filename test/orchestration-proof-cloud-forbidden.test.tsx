import test from "node:test";
import assert from "node:assert/strict";

import { executeAutoContinueWithLocalFirstV1 } from "../scripts/orchestration-routing-core.mjs";

test("cloudForbidden prevents cloud escalation when local outputs are invalid", async () => {
  const calls: Array<{ agentId: string }> = [];
  const run = async (agentId: string) => {
    calls.push({ agentId });
    return JSON.stringify({ payloads: [{ text: "not json" }], meta: { agentMeta: { provider: "ollama", model: "mistral" } } });
  };

  const routingState = {
    attemptedAgents: [] as string[],
    localAttempted: false,
    localResult: null as any,
    escalatedToCloud: false,
    escalationReason: null as any
  };

  await executeAutoContinueWithLocalFirstV1({
    taskId: "337",
    taskBody: "",
    promptText: "Return ONLY OrchestrationResultContractV1 as strict JSON",
    strictRetryPrompt: "STRICT_JSON_ONLY_RETRY",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: "main",
    cloudForbidden: true,
    verifyStructuredResult: () => ({ ok: false }),
    run,
    routingState,
    extractFinalText: (env: any) => env?.payloads?.[0]?.text ?? "",
    parseStructured: () => ({ kind: "invalid", error: "bad" } as any),
    deltaDemandsPass: () => false,
    coerceLooseJsonToResultContract: () => null
  });

  assert.equal(calls.some((c) => c.agentId === "main"), false);
});

