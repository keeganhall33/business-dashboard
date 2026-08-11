import type { OrchestrationTaskV1 } from "./types";

type Parsed = {
  ok: true;
  task: OrchestrationTaskV1;
} | {
  ok: false;
  error: string;
};

function pick(body: string, label: string) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\n]+)`, "i");
  const m = body.match(re);
  return m ? m[1]!.trim() : null;
}

function parseBool(v: string | null) {
  if (!v) return null;
  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;
  return null;
}

export function parseOrchestrationTaskFromIssueBody(params: {
  issue_number: number;
  body: string;
  assigned_agent_fallback?: string;
}): Parsed {
  const body = params.body ?? "";
  const task_id = pick(body, "task_id");
  const milestone = pick(body, "milestone");
  const stream = pick(body, "stream");
  const requested_by = pick(body, "requested_by");
  const assigned_agent = pick(body, "assigned_agent") ?? params.assigned_agent_fallback ?? "JEEVES";
  const priorityRaw = pick(body, "priority");
  const human = parseBool(pick(body, "human_approval_required"));

  if (!task_id) return { ok: false, error: "Missing task_id" };
  if (!milestone) return { ok: false, error: "Missing milestone" };
  if (!stream) return { ok: false, error: "Missing stream" };
  if (!requested_by) return { ok: false, error: "Missing requested_by" };
  if (!priorityRaw) return { ok: false, error: "Missing priority" };
  if (human == null) return { ok: false, error: "Missing/invalid human_approval_required" };

  const priority = priorityRaw.toUpperCase().startsWith("P") ? (priorityRaw.toUpperCase() as any) : "P2";

  const now = new Date().toISOString();
  const task: OrchestrationTaskV1 = {
    task_id,
    parent_task_id: null,
    milestone,
    stream: stream as any,
    requested_by: requested_by as any,
    assigned_agent,
    task_type: "github_issue",
    directive: body,
    scope: [],
    constraints: [],
    allowed_actions: [],
    forbidden_actions: [],
    acceptance_criteria: [],
    status: "READY",
    priority,
    created_at: now,
    started_at: null,
    completed_at: null,
    branch: null,
    commit: null,
    pr_url: null,
    human_approval: { required: human, reason: null },
    attempt_count: 0
  };

  return { ok: true, task };
}

