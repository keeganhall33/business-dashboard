export type ExecutionDomainErrorCode =
  | "EXECUTION_PRODUCTION_BLOCKED"
  | "EXECUTION_GLOBAL_DISABLED"
  | "EXECUTION_ENV_DISABLED"
  | "EXECUTION_ADAPTER_DISABLED"
  | "EXECUTION_CATEGORY_DISABLED"
  | "EXECUTION_EMERGENCY_STOP"
  | "EXECUTION_ACTION_NOT_APPROVED"
  | "EXECUTION_EVIDENCE_STALE"
  | "EXECUTION_REVALIDATION_REQUIRED"
  | "EXECUTION_DRY_RUN_REQUIRED"
  | "EXECUTION_DRY_RUN_EXPIRED"
  | "EXECUTION_CONFIRMATION_REQUIRED"
  | "EXECUTION_CONFIRMATION_EXPIRED"
  | "EXECUTION_PAYLOAD_CHANGED"
  | "EXECUTION_ACTION_STATE_CHANGED"
  | "EXECUTION_SELF_CONFIRMATION_BLOCKED"
  | "EXECUTION_IRREVERSIBLE_ACK_REQUIRED"
  | "EXECUTION_LOCKED"
  | "EXECUTION_IDEMPOTENCY_CONFLICT"
  | "EXECUTION_INVALID_TRANSITION"
  | "EXECUTION_ROLLBACK_NOT_ALLOWED"
  | "EXECUTION_EXTERNAL_SIDE_EFFECTS_NOT_ALLOWED";

export class ExecutionDomainError extends Error {
  readonly code: ExecutionDomainErrorCode;
  readonly details: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(input: { code: ExecutionDomainErrorCode; message: string; httpStatus?: number; details?: Record<string, unknown> }) {
    super(input.message);
    this.code = input.code;
    this.details = input.details ?? {};
    this.httpStatus = input.httpStatus ?? 400;
  }
}
