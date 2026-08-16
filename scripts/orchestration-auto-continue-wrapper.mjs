import { executeAutoContinueWithLocalFirstV1 } from "./orchestration-routing-core.mjs";

// Wrapper used by orchestration-run-issue-openclaw.mjs to prevent nested retry multiplication.
// Contract: this is the ONLY place AUTO_CONTINUE runs are allowed to invoke `run()`.

export function normalizeV3LocalPromptForSingleRetry(text) {
  return String(text ?? "")
    .replaceAll("OrchestrationResultContractV1", "orchestration result JSON contract")
    .replaceAll("STRICT_JSON_ONLY_RETRY", "STRICT_OUTPUT_RETRY")
    .replaceAll("STRICT_JSON_ONLY", "STRICT_OUTPUT");
}

export async function executeAutoContinueOnceV1(input) {
  const {
    taskId,
    taskBody,
    promptText,
    strictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    cloudForbidden,
    verifyStructuredResult,
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

  const singleRetryLocal = Boolean(localRoutingEnabled && cloudForbidden);
  const routedPromptText = singleRetryLocal ? normalizeV3LocalPromptForSingleRetry(promptText) : promptText;
  const routedStrictRetryPrompt = singleRetryLocal ? normalizeV3LocalPromptForSingleRetry(strictRetryPrompt) : strictRetryPrompt;

  const exec = await executeAutoContinueWithLocalFirstV1({
    taskId,
    taskBody,
    promptText: routedPromptText,
    strictRetryPrompt: routedStrictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    cloudForbidden,
    verifyStructuredResult,
    run,
    routingState,
    extractFinalText,
    parseStructured,
    deltaDemandsPass,
    coerceLooseJsonToResultContract
  });

  return { exec, routingState };
}
