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

type DeliverableLinkInput = {
  label: string;
  url: string;
};

type PostgrestError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function isMissingTableError(error: unknown, table: string) {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestError;
  if (pgError.code !== "PGRST205") return false;
  const haystack = `${pgError.message ?? ""} ${pgError.hint ?? ""} ${pgError.details ?? ""}`.toLowerCase();
  return haystack.includes(`public.${table}`) || haystack.includes(`'${table}'`);
}

// -----------------------------
// Industry news (RSS ingestion)
// -----------------------------

export type IndustryNewsArticleUpsert = {
  sourceKey: string;
  sourceName: string;
  title: string;
  url: string;
  guid?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  score: number;
  scoreSignals?: string[];
  summary?: string | null;
  rawJson?: unknown;
};

export async function upsertIndustryNewsArticles(rows: IndustryNewsArticleUpsert[]) {
  if (!rows.length) return { insertedOrUpdated: 0 };
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("industry_news_articles")
    .upsert(
      rows.map((r) => ({
        source_key: r.sourceKey,
        source_name: r.sourceName,
        title: r.title,
        url: r.url,
        guid: r.guid ?? null,
        published_at: r.publishedAt ?? null,
        fetched_at: r.fetchedAt ?? nowIso(),
        summary: r.summary ?? null,
        score: r.score,
        score_signals: r.scoreSignals ?? [],
        raw_json: r.rawJson ?? null
      })),
      { onConflict: "url" }
    )
    .select("id");

  if (error) {
    if (isMissingTableError(error, "industry_news_articles")) {
      return { insertedOrUpdated: 0 };
    }
    throw error;
  }

  return { insertedOrUpdated: data?.length ?? 0 };
}

