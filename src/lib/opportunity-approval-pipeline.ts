import type { OpportunityStatus } from "@/lib/types/requests";

export type OpportunityPipelineStage = "proposed" | "review" | "approved" | "implemented" | "closed";

const orderedOpportunityStatuses: OpportunityStatus[] = [
  "identified",
  "researching",
  "ready_for_outreach",
  "outreach_drafted",
  "in_conversation",
  "negotiating",
  "won",
  "lost",
  "parked"
];

const statusIndex = new Map<OpportunityStatus, number>(
  orderedOpportunityStatuses.map((status, idx) => [status, idx])
);

export function getOpportunityPipelineStage(status: OpportunityStatus): OpportunityPipelineStage {
  if (status === "identified") return "proposed";
  if (status === "researching") return "review";
  if (status === "ready_for_outreach") return "approved";
  if (status === "outreach_drafted") return "implemented";
  if (status === "won" || status === "lost" || status === "parked") return "closed";
  if (status === "in_conversation" || status === "negotiating") return "implemented";
  return "proposed";
}

export function isOpportunityForwardTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  const fromIdx = statusIndex.get(from);
  const toIdx = statusIndex.get(to);
  if (fromIdx == null || toIdx == null) return false;

  // Closed states are terminal.
  if (from === "won" || from === "lost" || from === "parked") return false;

  // We allow only forward motion along the canonical pipeline.
  return toIdx > fromIdx;
}

export function explainOpportunityTransition(from: OpportunityStatus, to: OpportunityStatus): string {
  if (from === to) return "No-op transition";
  if (from === "won" || from === "lost" || from === "parked") {
    return `Opportunity is closed (${from}); status cannot be changed from the dashboard.`;
  }
  if (!isOpportunityForwardTransition(from, to)) {
    return `Invalid transition: ${from} → ${to}. Dashboard requires forward-only transitions (review → approve → implement).`;
  }
  return "OK";
}

