export type TimeseriesPoint = { date: string; value: number };

export type Outlier = {
  date: string;
  value: number;
  z: number;
  reason: string;
};

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function stdev(values: number[], mu: number) {
  const v = values.reduce((sum, x) => sum + (x - mu) * (x - mu), 0) / Math.max(1, values.length);
  return Math.sqrt(v);
}

export function detectOutliers(series: TimeseriesPoint[], { zThreshold = 3 }: { zThreshold?: number } = {}): Outlier[] {
  const points = series.filter((p) => Number.isFinite(p.value));
  if (points.length < 7) return [];
  const values = points.map((p) => p.value);
  const mu = mean(values);
  const sd = stdev(values, mu);
  if (!Number.isFinite(sd) || sd === 0) return [];

  return points
    .map((p) => ({ ...p, z: (p.value - mu) / sd }))
    .filter((p) => Math.abs(p.z) >= zThreshold)
    .map((p) => ({ date: p.date, value: p.value, z: p.z, reason: `Value deviates by ${p.z.toFixed(1)}σ from mean` }));
}
