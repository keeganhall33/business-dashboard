export function formatRelativeTimeFromNow(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / 36e5;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) {
    return formatter.format(Math.round(diffHours), "hour");
  }
  return formatter.format(Math.round(diffHours / 24), "day");
}
