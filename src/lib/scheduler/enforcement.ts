import { getSupabaseServerClient } from "@/lib/supabase/server";

export type EnforcementMode = "disabled" | "observe_only" | "alert_only" | "active";

type EnforcementState = {
  modes: Record<string, EnforcementMode>;
  updatedAt: string;
};

const DEFAULT_MODES: Record<string, EnforcementMode> = {
  "daily-health-check": "observe_only",
  "evening-closeout": "observe_only",
  "proof-enforcement": "disabled",
  "war-room-digest": "disabled"
};

let cachedState: EnforcementState | null = null;

async function loadState(force = false): Promise<EnforcementState> {
  if (!force && cachedState) return cachedState;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_state")
    .select("value_json")
    .eq("key", "scheduler_enforcement_modes")
    .maybeSingle();

  if (error) throw error;

  if (!data || !data.value_json) {
    const state: EnforcementState = {
      modes: { ...DEFAULT_MODES },
      updatedAt: new Date().toISOString()
    };
    await supabase
      .from("system_state")
      .upsert({ key: "scheduler_enforcement_modes", value_json: state }, { onConflict: "key" });
    cachedState = state;
    return state;
  }

  const parsed = data.value_json as EnforcementState;
  cachedState = {
    modes: parsed?.modes ?? { ...DEFAULT_MODES },
    updatedAt: parsed?.updatedAt ?? new Date().toISOString()
  };
  return cachedState;
}

export async function getEnforcementMode(jobKey: string): Promise<EnforcementMode> {
  const state = await loadState(true);
  return state.modes[jobKey] ?? DEFAULT_MODES[jobKey] ?? "disabled";
}

export function describeMode(mode: EnforcementMode) {
  switch (mode) {
    case "disabled":
      return "Job disabled";
    case "observe_only":
      return "Observe only (no alerts/tasks/posts)";
    case "alert_only":
      return "Alerts only (no tasks/posts)";
    case "active":
      return "Full enforcement active";
    default:
      return mode;
  }
}

export function modeAllowsAlerts(mode: EnforcementMode) {
  return mode === "alert_only" || mode === "active";
}

export function modeAllowsTasks(mode: EnforcementMode) {
  return mode === "active";
}

export function modeAllowsMessages(mode: EnforcementMode) {
  return mode === "active";
}

export function modeIsObserveOnly(mode: EnforcementMode) {
  return mode === "observe_only";
}

export function modeIsDisabled(mode: EnforcementMode) {
  return mode === "disabled";
}