export async function setIndustryNewsFeatured(input: {
  url: string;
  featuredDate: string; // YYYY-MM-DD
  featuredRank: number;
  whyNow: string;
  collabConcept: string;
  contactName: string | null;
  contactEmail: string | null;
  contactEmailSource: "extracted" | "inferred" | "inferred_person";
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("industry_news_articles")
    .update({
      featured_date: input.featuredDate,
      featured_rank: input.featuredRank,
      why_now: input.whyNow,
      collab_concept: input.collabConcept,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_email_source: input.contactEmailSource,
      enriched_at: nowIso()
    })
    .eq("url", input.url)
    .select("id,url")
    .single();

  if (error) {
    if (isMissingTableError(error, "industry_news_articles")) return null;
    throw error;
  }
  return data;
}

export async function getIndustryNewsCandidates(input: {
  publishedAfterIso: string;
  limit: number;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("industry_news_articles")
    .select("source_key,source_name,title,url,guid,published_at,summary,score,score_signals")
    .gte("published_at", input.publishedAfterIso)
    .order("score", { ascending: false })
    .limit(input.limit);
  if (error) {
    if (isMissingTableError(error, "industry_news_articles")) return [];
    throw error;
  }
  return data ?? [];
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

export async function createScoreboardMetricReading(input: {
  metricKey: string;
  currentValue: number;
  measuredAtIso?: string;
  source?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("scoreboard_metric_readings")
    .insert({
      metric_key: input.metricKey,
      current_value: input.currentValue,
      measured_at: input.measuredAtIso ?? nowIso(),
      source: input.source ?? "manual"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getScoreboardMetricsForRange(range: { startDate: string; endDate: string }) {
  const supabase = getSupabaseServerClient();
  const startIso = new Date(`${range.startDate}T00:00:00Z`).toISOString();
  const endIso = new Date(`${range.endDate}T23:59:59Z`).toISOString();

  const [definitions, readings, latest] = await Promise.all([
    supabase.from("scoreboard_metrics").select("*"),
    supabase
      .from("scoreboard_metric_readings")
      .select("metric_key,current_value,measured_at")
      .gte("measured_at", startIso)
      .lte("measured_at", endIso)
      .order("measured_at", { ascending: false }),
    getLatestScoreboardMetrics()
  ]);

  if (definitions.error) throw definitions.error;
  if (readings.error) throw readings.error;

  const readingByKey = new Map<string, { current_value: number | string | null; measured_at: string }>();
  const historyByKey = new Map<string, Array<{ measured_at: string; value: number | null }>>();
  for (const reading of readings.data ?? []) {
    if (!readingByKey.has(reading.metric_key)) {
      readingByKey.set(reading.metric_key, {
        current_value: reading.current_value,
        measured_at: reading.measured_at
      });
    }
    const entry = { measured_at: reading.measured_at, value: coerceNumber(reading.current_value) };
    const existingHistory = historyByKey.get(reading.metric_key);
    if (existingHistory) {
      existingHistory.push(entry);
    } else {
      historyByKey.set(reading.metric_key, [entry]);
    }
  }

  const fallbackByKey = new Map(latest.map((metric) => [metric.metric_key, metric]));

  const computeStats = (entries: Array<{ value: number | null }>) => {
    const numericValues = entries
      .map((entry) => entry.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!numericValues.length) return null;
    const average = numericValues.reduce((acc, value) => acc + value, 0) / numericValues.length;
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const newest = entries[0]?.value ?? null;
    const oldest = entries[entries.length - 1]?.value ?? null;
    const changePercent =
      oldest != null && newest != null && Math.abs(oldest) > 0.0001
        ? ((newest - oldest) / Math.abs(oldest)) * 100
        : null;
    return { average, min, max, changePercent };
  };

  return (definitions.data ?? []).map((definition) => {
    const historyDesc = historyByKey.get(definition.metric_key) ?? [];
    const stats = computeStats(historyDesc);
    const history = historyDesc.slice().reverse();
    const reading = readingByKey.get(definition.metric_key);
    if (reading) {
      return {
        metric_key: definition.metric_key,
        metric_name: definition.metric_name,
        category: definition.category,
        unit: definition.unit,
        target_value: definition.target_value,
        owner_agent: definition.owner_agent,
        current_value: reading.current_value,
        measured_at: reading.measured_at,
        history,
        stats
      };
    }

    const fallback = fallbackByKey.get(definition.metric_key);
    return fallback
      ? {
          ...fallback,
          history,
          stats
        }
      : {
          metric_key: definition.metric_key,
          metric_name: definition.metric_name,
          category: definition.category,
          unit: definition.unit,
          target_value: definition.target_value,
          owner_agent: definition.owner_agent,
          current_value: null,
          measured_at: null,
          history,
          stats
        };
  });
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
  expectedDurationDays?: number;
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
      created_by: input.createdBy ?? "system",
      expected_duration_days: input.expectedDurationDays ?? null
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

export async function completeTask(id: string, resultSummary: string, attachments?: DeliverableLinkInput[]) {
  const supabase = getSupabaseServerClient();
  // enforce transition through updateTaskStatus
  await updateTaskStatus(id, "completed");

  const { data, error } = await supabase
    .from("task_queue")
    .update({
      result_summary: resultSummary,
      deliverable_links: (attachments ?? []).map((link) => ({ label: link.label, url: link.url })),
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

export async function startApprovedTasks(agentKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .update({ status: "in_progress", started_at: nowIso() })
    .eq("agent_key", agentKey)
    .eq("status", "approved")
    .eq("approved_by_user", true)
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function startAutoRunnableTasks(agentKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .update({ status: "in_progress", started_at: nowIso() })
    .eq("agent_key", agentKey)
    .eq("requires_approval", false)
    .in("status", ["pending", "approved"])
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getAgentTasksByStatus(agentKey: string, statuses: string[], limit = 25) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_queue")
    .select("*")
    .eq("agent_key", agentKey)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
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

// -----------------------------
// Agent conversations & plans
// -----------------------------
export type AgentThreadType = "default" | "war_room" | "plan";
export type AgentMessageType = "plan" | "comment" | "directive" | "status" | "war_room";

export async function getOrCreateAgentThread(input: {
  agentKey: string;
  threadType: AgentThreadType;
  title?: string;
}) {
  const supabase = getSupabaseServerClient();
  const existing = await supabase
    .from("agent_threads")
    .select("*")
    .eq("agent_key", input.agentKey)
    .eq("thread_type", input.threadType)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const fallbackTitle =
    input.title ??
    `${input.agentKey} ${input.threadType === "default" ? "Command" : input.threadType === "war_room" ? "War Room" : "Plan"} Thread`;

  const inserted = await supabase
    .from("agent_threads")
    .insert({
      agent_key: input.agentKey,
      thread_type: input.threadType,
      title: fallbackTitle,
      status: "open"
    })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

export async function closeAgentThreadsByType(agentKey: string, threadType: AgentThreadType) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_threads")
    .update({ status: "closed", updated_at: nowIso() })
    .eq("agent_key", agentKey)
    .eq("thread_type", threadType)
    .eq("status", "open")
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export async function createAgentMessage(input: {
  threadId: string;
  senderType: "agent" | "ceo" | "avery" | "system";
  senderKey?: string;
  messageType: AgentMessageType;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      thread_id: input.threadId,
      sender_type: input.senderType,
      sender_key: input.senderKey ?? null,
      message_type: input.messageType,
      body: input.body,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAgentMessages(threadId: string, limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createAgentPlan(input: {
  agentKey: string;
  threadId?: string;
  title: string;
  summary?: string;
  detailMd?: string;
  payloadJson: Record<string, unknown>;
  submittedBy?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_plans")
    .insert({
      agent_key: input.agentKey,
      thread_id: input.threadId ?? null,
      title: input.title,
      summary: input.summary ?? null,
      detail_md: input.detailMd ?? null,
      payload_json: input.payloadJson,
      status: "pending",
      submitted_by: input.submittedBy ?? input.agentKey
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createOrUpdatePendingAgentPlan(input: {
  agentKey: string;
  threadId?: string;
  title: string;
  summary?: string;
  detailMd?: string;
  payloadJson: Record<string, unknown>;
  submittedBy?: string;
}) {
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("agent_plans")
    .select("id")
    .eq("agent_key", input.agentKey)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    thread_id: input.threadId ?? null,
    title: input.title,
    summary: input.summary ?? null,
    detail_md: input.detailMd ?? null,
    payload_json: input.payloadJson,
    submitted_by: input.submittedBy ?? input.agentKey,
    submitted_at: nowIso()
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("agent_plans")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("agent_plans")
    .insert({
      agent_key: input.agentKey,
      status: "pending",
      ...payload
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgentPlanStatus(input: {
  id: string;
  status: "approved" | "changes_requested";
  approvedBy?: string;
  rejectionReason?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = {
    status: input.status,
    rejection_reason: input.rejectionReason ?? null
  };
  if (input.status === "approved") {
    patch.approved_by = input.approvedBy ?? "system";
    patch.approved_at = nowIso();
  }

  const { data, error } = await supabase
    .from("agent_plans")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAgentPlans(agentKey: string, options?: { status?: string; limit?: number }) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("agent_plans")
    .select("*")
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 10);

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPendingAgentPlans(limit = 15) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_plans")
    .select("*")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false })
    .limit(limit * 2);
  if (error) throw error;
  if (!data) return [];
  const seen = new Set<string>();
  const deduped: typeof data = [];
  for (const plan of data) {
    const key = plan.agent_key as string;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(plan);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export async function getAgentPlanById(id: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("agent_plans").select("*").eq("id", id).single();
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

export type ActiveOpportunityViewRow = {
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: string;
  status: string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: string;
  contact_name: string | null;
  contact_role: string | null;
  next_step: string | null;
  next_step_due_at: string | null;
  notes_md: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

// Primary discovery input: vw_active_opportunities.
// This view is expected to exclude inactive/closed records by default.
export async function getActiveOpportunitiesVw(limit = 25): Promise<ActiveOpportunityViewRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("vw_active_opportunities")
    .select(
      "id,name,organization,opportunity_type,status,value_estimate,prestige_score,probability_score,owner_agent,contact_name,contact_role,next_step,next_step_due_at,notes_md,source,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ActiveOpportunityViewRow[];
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

export async function getCollectorRelationships(limit = 60) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("collector_relationships")
    .select("*")
    .order("tier", { ascending: true })
    .order("priority", { ascending: false })
    .order("collector_name", { ascending: true })
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

export async function getDecisionsRequiringReview(options?: { withinDays?: number; limit?: number }) {
  const supabase = getSupabaseServerClient();
  const days = options?.withinDays ?? 14;
  const limit = options?.limit ?? 15;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("decision_log")
    .select("*")
    .not("outcome_review_date", "is", null)
    .lte("outcome_review_date", cutoffIso)
    .order("outcome_review_date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------
// Finance snapshot
// -----------------------------
export async function getLatestFinanceSnapshot() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("finance_snapshot")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function upsertFinanceSnapshot(input: {
  cashOnHand?: number | null;
  monthlyBurn?: number | null;
  projected30dRevenue?: number | null;
  survivalFloor?: number | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("finance_snapshot")
    .upsert(
      {
        label: "default",
        cash_on_hand: input.cashOnHand ?? null,
        monthly_burn: input.monthlyBurn ?? null,
        projected_30d_revenue: input.projected30dRevenue ?? null,
        survival_floor: input.survivalFloor ?? 7000
      },
      { onConflict: "label" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createCollectorRelationship(input: {
  collectorName: string;
  tier: string;
  relationshipStatus?: string;
  lastOutreachAt?: string | null;
  nextMove?: string | null;
  nextMoveDueAt?: string | null;
  estimatedValue?: number | null;
  priority?: number;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("collector_relationships")
    .insert({
      collector_name: input.collectorName,
      tier: input.tier,
      relationship_status: input.relationshipStatus ?? "quiet",
      last_outreach_at: input.lastOutreachAt ?? null,
      next_move: input.nextMove ?? null,
      next_move_due_at: input.nextMoveDueAt ?? null,
      estimated_value: input.estimatedValue ?? null,
      priority: input.priority ?? 0
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

export async function upsertSystemRunCheckpoint(input: {
  runId: string;
  agentKey: string;
  checkpointKey: string;
  status: "started" | "completed" | "failed";
  detailMd?: string | null;
  metadata?: Record<string, unknown>;
  startedAtIso?: string | null;
  finishedAtIso?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const startedAt = input.startedAtIso ?? (input.status === "started" ? nowIso() : null);
  const finishedAt =
    input.finishedAtIso ?? (input.status !== "started" ? nowIso() : null);

  const { data, error } = await supabase
    .from("system_run_checkpoints")
    .upsert(
      {
        run_id: input.runId,
        agent_key: input.agentKey,
        checkpoint_key: input.checkpointKey,
        status: input.status,
        detail_md: input.detailMd ?? null,
        metadata: input.metadata ?? {},
        started_at: startedAt,
        finished_at: finishedAt
      },
      { onConflict: "run_id,checkpoint_key" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listSystemRunCheckpoints(runId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_run_checkpoints")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
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

export async function updateScheduledJobNextRun(jobKey: string, nextRunAtIso: string | null) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("scheduled_jobs")
    .update({ next_run_at: nextRunAtIso })
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

export async function getScheduledJobs(options?: { activeOnly?: boolean }) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from("scheduled_jobs").select("*").order("job_name", { ascending: true });
  if (options?.activeOnly ?? true) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getScheduledJobsWithLatestRuns(options?: { activeOnly?: boolean }) {
  const jobs = await getScheduledJobs(options);
  if (!jobs.length) return [];
  const supabase = getSupabaseServerClient();
  const jobKeys = jobs.map((job: { job_key: string }) => job.job_key);
  const { data: runs, error } = await supabase
    .from("job_run_log")
    .select("*")
    .in("job_key", jobKeys)
    .order("started_at", { ascending: false })
    .limit(jobKeys.length * 3);
  if (error) throw error;

  type JobRunRow = {
    id: string;
    job_key: string;
    status: string;
    started_at: string;
    finished_at: string | null;
  };

  const runRows = (runs ?? []) as JobRunRow[];
  const latestRunByJob = new Map<string, JobRunRow>();
  for (const run of runRows) {
    if (!latestRunByJob.has(run.job_key)) {
      latestRunByJob.set(run.job_key, run);
    }
  }

  return jobs.map((job: Record<string, unknown>) => ({
    ...job,
    latestRun: latestRunByJob.get(job.job_key as string) ?? null
  }));
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

// -----------------------------
// Agent KPIs
// -----------------------------

export async function upsertAgentKpiDefinition(input: {
  kpiKey: string;
  agentKey: AgentKey | string;
  kpiName: string;
  description?: string | null;
  targetValue?: number | null;
  unit?: string | null;
  frequency?: string | null;
  priority?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_kpis")
    .upsert(
      {
        kpi_key: input.kpiKey,
        agent_key: input.agentKey,
        kpi_name: input.kpiName,
        description: input.description ?? null,
        target_value: input.targetValue ?? null,
        unit: input.unit ?? null,
        frequency: input.frequency ?? null,
        priority: input.priority ?? null
      },
      { onConflict: "kpi_key" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createAgentKpiReading(input: {
  kpiKey: string;
  value: number | null;
  measuredAtIso?: string;
  source?: string | null;
  notes?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_kpi_readings")
    .insert({
      kpi_key: input.kpiKey,
      value: input.value,
      measured_at: input.measuredAtIso ?? nowIso(),
      source: input.source ?? null,
      notes: input.notes ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestAgentKpiReading(kpiKey: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_kpi_readings")
    .select("*")
    .eq("kpi_key", kpiKey)
    .order("measured_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// -----------------------------
// CEO questions
// -----------------------------

export type CeoQuestionStatus = "open" | "answered" | "needs_followup" | "closed";
export type CeoQuestionEscalationLevel = "avery" | "keegan";

export async function escalateCeoQuestion(input: {
  id: string;
  escalationLevel: CeoQuestionEscalationLevel;
  escalatedBy: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_questions")
    .update({
      escalation_level: input.escalationLevel,
      escalated_by: input.escalatedBy
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// -----------------------------
// Research & outcome memory
// -----------------------------

export async function createResearchMemory(input: {
  agentKey: AgentKey | string;
  focusArea: string;
  subject: string;
  subjectType?: string;
  status?: string;
  summary: string;
  detailMd?: string;
  importanceScore?: number;
  confidence?: number;
  payload?: Record<string, unknown>;
  relatedTaskId?: string | null;
  relatedMetricKeys?: string[];
  sourceUrl?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_memory")
    .insert({
      agent_key: input.agentKey,
      focus_area: input.focusArea,
      subject: input.subject,
      subject_type: input.subjectType ?? null,
      status: input.status ?? "open",
      summary: input.summary,
      detail_md: input.detailMd ?? null,
      importance_score: input.importanceScore ?? 0,
      confidence: input.confidence ?? 0,
      payload: input.payload ?? {},
      related_task_id: input.relatedTaskId ?? null,
      related_metric_keys: input.relatedMetricKeys ?? [],
      source_url: input.sourceUrl ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentResearchMemory(options?: {
  agentKey?: AgentKey | string;
  focusArea?: string;
  status?: string;
  metricKey?: string;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("research_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 25);

  if (options?.agentKey) query = query.eq("agent_key", options.agentKey);
  if (options?.focusArea) query = query.eq("focus_area", options.focusArea);
  if (options?.status) query = query.eq("status", options.status);
  if (options?.metricKey) query = query.contains("related_metric_keys", [options.metricKey]);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createOutcomeMemory(input: {
  agentKey: AgentKey | string;
  outcomeType: "task" | "decision" | "experiment" | "launch" | "partnership" | "content" | "note";
  title: string;
  summary: string;
  detailMd?: string;
  impactScore?: number;
  impactWindow?: string;
  relatedTaskId?: string;
  relatedMetricKeys?: string[];
  happenedAtIso?: string;
  expiresAtIso?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("outcome_memory")
    .insert({
      agent_key: input.agentKey,
      outcome_type: input.outcomeType,
      title: input.title,
      summary: input.summary,
      detail_md: input.detailMd ?? null,
      impact_score: input.impactScore ?? null,
      impact_window: input.impactWindow ?? null,
      related_task_id: input.relatedTaskId ?? null,
      related_metric_keys: input.relatedMetricKeys ?? [],
      happened_at: input.happenedAtIso ?? nowIso(),
      expires_at: input.expiresAtIso ?? null,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentOutcomeMemory(options?: {
  agentKey?: AgentKey | string;
  outcomeType?: string;
  metricKey?: string;
  includeExpired?: boolean;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("outcome_memory")
    .select("*")
    .order("happened_at", { ascending: false })
    .limit(options?.limit ?? 25);

  if (options?.agentKey) query = query.eq("agent_key", options.agentKey);
  if (options?.outcomeType) query = query.eq("outcome_type", options.outcomeType);
  if (options?.metricKey) query = query.contains("related_metric_keys", [options.metricKey]);
  if (!options?.includeExpired) query = query.or("expires_at.is.null,expires_at.gt." + nowIso());

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getRecentOpportunitiesForPulse(limit = 200) {
  return getRecentOpportunities(limit);
}

// -----------------------------
// Agent KPI tracking
// -----------------------------

export async function listAgentKpis(options?: { agentKey?: string; limit?: number }) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("agent_kpis")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 250);

  if (options?.agentKey) query = query.eq("agent_key", options.agentKey);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error, "agent_kpis")) return [];
    throw error;
  }
  return data ?? [];
}

export async function listLatestAgentKpiReadingsByKpiKeys(kpiKeys: string[]) {
  if (!kpiKeys.length) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_kpi_readings")
    .select("id,kpi_key,value,measured_at,source,notes")
    .in("kpi_key", kpiKeys)
    .order("measured_at", { ascending: false })
    .limit(Math.min(1000, kpiKeys.length * 10));
  if (error) {
    if (isMissingTableError(error, "agent_kpi_readings")) return [];
    throw error;
  }

  // Deduplicate to latest per kpi_key
  const seen = new Set<string>();
  const latest: typeof data = [];
  for (const row of data ?? []) {
    if (seen.has(row.kpi_key)) continue;
    seen.add(row.kpi_key);
    latest.push(row);
  }
  return latest ?? [];
}

export async function listLatestAgentKpiReadingsByKpiKeysForRange(
  kpiKeys: string[],
  range: { startIso: string; endIsoExclusive: string }
) {
  if (!kpiKeys.length) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_kpi_readings")
    .select("id,kpi_key,value,measured_at,source,notes")
    .in("kpi_key", kpiKeys)
    .gte("measured_at", range.startIso)
    .lt("measured_at", range.endIsoExclusive)
    .order("measured_at", { ascending: false })
    .limit(Math.min(2000, kpiKeys.length * 25));
  if (error) {
    if (isMissingTableError(error, "agent_kpi_readings")) return [];
    throw error;
  }

  // Deduplicate to latest per kpi_key within the provided range
  const seen = new Set<string>();
  const latest: typeof data = [];
  for (const row of data ?? []) {
    if (seen.has(row.kpi_key)) continue;
    seen.add(row.kpi_key);
    latest.push(row);
  }

  return latest ?? [];
}

// -----------------------------
// Agent idea engine
// -----------------------------

export async function getIdeas(options?: { agentKey?: string; status?: string; limit?: number }) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("agent_ideas")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 200);

  if (options?.agentKey) query = query.eq("agent_key", options.agentKey);
  if (options?.status) query = query.eq("status", options.status);

  const { data, error, count } = await query;
  if (error) {
    if (isMissingTableError(error, "agent_ideas")) return { items: [], count: 0 };
    throw error;
  }
  return { items: data ?? [], count: count ?? (data?.length ?? 0) };
}

export async function createIdea(input: {
  agentKey: string;
  ideaType: "minor" | "major" | string;
  title: string;
  summary?: string | null;
  expectedImpact?: number | null;
  requiresCeoApproval?: boolean;
  linkedTaskId?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_ideas")
    .insert({
      agent_key: input.agentKey,
      idea_type: input.ideaType,
      title: input.title,
      summary: input.summary ?? null,
      expected_impact: input.expectedImpact ?? null,
      status: "proposed",
      requires_ceo_approval: input.requiresCeoApproval ?? false,
      linked_task_id: input.linkedTaskId ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateIdeaStatus(input: {
  id: string;
  status:
    | "proposed"
    | "in_review"
    | "approved"
    | "rejected"
    | "in_progress"
    | "shipped"
    | "archived"
    | string;
  approver?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "approved") {
    patch.approver = input.approver ?? "system";
    patch.approved_at = nowIso();
  }
  if (input.status === "rejected") {
    patch.approver = input.approver ?? "system";
  }

  const { data, error } = await supabase
    .from("agent_ideas")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function linkIdeaToTask(input: { ideaId: string; taskId: string | null }) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_ideas")
    .update({ linked_task_id: input.taskId })
    .eq("id", input.ideaId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createIdeaComment(input: { ideaId: string; commenter: string; comment: string }) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_idea_comments")
    .insert({
      idea_id: input.ideaId,
      commenter: input.commenter,
      comment: input.comment
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getIdeaComments(ideaId: string, limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_idea_comments")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, "agent_idea_comments")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getRecentIdeaComments(limit = 25) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_idea_comments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, "agent_idea_comments")) return [];
    throw error;
  }
  return data ?? [];
}

// -----------------------------
// CEO question desk
// -----------------------------

export async function getCeoQuestions(options?: {
  status?: string;
  escalationLevel?: string;
  askedBy?: string;
  ownerAgent?: string;
  limit?: number;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("ceo_questions")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 200);

  if (options?.status) query = query.eq("status", options.status);
  if (options?.escalationLevel) query = query.eq("escalation_level", options.escalationLevel);
  if (options?.askedBy) query = query.eq("asked_by", options.askedBy);
  if (options?.ownerAgent) query = query.eq("owner_agent", options.ownerAgent);

  const { data, error, count } = await query;
  if (error) {
    if (isMissingTableError(error, "ceo_questions")) return { items: [], count: 0 };
    throw error;
  }
  return { items: data ?? [], count: count ?? (data?.length ?? 0) };
}

export async function createCeoQuestion(input: {
  askedBy: string;
  escalationLevel?: "avery" | "keegan" | string;
  question: string;
  context?: string | null;
  status?: "open" | "answered" | "needs_followup" | "closed" | string;
  priority?: string | null;
  ownerAgent?: string | null;
  dueAt?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_questions")
    .insert({
      asked_by: input.askedBy,
      escalation_level: input.escalationLevel ?? "avery",
      question: input.question,
      context: input.context ?? null,
      status: input.status ?? "open",
      priority: input.priority ?? null,
      owner_agent: input.ownerAgent ?? null,
      due_at: input.dueAt ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCeoQuestion(input: {
  id: string;
  status?: "open" | "answered" | "needs_followup" | "closed" | string;
  escalationLevel?: "avery" | "keegan" | string;
  priority?: string | null;
  ownerAgent?: string | null;
  dueAt?: string | null;
  answeredBy?: string | null;
  markAnswered?: boolean;
  escalatedBy?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.status) patch.status = input.status;
  if (input.escalationLevel) patch.escalation_level = input.escalationLevel;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.ownerAgent !== undefined) patch.owner_agent = input.ownerAgent;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;

  if (input.markAnswered) {
    patch.status = input.status ?? "answered";
    patch.answered_by = input.answeredBy ?? "system";
    patch.answered_at = nowIso();
  }
  if (input.escalationLevel === "keegan") {
    patch.escalated_by = input.escalatedBy ?? "system";
  }

  const { data, error } = await supabase
    .from("ceo_questions")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createCeoQuestionComment(input: { questionId: string; commenter: string; body: string }) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_question_comments")
    .insert({
      question_id: input.questionId,
      commenter: input.commenter,
      body: input.body
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getCeoQuestionComments(questionId: string, limit = 50) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_question_comments")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, "ceo_question_comments")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getRecentCeoQuestionComments(limit = 25) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_question_comments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, "ceo_question_comments")) return [];
    throw error;
  }
  return data ?? [];
}

export type DashboardSnapshotRecord = {
  key: string;
  payload: unknown;
  mode: string | null;
  generated_at: string | null;
  updated_at: string | null;
};

export async function getDashboardSnapshots(keys: string[]): Promise<DashboardSnapshotRecord[]> {
  if (!keys.length) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("key, payload, mode, generated_at, updated_at")
    .in("key", keys);
  if (error) {
    if (isMissingTableError(error, "dashboard_snapshots")) return [];
    throw error;
  }
  return (data ?? []) as DashboardSnapshotRecord[];
}

export async function getDashboardSnapshotHistoryForKey(key: string, options?: { limit?: number }): Promise<DashboardSnapshotRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 6, 12));
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("key, payload, mode, generated_at, updated_at")
    .eq("key", key)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, "dashboard_snapshots")) return [];
    throw error;
  }
  return (data ?? []) as DashboardSnapshotRecord[];
}
