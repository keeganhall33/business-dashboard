import type { ExecutionClass } from "./types";
import { extractReferenceDelta } from "./issue-sections";

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

  const reference = s.reference ? `REFERENCE:\n${s.reference}` : `REFERENCE: (missing)`;
  const delta = s.delta ? `DELTA:\n${s.delta}` : `DELTA: (missing)`;
  const goal = s.goal ? `GOAL:\n${s.goal}` : "";
  const constraints = s.constraints ? `CONSTRAINTS:\n${s.constraints}` : "";
  const acceptance = s.acceptance ? `ACCEPTANCE CRITERIA:\n${s.acceptance}` : "";

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

  return [header, "", safety, reference, "", delta, "", goal, "", constraints, "", acceptance, "", outputContract]
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .join("\n\n");
}

