export type ExecutiveTruthState = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";

export type ExecutiveApprovalLevel =
  | "L0_INSIGHT"
  | "L1_RECOMMENDATION"
  | "L2_DRAFT_PREPARED"
  | "L3_READY_FOR_APPROVAL"
  | "L4_APPROVED_FOR_EXECUTION"
  | "L5_EXECUTED_AND_MEASURED";

export type ExecutiveConfidence =
  | "strongly_supported"
  | "likely"
  | "possible"
  | "insufficient_evidence"
  | null
  | undefined;

export function executiveTruthLabel(state: ExecutiveTruthState | string | null | undefined): string {
  if (state === "KNOWN") return "Evidence verified";
  if (state === "CONFLICTED") return "Evidence conflicts";
  if (state === "STALE") return "Needs fresh data";
  if (state === "INFERRED") return "Reasoned estimate";
  if (state === "UNKNOWN") return "Not yet verified";
  return "Not assessed";
}

export function executiveConfidenceLabel(confidence: ExecutiveConfidence | string): string {
  if (confidence === "strongly_supported") return "Strong evidence";
  if (confidence === "likely") return "Good evidence";
  if (confidence === "possible") return "Early signal";
  if (confidence === "insufficient_evidence") return "Not enough evidence";
  return "Not assessed";
}

export function executiveApprovalLabel(level: ExecutiveApprovalLevel | string | null | undefined): string {
  if (level === "L5_EXECUTED_AND_MEASURED") return "Completed and measured";
  if (level === "L4_APPROVED_FOR_EXECUTION") return "Approved to execute";
  if (level === "L3_READY_FOR_APPROVAL") return "Ready for your approval";
  if (level === "L2_DRAFT_PREPARED") return "Draft prepared";
  if (level === "L1_RECOMMENDATION") return "Idea for review";
  if (level === "L0_INSIGHT") return "Insight only";
  return "Not assessed";
}

export function executiveSourceModeLabel(mode: string | null | undefined): string {
  if (mode === "LIVE_DATA") return "Live data";
  if (mode === "PARTIAL_LIVE_DATA") return "Some sources still connecting";
  if (mode === "SEED_DATA") return "Setup data only";
  return "Data still connecting";
}

export function executiveUrgencyLabel(urgency: string | null | undefined): string {
  if (urgency === "high") return "Act soon";
  if (urgency === "medium") return "Important, not immediate";
  if (urgency === "low") return "Can wait";
  return "Not assessed";
}

export function executiveBlockerCopy(blocker: string | null | undefined): string | null {
  if (!blocker) return null;
  if (/Evidence truth remains UNKNOWN/i.test(blocker)) return "We do not yet have enough verified data to act confidently.";
  if (/freshness remains UNKNOWN/i.test(blocker)) return "We cannot confirm that the supporting data is current yet.";
  if (/freshness requires review/i.test(blocker)) return "The supporting data needs to be refreshed before acting.";
  if (/conflicted evidence/i.test(blocker)) return "The available data points disagree, so this needs review before acting.";
  return blocker;
}

export function executiveMissingDataLabels(items: readonly string[]): string[] {
  return items.map((item) => {
    const value = item.toLowerCase();
    if (value === "email" || value.includes("email")) return "email campaign performance";
    if (value === "matchback" || value.includes("matchback")) return "ad-to-order attribution";
    return item.replaceAll("_", " ");
  });
}
