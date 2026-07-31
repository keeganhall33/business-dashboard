export const ACTIVE_DEDUPE_STATUSES = [
  "detected",
  "analyzed",
  "recommended",
  "draft_prepared",
  "awaiting_approval",
  "approved",
  "snoozed",
  "needs_revalidation",
  "execution_blocked",
  "executing",
  "measuring"
] as const;

export function isPermanentlySuppressed(preference: { suppressed: boolean } | null): boolean {
  return Boolean(preference?.suppressed);
}

export function shouldBlockReconsiderationAfterRejection(input: {
  previousRejectedEvidenceHash: string | null;
  newEvidenceHash: string;
}): boolean {
  if (!input.previousRejectedEvidenceHash) return false;
  return input.previousRejectedEvidenceHash === input.newEvidenceHash;
}
