export type ExecutiveHomeLegacySearchParamsV1 = Record<
  string,
  string | string[] | undefined
>;

const PRESERVED_DATE_RANGE_KEYS = ["range", "start", "end"] as const;

/**
 * Keeps the retired `/executive-home` route as a safe compatibility alias for
 * the one canonical Executive Home at `/dashboard`.
 *
 * Only the date-range controls understood by the canonical dashboard are
 * forwarded. Unknown parameters and array values are intentionally dropped so
 * this helper cannot become an open-redirect or arbitrary-query passthrough.
 */
export function buildCanonicalExecutiveHomeHrefV1(
  searchParams: ExecutiveHomeLegacySearchParamsV1 = {}
): string {
  const query = new URLSearchParams();

  for (const key of PRESERVED_DATE_RANGE_KEYS) {
    const value = searchParams[key];
    if (typeof value === "string" && value.length > 0) query.set(key, value);
  }

  const encoded = query.toString();
  return encoded ? `/dashboard?${encoded}` : "/dashboard";
}
