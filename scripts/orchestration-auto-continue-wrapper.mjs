import { executeAutoContinueWithLocalFirstV1 } from "./orchestration-routing-core.mjs";
import { verifyOrchestrationResultEvidenceV1 } from "./orchestration-result-evidence-v1.mjs";

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

  const verifyWithEvidence = (context) => {
    const generic = verifyOrchestrationResultEvidenceV1({
      parsed: context?.parsed,
      taskId,
      localAgentId
    });
    if (generic && generic.ok === false) return generic;
    if (typeof verifyStructuredResult === "function") {
      return verifyStructuredResult(context) ?? { ok: true };
    }
    return { ok: true };
  };

  const exec = await executeAutoContinueWithLocalFirstV1({
    taskId,
    taskBody,
    promptText,
    strictRetryPrompt,
    localRoutingEnabled,
    localAgentId,
    cloudAgentId,
    cloudForbidden,
    verifyStructuredResult: verifyWithEvidence,
    run,
    routingState,
    extractFinalText,
    parseStructured,
    deltaDemandsPass,
    coerceLooseJsonToResultContract
  });

  return { exec, routingState };
}
