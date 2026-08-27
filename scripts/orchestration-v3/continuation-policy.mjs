export const MAX_LOCAL_ROUNDS = 3;

const HARD_BLOCKER_PATTERNS = [
  /HUMAN[_ -]?APPROVAL/i,
  /WORKTREE.*INTEGRITY/i,
  /MASS[_ -]?DELETION/i,
  /PERMISSION/i,
  /AUTH(?:ENTICATION|ORIZATION)?[^A-Z0-9]*(?:FAILED|REQUIRED|DENIED)/i,
  /REQUIRED_(?:DEPENDENCY|SERVICE)_UNAVAILABLE/i,
  /IRREDUCIBLE_(?:TEST|VALIDATION)_FAILURE/i
];

export function isConcreteHardBlocker(blockers = []) {
  return blockers.some((value) => HARD_BLOCKER_PATTERNS.some((pattern) => pattern.test(String(value))));
}

export function missingImplementationEvidence(blockers = []) {
  return blockers.filter((value) => /^(?:MISSING_OBSERVED_|NO_REAL_GIT_OR_PR_STATE_MUTATION|OPENCLAW_PROCESS_|PROVIDER_MISMATCH|MODEL_MISMATCH|FALLBACK_NOT_PROVEN_FALSE|NO_VALID_ORCHESTRATION_RESULT)/.test(String(value)));
}

export function shouldContinueLocalRun({ completedRound, status, blockers = [] }) {
  if (completedRound >= MAX_LOCAL_ROUNDS) return false;
  if (isConcreteHardBlocker(blockers)) return false;
  if (status === "PASS") return false;
  return true;
}

export function buildContinuationPrompt(basePrompt, { nextRound, blockers = [] }) {
  const missing = [...new Set(missingImplementationEvidence(blockers))];
  return [
    basePrompt,
    "",
    `DETERMINISTIC CONTINUATION ROUND ${nextRound}/${MAX_LOCAL_ROUNDS}.`,
    "The previous bounded attempt ended without sufficient host-observed implementation evidence. Reconnaissance is complete; continue the SAME issue in the SAME protected worktree and branch.",
    missing.length ? `EXACT MISSING EVIDENCE: ${missing.join(", ")}` : "EXACT MISSING EVIDENCE: prior result was non-PASS without a concrete external/safety blocker.",
    "Do not return BLOCKED merely because the previous model turn stopped early, parsing failed, or you have only inspected the repository.",
    "Continue now through the required sequence: EDIT -> TEST/BUILD/TYPECHECK AS REQUIRED -> GIT DIFF -> GIT DIFF --CHECK WHEN REQUIRED -> GIT ADD/COMMIT -> PUSH OR UPDATE THE REQUIRED PR.",
    "Return only after that sequence succeeds or a concrete external/safety blocker prevents further local progress.",
    "All existing worktree integrity, mass-deletion, human approval, production read-only, lease, observed-wrapper, and zero paid-cloud safeguards remain mandatory."
  ].join("\n");
}
