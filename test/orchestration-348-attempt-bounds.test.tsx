import test from "node:test";
import assert from "node:assert/strict";
import { executeAutoContinueWithLocalFirstV1 } from "../scripts/orchestration-routing-core.mjs";

function okEnvelope(text: string) {
  return JSON.stringify({ result: { meta: { agentMeta: { model: "ollama/mistral:latest", provider: "ollama" } }, payloads: [{ text }] } });
}

test("attempt bounds: local success first attempt => local=1 cloud=0", async () => {
  const calls: string[] = [];
  const routingState = { attemptedAgents: [], localAttempted: false, localResult: null, escalatedToCloud: false, escalationReason: null };

  const res = await executeAutoContinueWithLocalFirstV1({
    taskId: "t",
    taskBody: "",
    promptText: "p",
    strictRetryPrompt: "r",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: "main",
    routingState,
    run: async (agentId: string) => {
      calls.push(agentId);
      return okEnvelope(JSON.stringify({ TASK_ID: "t", STATUS: "PASS" }));
    },
    extractFinalText: (env: any) => env?.result?.payloads?.[0]?.text ?? "",
    parseStructured: (text: string) => ({ kind: "result", value: JSON.parse(text) }),
    deltaDemandsPass: () => false,
    coerceLooseJsonToResultContract: () => null
  });

  assert.equal(res.final.ok, true);
  assert.deepEqual(calls, ["local-d"]);
});

test("attempt bounds: local invalid then valid => local=2 cloud=0", async () => {
  const calls: string[] = [];
  const routingState = { attemptedAgents: [], localAttempted: false, localResult: null, escalatedToCloud: false, escalationReason: null };

  let n = 0;
  const res = await executeAutoContinueWithLocalFirstV1({
    taskId: "t",
    taskBody: "",
    promptText: "p",
    strictRetryPrompt: "r",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: "main",
    routingState,
    run: async (agentId: string) => {
      calls.push(agentId);
      n++;
      if (n === 1) return okEnvelope("not json");
      return okEnvelope(JSON.stringify({ TASK_ID: "t", STATUS: "PASS" }));
    },
    extractFinalText: (env: any) => env?.result?.payloads?.[0]?.text ?? "",
    parseStructured: (text: string) => {
      try {
        return { kind: "result", value: JSON.parse(text) };
      } catch {
        return { kind: "invalid", error: "parse" };
      }
    },
    deltaDemandsPass: () => false,
    coerceLooseJsonToResultContract: () => null
  });

  assert.equal(res.final.ok, true);
  assert.deepEqual(calls, ["local-d", "local-d"]);
});

test("attempt bounds: local invalid twice then cloud => local=2 cloud=1", async () => {
  const calls: string[] = [];
  const routingState = { attemptedAgents: [], localAttempted: false, localResult: null, escalatedToCloud: false, escalationReason: null };

  const res = await executeAutoContinueWithLocalFirstV1({
    taskId: "t",
    taskBody: "",
    promptText: "p",
    strictRetryPrompt: "r",
    localRoutingEnabled: true,
    localAgentId: "local-d",
    cloudAgentId: "main",
    routingState,
    run: async (agentId: string) => {
      calls.push(agentId);
      if (agentId === "main") return okEnvelope(JSON.stringify({ TASK_ID: "t", STATUS: "PASS" }));
      return okEnvelope("not json");
    },
    extractFinalText: (env: any) => env?.result?.payloads?.[0]?.text ?? "",
    parseStructured: (text: string) => {
      try {
        return { kind: "result", value: JSON.parse(text) };
      } catch {
        return { kind: "invalid", error: "parse" };
      }
    },
    deltaDemandsPass: () => false,
    coerceLooseJsonToResultContract: () => null
  });

  assert.equal(res.final.ok, true);
  assert.deepEqual(calls, ["local-d", "local-d", "main"]);
});

