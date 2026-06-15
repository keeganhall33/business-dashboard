import {
  createAgentMessage,
  getLatestScoreboardMetrics,
  getOrCreateAgentThread,
  getSystemState,
  upsertSystemState,
  closeAgentThreadsByType
} from "@/lib/supabase/queries";
import type { ScoreboardMetric } from "@/lib/agents/shared";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import { agentKeys } from "@/lib/types/requests";

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
  const dealsClosed = getMetric(metrics, "deals_closed_quarterly");

  const triggers: string[] = [];
  const day = dayOfMonth();

  const monthlyRevenueCurrent = asNumber(monthlyRevenue?.current_value);
  const monthlyRevenueTarget = asNumber(monthlyRevenue?.target_value);
  const aovCurrent = asNumber(aov?.current_value);
  const conversionCurrent = asNumber(conversion?.current_value);
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
    if (changed) {
      await Promise.all(agentKeys.map((agentKey) => announceWarRoom(agentKey, reason, triggers)));
    }
  } else {
    await resolveAlertByKey(dedupeKey);
    if (changed && currentMode === "war_room") {
      await Promise.all(agentKeys.map((agentKey) => closeWarRoom(agentKey)));
    }
  }

  return {
    mode: nextMode,
    wasChanged: changed,
    reason,
    triggers
  } as const;
}

async function announceWarRoom(agentKey: string, reason: string | null, triggers: string[]) {
  const thread = await getOrCreateAgentThread({
    agentKey,
    threadType: "war_room",
    title: "War Room Thread"
  });

  await createAgentMessage({
    threadId: thread.id,
    senderType: "system",
    messageType: "war_room",
    body: reason ?? "War room mode activated",
    metadata: { triggers }
  });
}

async function closeWarRoom(agentKey: string) {
  await closeAgentThreadsByType(agentKey, "war_room");
  const thread = await getOrCreateAgentThread({ agentKey, threadType: "default" });
  await createAgentMessage({
    threadId: thread.id,
    senderType: "system",
    messageType: "status",
    body: "War room mode cleared. Resume normal cadence.",
    metadata: {}
  });
}
