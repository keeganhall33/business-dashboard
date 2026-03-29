import { HeaderMetric, RevenueMetric } from "@/lib/types/dashboard";
import { formatMetricValue } from "@/lib/utils/format";
import { statusClasses } from "@/lib/utils/status";

type Props = {
  metric: HeaderMetric | RevenueMetric;
  compact?: boolean;
};

export function MetricCard({ metric, compact }: Props) {
  return (
    <div className={`rounded-2xl border p-4 ${statusClasses(metric.status)}`}>

      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {"metricName" in metric ? metric.metricName : metric.metricKey.replaceAll("_", " ")}
      </div>
      <div className={compact ? "mt-2 text-2xl font-semibold" : "mt-2 text-3xl font-semibold"}>
        {formatMetricValue(metric.currentValue ?? 0, metric.unit)}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        Target {formatMetricValue(metric.targetValue ?? 0, metric.unit)}
      </div>
    </div>
  );
}

