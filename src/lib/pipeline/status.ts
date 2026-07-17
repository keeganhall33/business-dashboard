const INACTIVE_STATUSES = new Set(["won", "lost", "parked", "paused", "completed", "invalid"]);

export function isActivePipelineStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !INACTIVE_STATUSES.has(status.toLowerCase());
}
