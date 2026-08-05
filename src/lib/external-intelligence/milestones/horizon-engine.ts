import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";
import type { SportsMilestoneCalendar, SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { parseSportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import type { AlertLeadTimePolicy, ProjectClass } from "@/lib/external-intelligence/milestones/alert-policy";
import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";

export type MilestonePlanningStage = "monitor" | "validate" | "early_strategic_opportunity" | "outreach_window" | "action_window" | "expired";

export type MilestoneHorizonAlert = {
  schema_version: "milestone_horizon_alert_v2";
  milestone_id: string;
  milestone_content_hash: string;

  project_class: ProjectClass;

  horizon_days: number;
  days_remaining: number;

  alert_date: string;
  milestone_date: string;

  planning_stage: MilestonePlanningStage;

  suppression_identity: string;
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

function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map((x) => Number(x));
  const [ty, tm, td] = toYmd.split("-").map((x) => Number(x));
  const a = Date.UTC(fy!, fm! - 1, fd!);
  const b = Date.UTC(ty!, tm! - 1, td!);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function classifyPlanningStage(horizonDays: number): MilestonePlanningStage {
  if (horizonDays >= 548) return "early_strategic_opportunity";
  if (horizonDays >= 365) return "outreach_window";
  if (horizonDays >= 90) return "action_window";
  if (horizonDays >= 0) return "action_window";
  return "expired";
}

function suppressionIdentity(input: {
  milestone_id: string;
  milestone_content_hash: string;
  horizon_days: number;
  lead_time_policy_version: string;
  suppression_policy_version: string;
}): string {
  return sha256CanonicalJson({ v: "milestone-alert-suppression/v1", ...input });
}

export function chooseProjectClass(m: SportsMilestone): ProjectClass {
  // Deterministic mapping; no fabricated probabilities.
  if (m.partnership_potential === "high") return "major_institutional_partnership";
  if (m.fan_collector_relevance === "high") return "original_artwork_no_formal_partnership";
  return "print_content_or_promo_opportunity";
}

/**
 * Deterministic horizon scanning across multiple horizons.
 *
 * Alerts are generated only for applicable horizons per ProjectClass.
 * Suppression identity is stable for (milestone, horizon, policy versions, and milestone content).
 */
export function buildMilestoneHorizonAlertsV2(input: {
  calendar: SportsMilestoneCalendar;
  lead_time_policy: AlertLeadTimePolicy;
  now_ymd: string;
}): MilestoneHorizonAlert[] {
  const calendar = parseSportsMilestoneCalendar(input.calendar);
  const policy = parseAlertLeadTimePolicy(input.lead_time_policy);

  const alerts: MilestoneHorizonAlert[] = [];

  for (const m of calendar.milestones) {
    const project_class = chooseProjectClass(m);
    const horizons = policy.horizons_by_project_class[project_class];

    for (const horizon_days of horizons) {
      const alert_date = addDays(m.milestone_date, -horizon_days);
      const days_remaining = daysBetween(input.now_ymd, m.milestone_date);

      // Only surface alerts that are now or in the future; expired alerts can be computed downstream.
      if (alert_date < input.now_ymd) continue;

      const planning_stage = classifyPlanningStage(horizon_days);

      const suppression_identity = suppressionIdentity({
        milestone_id: m.milestone_id,
        milestone_content_hash: m.content_hash,
        horizon_days,
        lead_time_policy_version: policy.policy_version,
        suppression_policy_version: policy.suppression_policy.policy_version
      });

      const base = {
        schema_version: "milestone_horizon_alert_v2" as const,
        milestone_id: m.milestone_id,
        milestone_content_hash: m.content_hash,
        project_class,
        horizon_days,
        days_remaining,
        alert_date,
        milestone_date: m.milestone_date,
        planning_stage,
        suppression_identity
      };

      const alert_hash = sha256CanonicalJson({ v: "milestone-alert/v2", ...base });
      alerts.push(deepFreeze({ ...base, alert_hash }));
    }
  }

  // Deterministic ordering and suppression: one alert per (milestone,horizon,policy versions, milestone content).
  const byId = new Map<string, MilestoneHorizonAlert>();
  for (const a of alerts) {
    if (!byId.has(a.suppression_identity)) byId.set(a.suppression_identity, a);
  }

  return deepFreeze(
    [...byId.values()].sort((a, b) =>
      a.alert_date.localeCompare(b.alert_date) || a.milestone_id.localeCompare(b.milestone_id) || a.horizon_days - b.horizon_days
    )
  );
}
