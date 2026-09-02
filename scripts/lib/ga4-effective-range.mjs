export function chooseEffectiveGa4EndDate(summary, requestedEndDate, startDate) {
  const freshness = summary?.freshness;
  const completeness = summary?.completeness;
  const sourceAsOf = summary?.sourceAsOf;

  if (summary?.dataUsableForCurrentDecisions) {
    return Object.freeze({
      endDate: requestedEndDate,
      lagged: false,
      warning: null
    });
  }

  const sourceDateValid = typeof sourceAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sourceAsOf);
  const normalLag =
    completeness === 'partial' &&
    (freshness === 'fresh' || freshness === 'degraded') &&
    sourceDateValid &&
    sourceAsOf >= startDate &&
    sourceAsOf < requestedEndDate;

  if (!normalLag) return null;

  return Object.freeze({
    endDate: sourceAsOf,
    lagged: true,
    warning: `GA4 reporting lag: requested through ${requestedEndDate}, latest complete source date is ${sourceAsOf}.`
  });
}
