import type { ExecutionClass } from "./types";
import { extractReferenceDelta } from "./issue-sections";

function safeTrunc(s: string, max: number) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "\n…(truncated)";
}

export function buildCompactAgentPrompt(params: {
  repo: string;
  issueNumber: number;
  title: string;
  body: string;
  executionClass: ExecutionClass;
}): string {
  const s = extractReferenceDelta(params.body);

  const header = [
    `You are Jeeves executing GitHub orchestration task #${params.issueNumber} in ${params.repo}.`,
    `Work from the local business-dashboard repository/worktree.`,
    `Do NOT use Telegram for routine progress; all routine results go to GitHub issue comments.`,
    `TASK TITLE: ${params.title}`
  ].join("\n");

  const safety = [
    `Safety gates (hard):`,
    `- Never execute human-gated actions (credentials, outreach, purchases, destructive actions, material production writes).`,
    `- No DB schema/migrations unless explicitly allowed (default: forbidden).`,
    `- No SMTP/email sending.`,
    `- No external publishing beyond GitHub issue/PR comments.`,
    ``
  ].join("\n");

  const bodyFallbackNeeded = !s.reference && !s.delta;

  const reference = s.reference
    ? `REFERENCE:\n${s.reference}`
    : bodyFallbackNeeded
      ? `REFERENCE:\n(see BODY_FALLBACK)`
      : `REFERENCE: (missing)`;

  const delta = s.delta
    ? `DELTA:\n${s.delta}`
    : bodyFallbackNeeded
      ? `DELTA:\n(see BODY_FALLBACK)`
      : `DELTA: (missing)`;
  const goal = s.goal ? `GOAL:\n${s.goal}` : "";
  const constraints = s.constraints ? `CONSTRAINTS:\n${s.constraints}` : "";
  const acceptance = s.acceptance ? `ACCEPTANCE CRITERIA:\n${s.acceptance}` : "";

  const bodyFallback = bodyFallbackNeeded
    ? [`BODY_FALLBACK (bounded):`, safeTrunc(params.body, 1600)].join("\n")
    : "";

  const outputContract =
    params.executionClass === "ARCHITECT_REVIEW_REQUIRED"
      ? [
          `Return ONLY ArchitectCheckpointV1 as strict JSON (no prose).`,
          `Do NOT implement code changes until architect approval is explicitly recorded.`
        ].join("\n")
      : [
          `Return ONLY OrchestrationResultContractV1 as strict JSON (no prose).`,
          `If blocked, set STATUS=BLOCKED and explain blockers.`
        ].join("\n");

  const resultSkeleton =
    params.executionClass === "ARCHITECT_REVIEW_REQUIRED"
      ? ""
      : [
          `Required fields (OrchestrationResultContractV1):`,
          `TASK_ID, STATUS, SUMMARY, CHANGES, FILES_CHANGED, DB_CHANGES, MIGRATION, TESTS, PR, MERGE_STATUS, PRODUCTION_CHANGE, UNEXPECTED_RESULTS, DECISIONS_REQUIRED, BLOCKERS, NEXT_RECOMMENDED_TASK, SESSION_HEALTH, SESSION_CONTEXT.`,
          ``,
          `Return a single JSON object. Example skeleton (fill with real values):`,
          `{`,
          `  "TASK_ID": "...",`,
          `  "STATUS": "COMPLETED",`,
          `  "SUMMARY": "...",`,
          `  "CHANGES": [],`,
          `  "FILES_CHANGED": [],`,
          `  "DB_CHANGES": "NO",`,
          `  "MIGRATION": null,`,
          `  "TESTS": "...",`,
          `  "PR": null,`,
          `  "MERGE_STATUS": "N/A",`,
          `  "PRODUCTION_CHANGE": "NO",`,
          `  "UNEXPECTED_RESULTS": [],`,
          `  "DECISIONS_REQUIRED": [],`,
          `  "BLOCKERS": [],`,
          `  "NEXT_RECOMMENDED_TASK": null,`,
          `  "SESSION_HEALTH": "GOOD",`,
          `  "SESSION_CONTEXT": "UNKNOWN"`,
          `}`
        ].join("\n");

  return [header, "", safety, reference, "", delta, "", goal, "", constraints, "", acceptance, "", bodyFallback, "", resultSkeleton, "", outputContract]
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .join("\n\n");
}
