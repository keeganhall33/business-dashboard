import { getSupabaseServerClient } from "./server";
import { canTransitionTaskStatus } from "@/lib/domain/taskStatus";
import type {
  AgentKey,
  OpportunityStatus,
  OpportunityType,
  RunType,
  TaskPriority,
  TaskStatus
} from "@/lib/types/requests";

function nowIso() {
  return new Date().toISOString();
}

// -----------------------------
// Scoreboard metrics
// -----------------------------
export async function getLatestScoreboardMetrics() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("vw_latest_scoreboard").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getCommerceTelemetry(range: { startDate: string; endDate: string }) {
  const supabase = getSupabaseServerClient();

  const [woo, ga4, funnel] = await Promise.all([
    supabase.rpc("get_woo_metrics", { start_date: range.startDate, end_date: range.endDate }),
    supabase.rpc("get_ga4_metrics", { start_date: range.startDate, end_date: range.endDate }),
    supabase.rpc("get_funnelkit_metrics", { start_date: range.startDate, end_date: range.endDate })
  ]);

  const error = woo.error ?? ga4.error ?? funnel.error;
  if (error) throw error;

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    woo: woo.data ?? {},
    ga4: ga4.data ?? {},
    funnel: funnel.data ?? {}
  };
}

// -----------------------------
// Tasks
// -----------------------------
export async function getOpenTasks(limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("*")
    .in("status", ["pending", "in_review", "approved", "in_progress", "blocked"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getTasks(filters: { agentKey?: string; priority?: string; status?: string }) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from("task_queue").select("*", { count: "exact" }).order("created_at", { ascending: false });

  if (filters.agentKey) query = query.eq("agent_key", filters.agentKey);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], count: count ?? (data?.length ?? 0) };
}

