import assert from "node:assert/strict";
import test from "node:test";

// Import the routing core module.
const modPromise = import("../scripts/orchestration-routing-core.mjs");

test("coercion: local parse exception -> strict retry small success JSON -> coerced PASS contract -> zero cloud", async () => {
  const mod: any = await modPromise;
  assert.ok(typeof mod.executeAutoContinueWithLocalFirstV1 === "function");

  const attemptedAgents: string[] = [];
  const routingState = {
    attemptedAgents,
    localAttempted: false,
    localResult: "NOT_ATTEMPTED",
    escalatedToCloud: false,
    escalationReason: null as null | string
  };

  // First local attempt returns NON-JSON envelope (parse exception).
  // Second local attempt returns a JSON envelope whose payload text is small json {status,summary}.
  let localCalls = 0;
  const run = async (agentId: string, _message: string) => {
    if (agentId === "local" && localCalls++ === 0) return "I will not return json";
    if (agentId === "local") {
      return JSON.stringify({
        result: {
          payloads: [{ text: '{"status":"success","summary":"OrchestrationResultContractV1 strict JSON returned for task orch-v1-nl-auto-proof-016."}' }],
          meta: { agentMeta: { provider: "ollama", model: "mistral:latest" } }
        },
        status: "ok",
        summary: "completed",
        runId: "r"
      });
    }
    throw new Error("cloud should not be called");
  };

  const exec = await mod.executeAutoContinueWithLocalFirstV1({
    taskId: "orch-v1-nl-auto-proof-016",
    taskBody: "### Delta\nReturn ONLY OrchestrationResultContractV1 with STATUS PASS\n",
    promptText: "base",
    strictRetryPrompt: "retry",
    localRoutingEnabled: true,
    localAgentId: "local",
    cloudAgentId: "main",
    run,
    routingState,
    extractFinalText: (env: any) => env.result.payloads[0].text,
    parseStructured: (text: string) => {
      // emulate adapter parse: treat plain json as invalid contract
      if (text.trim().startsWith("{")) return { kind: "invalid", error: "JSON parsed but did not match known contracts" };
      return { kind: "invalid", error: "empty" };
    },
    deltaDemandsPass: (_: string) => true,
    coerceLooseJsonToResultContract: (obj: any, taskId: string) => {
      const status = String(obj?.status ?? "").toLowerCase();
      const summary = typeof obj?.summary === "string" ? obj.summary : null;
      if ((status === "success" || status === "pass" || status === "ok") && summary) {
        return { TASK_ID: taskId, STATUS: "PASS", SUMMARY: summary, CHANGES: [], FILES_CHANGED: [], DB_CHANGES: "NO", MIGRATION: null, TESTS: "N/A", PR: null, MERGE_STATUS: "N/A", PRODUCTION_CHANGE: "NO", UNEXPECTED_RESULTS: [], DECISIONS_REQUIRED: [], BLOCKERS: [], NEXT_RECOMMENDED_TASK: null, SESSION_HEALTH: "GOOD", SESSION_CONTEXT: "UNKNOWN" };
      }
      return null;
    }
  });

  assert.deepEqual(attemptedAgents, ["local", "local"]);
  assert.equal(routingState.escalatedToCloud, false);
  assert.ok(exec.coerced);
  assert.equal(exec.coerced.STATUS, "PASS");
  assert.equal(exec.coerced.TASK_ID, "orch-v1-nl-auto-proof-016");
});

test("coercion is not applied for non-PASS tasks", async () => {
  const mod: any = await modPromise;

  const attemptedAgents: string[] = [];
  const routingState = {
    attemptedAgents,
    localAttempted: false,
    localResult: "NOT_ATTEMPTED",
    escalatedToCloud: false,
    escalationReason: null as null | string
  };

  const run = async (agentId: string, _message: string) => {
    if (agentId === "local" && attemptedAgents.length === 0) return "I will not return json";
    if (agentId === "local" && attemptedAgents.length === 1) {
      return JSON.stringify({
        result: {
          payloads: [{ text: '{"status":"success","summary":"ok"}' }],
          meta: { agentMeta: { provider: "ollama", model: "mistral:latest" } }
        },
        status: "ok",
        summary: "completed",
        runId: "r"
      });
    }
    return JSON.stringify({
      result: { payloads: [{ text: '{"TASK_ID":"x","STATUS":"PASS","SUMMARY":"cloud"}' }], meta: { agentMeta: { provider: "openai", model: "gpt" } } },
      status: "ok",
      runId: "c",
      summary: "completed"
    });
  };

  const exec = await mod.executeAutoContinueWithLocalFirstV1({
    taskId: "x",
    taskBody: "### Delta\nSome other task\n",
    promptText: "base",
    strictRetryPrompt: "retry",
    localRoutingEnabled: true,
    localAgentId: "local",
    cloudAgentId: "main",
    run,
    routingState,
    extractFinalText: (env: any) => env.result.payloads[0].text,
    parseStructured: (_text: string) => ({ kind: "invalid", error: "JSON parsed but did not match known contracts" }),
    deltaDemandsPass: (_: string) => false,
    coerceLooseJsonToResultContract: (_obj: any, _taskId: string) => null
  });

  assert.equal(exec.coerced, null);
  assert.equal(routingState.escalatedToCloud, true);
});

export {};
