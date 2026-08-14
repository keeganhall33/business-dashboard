import { executeAutoContinueWithLocalFirstV1 } from "./orchestration-routing-core.mjs";

// Wrapper used by orchestration-run-issue-openclaw.mjs to prevent nested retry multiplication.
// Contract: this is the ONLY place AUTO_CONTINUE runs are allowed to invoke `run()`.

export async function executeAutoContinueOnceV1(input) {
  const {
    taskId,
    taskBody,
    promptText,
    strictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    run,
    extractFinalText,
    parseStructured,
    deltaDemandsPass,
    coerceLooseJsonToResultContract
  } = input;

  const routingState = {
    attemptedAgents: [],
    localAttempted: false,
    localResult: null,
    escalatedToCloud: false,
    escalationReason: null
  };

  const exec = await executeAutoContinueWithLocalFirstV1({
    taskId,
    taskBody,
    promptText,
    strictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    run,
    routingState,
    extractFinalText,
    parseStructured,
    deltaDemandsPass,
    coerceLooseJsonToResultContract
  });

  return { exec, routingState };
}

