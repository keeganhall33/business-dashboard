import { getSystemState, upsertSystemState } from "@/lib/supabase/queries";

const STATE_KEY = "scheduler_alert_cooldown";
const DEFAULT_COOLDOWN_HOURS = 24;
const MAX_ENTRIES = 200;

type CooldownState = {
  entries: Record<string, string>;
  updatedAt: string;
};

async function loadCooldownState(): Promise<CooldownState> {
  const existing = await getSystemState(STATE_KEY);
  const value = (existing?.value_json as CooldownState | undefined) ?? {
    entries: {},
    updatedAt: new Date().toISOString()
  };
  return value;
}

function pruneEntries(state: CooldownState, horizon: Date) {
  const prunedEntries: Record<string, string> = {};
  for (const [key, iso] of Object.entries(state.entries)) {
    if (!iso) continue;
    const ts = new Date(iso);
    if (!Number.isNaN(ts.getTime()) && ts >= horizon) {
      prunedEntries[key] = iso;
    }
  }
  state.entries = prunedEntries;
}

export async function isOnCooldown(
  dedupeKey: string,
  hours = DEFAULT_COOLDOWN_HOURS
): Promise<boolean> {
  const state = await loadCooldownState();
  const iso = state.entries[dedupeKey];
  if (!iso) return false;
  const lastTriggered = new Date(iso);
  if (Number.isNaN(lastTriggered.getTime())) return false;
  const now = Date.now();
  return now - lastTriggered.getTime() < hours * 60 * 60 * 1000;
}

export async function recordAlertTrigger(
  dedupeKey: string,
  timestamp: Date = new Date()
): Promise<void> {
  const state = await loadCooldownState();
  state.entries[dedupeKey] = timestamp.toISOString();
  const pruneHorizon = new Date(Date.now() - 48 * 60 * 60 * 1000);
  pruneEntries(state, pruneHorizon);
  // Limit the map size to avoid unbounded growth.
  const keys = Object.keys(state.entries);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (state.entries[a] ?? "").localeCompare(state.entries[b] ?? ""))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete state.entries[key]);
  }
  state.updatedAt = new Date().toISOString();
  await upsertSystemState(STATE_KEY, state);
}
