import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";

export function normalizeOperatorId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/\s+/g, " ");
}

export function requireHumanOperatorId(raw: string): string {
  const operatorId = normalizeOperatorId(raw);
  if (!operatorId) {
    throw new ExecutionDomainError({
      code: "EXECUTION_SELF_CONFIRMATION_BLOCKED",
      message: "Missing operator identity",
      httpStatus: 400
    });
  }
  if (/\bagent\b/i.test(operatorId)) {
    throw new ExecutionDomainError({
      code: "EXECUTION_SELF_CONFIRMATION_BLOCKED",
      message: "Agent identities may not confirm or execute",
      httpStatus: 400
    });
  }
  return operatorId;
}

