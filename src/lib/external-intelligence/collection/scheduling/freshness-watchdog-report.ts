import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const WatchdogOutputStateSchema = z.enum([
  "healthy",
  "due",
  "overdue",
  "stale",
  "blocked",
  "credential_missing",
  "terms_expired",
  "access_revoked",
  "repeated_failure",
  "disabled"
]);

export type WatchdogOutputState = z.infer<typeof WatchdogOutputStateSchema>;

export const WatchdogSourceSnapshotSchema = z
  .object({
    source_id: z.string().min(3).max(128),

    source_enabled: z.boolean(),
    currently_eligible_now: z.boolean(),
    adapter_operational: z.boolean(),

    last_collection_attempt_at: z.string().datetime().nullable(),
    last_successful_collection_at: z.string().datetime().nullable(),
    last_observed_artifact_at: z.string().datetime().nullable(),

    freshness_sla: z.string().min(1).max(32),
    maximum_staleness: z.string().min(1).max(32),

    consecutive_failures: z.number().int().min(0).max(999),

    credential_status: z.enum(["not_required", "present", "missing", "unknown"]),
    terms_legal_review_expired: z.boolean(),
    access_revoked: z.boolean(),
    rate_limit_status: z.enum(["ok", "rate_limited", "unknown"]),

    next_scheduled_collection_at: z.string().datetime().nullable(),

    now: z.string().datetime()
  })
  .strict();

export type WatchdogSourceSnapshot = z.infer<typeof WatchdogSourceSnapshotSchema>;

export type WatchdogDecision = {
  schema_version: "freshness_watchdog_report_v1";
  source_id: string;
  output_state: WatchdogOutputState;
  overdue: boolean;
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

function secondsSince(nowIso: string, thenIso: string | null): number | null {
  if (!thenIso) return null;
  return (Date.parse(nowIso) - Date.parse(thenIso)) / 1000;
}

export function evaluateFreshnessWatchdogSnapshot(input: WatchdogSourceSnapshot): WatchdogDecision {
  const s = WatchdogSourceSnapshotSchema.parse(input);

  const reasons: string[] = [];

  if (!s.source_enabled) reasons.push("source_disabled");
  if (!s.currently_eligible_now) reasons.push("not_eligible_now");
  if (!s.adapter_operational) reasons.push("adapter_not_operational");

  if (s.credential_status === "missing") reasons.push("credential_missing");
  if (s.terms_legal_review_expired) reasons.push("terms_expired");
  if (s.access_revoked) reasons.push("access_revoked");

  if (s.rate_limit_status === "rate_limited") reasons.push("rate_limited");
  if (s.consecutive_failures >= 3) reasons.push("repeated_failure");

  const now = s.now;
  const maxSeconds = durationToSeconds(s.maximum_staleness);
  const age = secondsSince(now, s.last_successful_collection_at);
  if (age === null) reasons.push("no_success_recorded");
  if (age !== null && age > maxSeconds) reasons.push("stale");

  const due = s.next_scheduled_collection_at !== null && Date.parse(s.next_scheduled_collection_at) <= Date.parse(now);
  const overdue = due && s.consecutive_failures >= 1;
  if (due) reasons.push("due");
  if (overdue) reasons.push("overdue");

  let output_state: WatchdogOutputState = "healthy";

  if (!s.source_enabled) output_state = "disabled";
  else if (s.credential_status === "missing") output_state = "credential_missing";
  else if (s.terms_legal_review_expired) output_state = "terms_expired";
  else if (s.access_revoked) output_state = "access_revoked";
  else if (s.consecutive_failures >= 3) output_state = "repeated_failure";
  else if (reasons.includes("stale")) output_state = "stale";
  else if (!s.currently_eligible_now || !s.adapter_operational) output_state = "blocked";
  else if (overdue) output_state = "overdue";
  else if (due) output_state = "due";

  const sortedReasons = reasons.slice().sort((a, b) => a.localeCompare(b));
  const decision_hash = sha256CanonicalJson({ v: "freshness-watchdog/v1", ...s, output_state, reasons: sortedReasons });

  return deepFreeze({
    schema_version: "freshness_watchdog_report_v1",
    source_id: s.source_id,
    output_state,
    overdue,
    reasons: sortedReasons,
    decision_hash
  });
}
