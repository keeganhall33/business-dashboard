import type {
  DecisionProvenanceV1,
  TaskContractV1,
  VerificationResultV1,
  WorkflowStateV1
} from "./execution-control";

export type HarnessAuthorization = {
  allowed: boolean;
  reason: string;
};

export function authorizeTool(contract: TaskContractV1, tool: string): HarnessAuthorization {
  return contract.allowedTools.includes(tool)
    ? { allowed: true, reason: `Tool ${tool} is permitted by the task contract.` }
    : { allowed: false, reason: `Tool ${tool} is outside the task contract.` };
}

export function authorizeSource(contract: TaskContractV1, source: string): HarnessAuthorization {
  return contract.allowedSources.includes(source)
    ? { allowed: true, reason: `Source ${source} is permitted by the task contract.` }
    : { allowed: false, reason: `Source ${source} is outside the task contract.` };
}

export function applyVerificationResult(args: {
  state: WorkflowStateV1;
  verification: VerificationResultV1;
  provenance?: DecisionProvenanceV1;
  nextNode?: string | null;
  now?: string;
}): WorkflowStateV1 {
  const now = args.now ?? new Date().toISOString();
  const next = { ...args.state };

  if (args.provenance) {
    next.decisionProvenance = [...next.decisionProvenance, args.provenance];
  }

  switch (args.verification.disposition) {
    case "accept":
      next.status = "completed";
      next.blockedReason = null;
      next.humanAttentionRequired = false;
      break;
    case "retry":
      next.status = "retrying";
      next.attempt += 1;
      next.blockedReason = args.verification.reason;
      next.humanAttentionRequired = false;
      break;
    case "reroute":
      next.status = "rerouting";
      next.attempt += 1;
      next.blockedReason = args.verification.reason;
      next.humanAttentionRequired = false;
      if (args.nextNode) next.currentNode = args.nextNode;
      break;
    case "reject":
      next.status = "rejected";
      next.blockedReason = args.verification.reason;
      next.humanAttentionRequired = false;
      break;
    case "escalate":
      next.status = "escalated";
      next.blockedReason = args.verification.reason;
      next.humanAttentionRequired = true;
      break;
  }

  if (args.verification.accepted) {
    next.lastMeaningfulProgressAt = now;
  }

  return next;
}
