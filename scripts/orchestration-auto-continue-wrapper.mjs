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
      taskBody,
      localAgentId
    });
    if (generic && generic.ok === false) return generic;
    if (typeof verifyStructuredResult === "function") {
      return verifyStructuredResult(context) ?? { ok: true };
    }
    return generic ?? { ok: true };
  };

  const repoGuard = [
    "### REPOSITORY_ROOT_GUARD (AUTHORITATIVE)",
    "Your configured OpenClaw agent workspace is the repository/worktree root for this task.",
    "Do NOT search for a nested directory named business-dashboard before working.",
    "Before reporting that the repository, git metadata, branch, or required files are missing, you MUST actually invoke exec and run: pwd; git rev-parse --show-toplevel; git status --short --branch.",
    "If git rev-parse succeeds, the repository exists. Continue from that directory and do not report REPOSITORY_NOT_FOUND.",
    "Use repository-relative paths from that root. Do not invent paths, test commands, commits, or PR updates.",
    "If the task references an existing PR branch, inspect the current worktree/HEAD first before attempting any checkout or branch mutation.",
    "If the task requires reconciliation with current main, actually fetch origin main and make origin/main an ancestor of the final PR/worktree HEAD before reporting PASS.",
    "A machine verifier will independently check git HEAD, origin/main ancestry, changed files, PR head SHA, and mergeability. False PASS claims will be rejected."
  ].join("\n");

  const guardedPromptText = [repoGuard, "", String(promptText ?? "")].join("\n");
  const guardedRetryPrompt = [repoGuard, "", String(strictRetryPrompt ?? "")].join("\n");

  const exec = await executeAutoContinueWithLocalFirstV1({
    taskId,
    taskBody,
    promptText: guardedPromptText,
    strictRetryPrompt: guardedRetryPrompt,
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
