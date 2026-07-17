import type { MetricStatus } from "@/lib/types/dashboard";

export type SeverityCategory = "normal_volatility" | "abnormal_movement" | "material_risk" | "urgent_intervention";

export function deriveMetricSeverity(current: number | null, target: number | null, changePercent: number | null) {
  const targetGap = target != null && current != null && target !== 0 ? (target - current) / Math.abs(target) : null;
  let targetBand: "on" | "watch" | "risk" | "urgent";
  if (targetGap == null) targetBand = "watch";
  else if (targetGap <= 0.05) targetBand = "on";
  else if (targetGap <= 0.15) targetBand = "watch";
  else if (targetGap <= 0.35) targetBand = "risk";
  else targetBand = "urgent";

  const movement = changePercent ?? 0;
  let trendBand: "normal" | "abnormal" | "risk" | "urgent";
  if (movement <= -15) trendBand = "urgent";
  else if (movement <= -8) trendBand = "risk";
  else if (movement <= -4) trendBand = "abnormal";
  else trendBand = "normal";

  let category: SeverityCategory;
  if (targetBand === "urgent" || trendBand === "urgent") category = "urgent_intervention";
  else if (targetBand === "risk" || trendBand === "risk") category = "material_risk";
  else if (trendBand === "abnormal" || targetBand === "watch") category = "abnormal_movement";
  else category = "normal_volatility";

  const severityLabelMap: Record<SeverityCategory, string> = {
    normal_volatility: "Normal volatility",
    abnormal_movement: "Abnormal movement",
    material_risk: "Material risk",
    urgent_intervention: "Urgent intervention"
  };

  const trendLabelMap: Record<typeof trendBand, string> = {
    normal: "Trend stable",
    abnormal: "Abnormal movement",
    risk: "Material drop",
    urgent: "Severe drop"
  };

  const targetLabelMap: Record<typeof targetBand, string> = {
    on: "On target",
    watch: "Slight gap",
    risk: "Behind target",
    urgent: "Far below target"
  };

  const status: MetricStatus = category === "urgent_intervention" ? "critical" : category === "material_risk" || category === "abnormal_movement" ? "warning" : "healthy";

  return {
    status,
    severityLabel: severityLabelMap[category],
    trendLabel: trendLabelMap[trendBand],
    targetLabel: targetLabelMap[targetBand]
  };
}

export function percentChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
