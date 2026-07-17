export function computeRevenuePerVisitor(
  revenue: number | null | undefined,
  visitorCounts: Array<number | null | undefined>
): number | null {
  if (typeof revenue !== "number" || Number.isNaN(revenue)) {
    return null;
  }

  const visitor = visitorCounts.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!visitor) {
    return null;
  }
  return revenue / visitor;
}
