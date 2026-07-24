import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AlertLifecycleStatus = "unresolved" | "acknowledged" | "resolved" | "suppressed";

type LifecycleEntry = {
  status: AlertLifecycleStatus;
  alertId?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  suppressedAt?: string | null;
  suppressedBy?: string | null;
  suppressReason?: string | null;
  updatedAt: string;
};

type LifecycleState = {
  entries: Record<string, LifecycleEntry>;
  updatedAt: string;
};

const STATE_KEY = "scheduler_alert_lifecycle";

async function loadState(): Promise<LifecycleState> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_state")
    .select("value_json")
    .eq("key", STATE_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value_json) {
    return { entries: {}, updatedAt: new Date().toISOString() };
  }
  const state = data.value_json as LifecycleState;
  return {
    entries: state.entries ?? {},
    updatedAt: state.updatedAt ?? new Date().toISOString()
  };
}

async function persistState(state: LifecycleState) {
  const supabase = getSupabaseServerClient();
  state.updatedAt = new Date().toISOString();
  await supabase
    .from("system_state")
    .upsert({ key: STATE_KEY, value_json: state }, { onConflict: "key" });
}

export async function getAlertLifecycleEntry(dedupeKey: string) {
  const state = await loadState();
  return state.entries[dedupeKey] ?? null;
}

export async function setAlertLifecycleEntry(
  dedupeKey: string,
  updater: (entry: LifecycleEntry | null) => LifecycleEntry
) {
  const state = await loadState();
  const current = state.entries[dedupeKey] ?? null;
  state.entries[dedupeKey] = updater(current);
  await persistState(state);
  return state.entries[dedupeKey];
}

export async function markAlertStatus(options: {
  dedupeKey: string;
  alertId?: string | null;
  status: AlertLifecycleStatus;
  source: string;
  reason?: string;
}) {
  return setAlertLifecycleEntry(options.dedupeKey, (existing) => {
    const entry: LifecycleEntry = {
      status: options.status,
      alertId: options.alertId ?? existing?.alertId ?? null,
      acknowledgedAt: existing?.acknowledgedAt ?? null,
      acknowledgedBy: existing?.acknowledgedBy ?? null,
      resolvedAt: existing?.resolvedAt ?? null,
      resolvedBy: existing?.resolvedBy ?? null,
      suppressedAt: existing?.suppressedAt ?? null,
      suppressedBy: existing?.suppressedBy ?? null,
      suppressReason: existing?.suppressReason ?? null,
      updatedAt: new Date().toISOString()
    };

    if (options.status === "acknowledged") {
      entry.acknowledgedAt = new Date().toISOString();
      entry.acknowledgedBy = options.source;
    }
    if (options.status === "resolved") {
      entry.resolvedAt = new Date().toISOString();
      entry.resolvedBy = options.source;
    }
    if (options.status === "suppressed") {
      entry.suppressedAt = new Date().toISOString();
      entry.suppressedBy = options.source;
      entry.suppressReason = options.reason ?? null;
    }
    if (options.status === "unresolved") {
      entry.suppressedAt = null;
      entry.suppressedBy = null;
      entry.suppressReason = null;
      entry.resolvedAt = null;
      entry.resolvedBy = null;
    }
    return entry;
  });
}
