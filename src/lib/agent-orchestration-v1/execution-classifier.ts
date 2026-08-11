import type { ExecutionClass, OrchestrationStream } from "./types";

export function classifyExecution(params: {
  stream: OrchestrationStream;
  humanApprovalRequired: boolean;
  body: string;
}): { executionClass: ExecutionClass; reason: string } {
  if (params.humanApprovalRequired) {
    return { executionClass: "KEEGAN_APPROVAL_REQUIRED", reason: "human_approval_required=true" };
  }

  // Stream-based default: core intelligence work is review-sensitive by design.
  if (params.stream === "CORE_INTELLIGENCE" || params.stream === "DISCOVERY_INTELLIGENCE" || params.stream === "INTELLIGENCE_UX") {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: `stream=${params.stream} is review-sensitive` };
  }

  const text = params.body.toLowerCase();
  const reviewKeywords = [
    "migration",
    "schema",
    "rls",
    "security",
    "auth",
    "credentials",
    "smtp",
    "production write",
    "valuation",
    "ranking",
    "recommendation",
    "coverage semantics",
    "claim semantics",
    "evidence semantics"
  ];
  if (reviewKeywords.some((k) => text.includes(k))) {
    return { executionClass: "ARCHITECT_REVIEW_REQUIRED", reason: "review keywords present" };
  }

  return { executionClass: "AUTO_CONTINUE", reason: "default" };
}