export async function getTaskById(id: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("task_queue").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function findOpenTaskByTitle(agentKey: string, title: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("*")
    .eq("agent_key", agentKey)
    .eq("title", title)
    .in("status", ["pending", "in_review", "approved", "in_progress", "blocked"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function createTask(input: {
  title: string;
  description?: string;
  agentKey: string;
  priority: TaskPriority | string;
  expectedImpact?: string;
  impactScore?: number;
  whyThisMatters?: string;
  relatedMetricKeys?: string[];
  requiresApproval?: boolean;
  executionType: string;
  createdBy?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .insert({
      title: input.title,
      description: input.description ?? null,
      agent_key: input.agentKey,
      priority: input.priority,
      status: "pending",
      expected_impact: input.expectedImpact ?? null,
      impact_score: input.impactScore ?? null,
      why_this_matters: input.whyThisMatters ?? null,
      related_metric_keys: input.relatedMetricKeys ?? [],
      requires_approval: input.requiresApproval ?? false,
      approved_by_user: false,
      execution_type: input.executionType,
      created_by: input.createdBy ?? "system"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskApproval(id: string, approvedByUser: boolean) {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = {
    approved_by_user: approvedByUser,
    approved_at: approvedByUser ? nowIso() : null
  };

  // If approving, move to approved unless already beyond.
  if (approvedByUser) {
    patch.status = "approved";
  }

  const { data, error } = await supabase
    .from("task_queue")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function rejectTask(id: string, reason: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .update({
      status: "rejected",
      rejection_reason: reason,
      approved_by_user: false,
      rejected_at: nowIso()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskStatus(id: string, nextStatus: TaskStatus) {
  const supabase = getSupabaseServerClient();
  const existing = await getTaskById(id);
  const currentStatus = existing.status as TaskStatus;

  if (!canTransitionTaskStatus(currentStatus, nextStatus)) {
    throw new Error(`Invalid task status transition: ${currentStatus} -> ${nextStatus}`);
  }

  const approvalBlocked =
    Boolean(existing.requires_approval) &&
    !existing.approved_by_user &&
    ["in_progress", "completed"].includes(nextStatus);

  if (approvalBlocked) {
    throw new Error("Task requires user approval before execution can proceed");
  }

  const { data, error } = await supabase
    .from("task_queue")
    .update({ status: nextStatus })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function completeTask(id: string, resultSummary: string) {
  const supabase = getSupabaseServerClient();
  // enforce transition through updateTaskStatus
  await updateTaskStatus(id, "completed");

  const { data, error } = await supabase
    .from("task_queue")
    .update({
      result_summary: resultSummary,
      completed_at: nowIso()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentTasks(limit = 200) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getTasksAwaitingApproval(limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("*")
    .eq("requires_approval", true)
    .eq("approved_by_user", false)
    .in("status", ["pending", "in_review", "approved"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getTaskCountsByStatus() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("status")
    .order("status", { ascending: true });
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

// -----------------------------
// Agents
// -----------------------------
export async function getAgentProfile(agentKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("agent_key", agentKey)
    .single();
  if (error) throw error;
  return data;
}

export async function getAgentUpdates(agentKey: string, limit = 10) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_updates")
    .select("*")
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createAgentUpdate(input: {
  agentKey: string;
  updateType: string;
  title: string;
  summary: string;
  detailMd?: string;
  priority?: string;
  relatedMetricKeys?: string[];
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_updates")
    .insert({
      agent_key: input.agentKey,
      update_type: input.updateType,
      title: input.title,
      summary: input.summary,
      detail_md: input.detailMd ?? null,
      priority: input.priority ?? "medium",
      related_metric_keys: input.relatedMetricKeys ?? []
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAgentHealth() {
  const supabase = getSupabaseServerClient();
  const { data: profiles, error: profilesError } = await supabase.from("agent_profiles").select("*");
  if (profilesError) throw profilesError;

  const agentKeys = (profiles ?? []).map((p: { agent_key: string }) => p.agent_key);

  const health = await Promise.all(
    agentKeys.map(async (agentKey) => {
      const [runs, openTasks, completedTasks] = await Promise.all([
        getRecentSystemRunsByAgent(agentKey, 1),
        supabase
          .from("task_queue")
          .select("id", { count: "exact" })
          .eq("agent_key", agentKey)
          .in("status", ["pending", "in_review", "approved", "in_progress", "blocked"]),
        supabase
          .from("task_queue")
          .select("id", { count: "exact" })
          .eq("agent_key", agentKey)
          .eq("status", "completed")
      ]);

      type CountResponse = { count: number | null; data: unknown[] | null };
      const openCount = (openTasks as unknown as CountResponse).count ?? 0;
      const completed = completedTasks as unknown as CountResponse;
      const completedCount = completed.count ?? (completed.data?.length ?? 0);

      return {
        agentKey,
        lastRunAt: runs[0]?.started_at ?? null,
        openTaskCount: openCount,
        completedTaskCount: completedCount,
        health: "healthy" as const
      };
    })
  );

  return health;
}

// -----------------------------
// Opportunities
// -----------------------------
export async function getActiveOpportunities(limit = 25) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .not("status", "in", "(won,lost,parked)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getOpportunityById(id: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getOpportunities(filters: { ownerAgent?: string; status?: string }) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("opportunity_pipeline")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.ownerAgent) query = query.eq("owner_agent", filters.ownerAgent);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], count: count ?? (data?.length ?? 0) };
}

export async function createOpportunity(input: {
  name: string;
  organization?: string;
  opportunityType: OpportunityType | string;
  status: OpportunityStatus | string;
  valueEstimate?: number;
  prestigeScore?: number;
  probabilityScore?: number;
  ownerAgent: AgentKey | string;
  nextStep?: string;
  nextStepDueAt?: string;
  notesMd?: string;
  source?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .insert({
      name: input.name,
      organization: input.organization ?? null,
      opportunity_type: input.opportunityType,
      status: input.status,
      value_estimate: input.valueEstimate ?? null,
      prestige_score: input.prestigeScore ?? null,
      probability_score: input.probabilityScore ?? null,
      owner_agent: input.ownerAgent,
      next_step: input.nextStep ?? null,
      next_step_due_at: input.nextStepDueAt ?? null,
      notes_md: input.notesMd ?? null,
      source: input.source ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateOpportunityStatus(id: string, status: OpportunityStatus) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentOpportunities(limit = 200) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getLatestOpportunitiesByStatus(status: string, limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .eq("status", status)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------
// Decisions
// -----------------------------
export async function createDecision(input: {
  decisionType: string;
  title: string;
  summary: string;
  detailMd?: string;
  expectedOutcome?: string;
  outcomeReviewDate?: string;
  decidedBy?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("decision_log")
    .insert({
      decision_type: input.decisionType,
      title: input.title,
      summary: input.summary,
      detail_md: input.detailMd ?? null,
      expected_outcome: input.expectedOutcome ?? null,
      outcome_review_date: input.outcomeReviewDate ?? null,
      decided_by: input.decidedBy ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// -----------------------------
// System runs
// -----------------------------
export async function createSystemRun(input: {
  agentKey: string;
  runType: RunType | string;
  status?: string;
  startedAt?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_runs")
    .insert({
      agent_key: input.agentKey,
      run_type: input.runType,
      status: input.status ?? "running",
      started_at: input.startedAt ?? nowIso()
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function finishSystemRun(
  id: string,
  input: { status: "completed" | "failed"; outputsJson?: Record<string, unknown>; errorsMd?: string }
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_runs")
    .update({
      status: input.status,
      finished_at: nowIso(),
      outputs_json: input.outputsJson ?? {},
      errors_md: input.errorsMd ?? null
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentSystemRunsByAgent(agentKey: string, limit = 10) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_runs")
    .select("*")
    .eq("agent_key", agentKey)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------
// Metric alert rules
// -----------------------------
export async function getMetricAlertRules() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("metric_alert_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// -----------------------------
// Scheduler tables
// -----------------------------
export async function createJobRunLog(input: {
  jobKey: string;
  status: "running" | "completed" | "failed";
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_run_log")
    .insert({ job_key: input.jobKey, status: input.status })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function touchScheduledJobLastRun(jobKey: string, startedAtIso?: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("scheduled_jobs")
    .update({ last_run_at: startedAtIso ?? nowIso() })
    .eq("job_key", jobKey);
  if (error) throw error;
  return { ok: true } as const;
}

export async function finishJobRunLog(
  id: string,
  input: { status: "completed" | "failed"; summary?: string; detailsJson?: Record<string, unknown>; errorMd?: string }
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_run_log")
    .update({
      status: input.status,
      finished_at: nowIso(),
      summary: input.summary ?? null,
      details_json: input.detailsJson ?? {},
      error_md: input.errorMd ?? null
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getOpenAlerts(limit = 100) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUnresolvedAlerts(limit = 100) {
  return getOpenAlerts(limit);
}

export async function getOpenAlertByDedupeKey(dedupeKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("dedupe_key", dedupeKey)
    .eq("is_resolved", false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSystemAlert(input: {
  alertType: string;
  severity: string;
  title: string;
  summary: string;
  relatedAgentKey?: string | null;
  relatedTaskId?: string | null;
  relatedMetricKey?: string | null;
  dedupeKey: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_alerts")
    .insert({
      alert_type: input.alertType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      related_agent_key: input.relatedAgentKey ?? null,
      related_task_id: input.relatedTaskId ?? null,
      related_metric_key: input.relatedMetricKey ?? null,
      dedupe_key: input.dedupeKey
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function incrementAlertEscalation(
  id: string,
  input: { severity: string; summary: string }
) {
  const supabase = getSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("id", id)
    .single();
  if (existingError) throw existingError;

  const { data, error } = await supabase
    .from("system_alerts")
    .update({
      severity: input.severity,
      summary: input.summary,
      escalation_count: (existing.escalation_count ?? 0) + 1,
      last_escalated_at: nowIso()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function resolveSystemAlert(dedupeKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_alerts")
    .update({ is_resolved: true, resolved_at: nowIso() })
    .eq("dedupe_key", dedupeKey)
    .eq("is_resolved", false)
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getSystemState(key: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_state")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSystemState(key: string, valueJson: Record<string, unknown>) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_state")
    .upsert({ key, value_json: valueJson, updated_at: nowIso() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestAgentDirective() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_updates")
    .select("*")
    .eq("agent_key", "avery")
    .eq("update_type", "directive")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getRecentOpportunitiesForPulse(limit = 200) {
  return getRecentOpportunities(limit);
}
