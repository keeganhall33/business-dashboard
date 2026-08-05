import { z } from "zod";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";

export const MilestoneImportanceSchema = z.enum(["low", "medium", "high"]);

export const SportsMilestoneSchema = z
  .object({
    milestone_id: z.string().min(3).max(128),
    domain: z.string().min(1).max(64),
    league: z.string().min(1).max(32),
    label: z.string().min(1).max(160),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    importance: MilestoneImportanceSchema,
    notes: z.string().min(1).max(400)
  })
  .strict();

export const SportsMilestoneCalendarSchema = z
  .object({
    schema_version: z.literal("sports_milestone_calendar_v1"),
    calendar_version: z.string().min(1).max(64),
    fixture_status: z.enum(["test_only", "production"]).default("test_only"),
    milestones: z.array(SportsMilestoneSchema).min(1)
  })
  .strict();

export type SportsMilestoneCalendar = z.infer<typeof SportsMilestoneCalendarSchema>;

export const MilestoneAlertWindowSchema = z
  .object({
    window_id: z.string().min(1).max(64),
    days_before: z.number().int().min(0).max(3650),
    label: z.string().min(1).max(120)
  })
  .strict();

export const MilestoneHorizonPolicySchema = z
  .object({
    schema_version: z.literal("milestone_horizon_policy_v1"),
    policy_version: z.string().min(1).max(64),

    // Deterministic alert windows (multiple advance-alert windows).
    alert_windows: z.array(MilestoneAlertWindowSchema).min(1),

    // Cutoff horizons.
    maximum_horizon_days: z.number().int().min(1).max(3650),

    policy_content_hash: z.string().min(64).max(64)
  })
  .strict();

export type MilestoneHorizonPolicy = z.infer<typeof MilestoneHorizonPolicySchema>;

export function computeMilestoneHorizonPolicyHash(policy: Omit<MilestoneHorizonPolicy, "policy_content_hash">): string {
  return sha256CanonicalJson({ v: "milestone-horizon-policy/v1", ...policy });
}

export function parseMilestoneHorizonPolicy(json: unknown): MilestoneHorizonPolicy {
  const parsed = MilestoneHorizonPolicySchema.parse(json);

  parsed.alert_windows = parsed.alert_windows
    .slice()
    .sort((a, b) => a.days_before - b.days_before || a.window_id.localeCompare(b.window_id));

  const { policy_content_hash, ...rest } = parsed;
  const expected = computeMilestoneHorizonPolicyHash(rest);
  if (policy_content_hash !== expected) throw new Error("milestone_horizon_policy_hash_mismatch");

  return deepFreeze(parsed);
}

export type MilestoneHorizonAlert = {
  schema_version: "milestone_horizon_alert_v1";
  milestone_id: string;
  window_id: string;
  alert_date: string;
  event_date: string;
  label: string;
  alert_hash: string;
};

function addDays(dateYmd: string, deltaDays: number): string {
  const [y, m, d] = dateYmd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yyyy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildMilestoneHorizonAlerts(input: {
  calendar: SportsMilestoneCalendar;
  policy: MilestoneHorizonPolicy;
  now_ymd: string;
}): MilestoneHorizonAlert[] {
  const calendar = SportsMilestoneCalendarSchema.parse(input.calendar);
  const policy = parseMilestoneHorizonPolicy(input.policy);

  const alerts: MilestoneHorizonAlert[] = [];

  for (const m of calendar.milestones.slice().sort((a, b) => a.event_date.localeCompare(b.event_date))) {
    // Skip events outside max horizon.
    const horizonStart = addDays(input.now_ymd, 0);
    const horizonEnd = addDays(input.now_ymd, policy.maximum_horizon_days);
    if (m.event_date < horizonStart || m.event_date > horizonEnd) continue;

    for (const w of policy.alert_windows) {
      const alert_date = addDays(m.event_date, -w.days_before);
      if (alert_date < input.now_ymd) continue;

      const base = {
        schema_version: "milestone_horizon_alert_v1" as const,
        milestone_id: m.milestone_id,
        window_id: w.window_id,
        alert_date,
        event_date: m.event_date,
        label: `${m.label} (${w.label})`
      };
      const alert_hash = sha256CanonicalJson({ v: "milestone-alert/v1", ...base });
      alerts.push(deepFreeze({ ...base, alert_hash }));
    }
  }

  return deepFreeze(alerts.sort((a, b) => a.alert_date.localeCompare(b.alert_date) || a.alert_hash.localeCompare(b.alert_hash)));
}
