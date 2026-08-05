import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const FreshnessWatchdogSourceStateSchema = z
  .object({
    source_id: z.string().min(3).max(128),

    last_attempt_at: z.string().datetime().nullable(),
    last_success_at: z.string().datetime().nullable(),

    last_error_code: z.string().min(1).max(64).nullable(),

    // Governance-configured staleness budgets (string durations, e.g. "24h", "7d").
    maximum_staleness: z.string().min(1).max(32),

    now: z.string().datetime()
  })
  .strict();

export type FreshnessWatchdogSourceState = z.infer<typeof FreshnessWatchdogSourceStateSchema>;

export type FreshnessWatchdogDecision = {
  schema_version: "freshness_watchdog_decision_v1";
  source_id: string;
  state: "fresh" | "stale" | "unknown";
  reasons: string[];
  decision_hash: string;
};

function durationToSeconds(d: string): number {
  const m = /^([0-9]+)(s|m|h|d)$/.exec(d);
  if (!m) throw new Error(`invalid_duration:${d}`);
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "s") return n;
  if (unit === "m") return n * 60;
  if (unit === "h") return n * 3600;
  return n * 86400;
}

export function evaluateFreshnessWatchdog(input: FreshnessWatchdogSourceState): FreshnessWatchdogDecision {
  const parsed = FreshnessWatchdogSourceStateSchema.parse(input);

  const reasons: string[] = [];

  if (!parsed.last_success_at) {
    reasons.push("no_success_recorded");
    const decision_hash = sha256CanonicalJson({ v: "freshness/v1", ...parsed, reasons });
    return deepFreeze({
      schema_version: "freshness_watchdog_decision_v1",
      source_id: parsed.source_id,
      state: "unknown",
      reasons,
      decision_hash
    });
  }

  const maxSeconds = durationToSeconds(parsed.maximum_staleness);
  const ageSeconds = (Date.parse(parsed.now) - Date.parse(parsed.last_success_at)) / 1000;

  if (ageSeconds > maxSeconds) {
    reasons.push("staleness_exceeded");
  }
  if (parsed.last_error_code) reasons.push(`last_error:${parsed.last_error_code}`);

  const state = reasons.includes("staleness_exceeded") ? "stale" : "fresh";
  const decision_hash = sha256CanonicalJson({ v: "freshness/v1", ...parsed, reasons: reasons.slice().sort() });

  return deepFreeze({
    schema_version: "freshness_watchdog_decision_v1",
    source_id: parsed.source_id,
    state,
    reasons: reasons.slice().sort((a, b) => a.localeCompare(b)),
    decision_hash
  });
}
