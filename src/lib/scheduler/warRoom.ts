import {
  getLatestScoreboardMetrics,
  getSystemState,
  upsertSystemState
} from "@/lib/supabase/queries";
import type { ScoreboardMetric } from "@/lib/agents/shared";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";

type OperatingMode = "normal" | "war_room";

function getMetric(metrics: ScoreboardMetric[], key: string) {
  return metrics.find((metric) => metric.metric_key === key);
}

function dayOfMonth() {
  return new Date().getDate();
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

export async function evaluateWarRoomMode() {
  const metrics = (await getLatestScoreboardMetrics()) as ScoreboardMetric[];

  const monthlyRevenue = getMetric(metrics, "monthly_revenue");
  const aov = getMetric(metrics, "aov");
  const conversion = getMetric(metrics, "conversion_rate");
  const activeOpps = getMetric(metrics, "active_brand_conversations");
  const dealsClosed = getMetric(metrics, "deals_closed_quarterly");

  const triggers: string[] = [];
  const day = dayOfMonth();

  const monthlyRevenueCurrent = asNumber(monthlyRevenue?.current_value);
  const monthlyRevenueTarget = asNumber(monthlyRevenue?.target_value);
  const aovCurrent = asNumber(aov?.current_value);
  const conversionCurrent = asNumber(conversion?.current_value);
  const activeOppsCurrent = asNumber(activeOpps?.current_value);
  const dealsClosedCurrent = asNumber(dealsClosed?.current_value);

  if (
    day >= 15 &&
    Number.isFinite(monthlyRevenueCurrent) &&
    Number.isFinite(monthlyRevenueTarget) &&
    monthlyRevenueTarget > 0 &&
    monthlyRevenueCurrent < monthlyRevenueTarget * 0.4
  ) {
    triggers.push("MTD revenue pace is below 40% by mid-month");
  }

  if (Number.isFinite(aovCurrent) && aovCurrent < 80) {
    triggers.push("AOV is below $80");
  }

  if (Number.isFinite(conversionCurrent) && conversionCurrent < 1.0) {
    triggers.push("Conversion rate is below 1.0%");
  }

  if (Number.isFinite(activeOppsCurrent) && activeOppsCurrent < 3) {
    triggers.push("Active opportunities are below 3");
  }

  if (Number.isFinite(dealsClosedCurrent) && dealsClosedCurrent <= 0) {
    triggers.push("No deals closed this quarter");
  }

  const nextMode: OperatingMode = triggers.length ? "war_room" : "normal";
  const reason = triggers.length ? triggers.join("; ") : null;

  const existingState = await getSystemState("operating_mode");
  const currentMode = (existingState?.value_json?.mode as OperatingMode | undefined) ?? "normal";
  const changed = currentMode !== nextMode;

  await upsertSystemState("operating_mode", {
    mode: nextMode,
    reason,
    activatedAt: nextMode === "war_room" ? new Date().toISOString() : null
  });

  const dedupeKey = makeAlertDedupeKey(["operating_mode", "war_room"]);

  if (nextMode === "war_room") {
    await createOrUpdateAlert({
      alertType: "operating_mode",
      severity: "critical",
      title: "War room mode activated",
      summary: reason ?? "Performance triggers exceeded",
      dedupeKey
    });
  } else {
    await resolveAlertByKey(dedupeKey);
  }

  return {
    mode: nextMode,
    wasChanged: changed,
    reason,
    triggers
  } as const;
}
