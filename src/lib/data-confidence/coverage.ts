import type { ConfidenceSummary, ConfidenceEntry } from "@/lib/data-confidence";

export type CoverageIssue = { id: string; label: string; detail: string };

export function buildCoverageIssues(summary: ConfidenceSummary): CoverageIssue[] {
  const issues = new Map<string, CoverageIssue>();

  const addIssue = (id: string, label: string, detail: string) => {
    if (!issues.has(id)) {
      issues.set(id, { id, label, detail });
    }
  };

  summary.entries.forEach((entry) => {
    const baseDetail = entry.recommendedAction ?? entry.executiveImpact ?? "Review source.";
    appendStateIssues(entry, baseDetail, addIssue);
    if (!entry.lastSuccess && entry.state !== "trusted") {
      addIssue(`${entry.id}-refresh`, `Failed refresh: ${entry.label}`, baseDetail);
    }
    entry.warningCodes.forEach((warning, index) => {
      const normalized = warning.toLowerCase();
      if (normalized.includes("range mismatch")) {
        addIssue(`${entry.id}-range-${index}`, `Range mismatch: ${entry.label}`, "Selected window does not match source coverage.");
      }
    });
  });

  if (summary.partialDay) {
    addIssue("partial-day", "Partial day coverage", "Selected range includes an incomplete calendar day.");
  }

  return Array.from(issues.values());
}

function appendStateIssues(
  entry: ConfidenceEntry,
  baseDetail: string,
  addIssue: (id: string, label: string, detail: string) => void
) {
  switch (entry.state) {
    case "unavailable":
      addIssue(`${entry.id}-unavailable`, `Unavailable source: ${entry.label}`, baseDetail);
      break;
    case "insufficient_evidence":
      addIssue(`${entry.id}-no-data`, `No data: ${entry.label}`, baseDetail);
      break;
    case "stale":
      addIssue(`${entry.id}-stale`, `Stale data: ${entry.label}`, baseDetail);
      break;
    case "conflicting":
      addIssue(`${entry.id}-conflict`, `Conflicting data: ${entry.label}`, baseDetail);
      break;
    default:
      break;
  }
}
