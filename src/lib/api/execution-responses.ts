import { NextResponse } from "next/server";

import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";

export type ExecutionApiErrorCode =
  | "production_blocked"
  | "execution_disabled"
  | "env_disabled"
  | "adapter_disabled"
  | "category_disabled"
  | "emergency_stop"
  | "action_not_approved"
  | "stale_evidence"
  | "revalidation_required"
  | "dry_run_required"
  | "dry_run_expired"
  | "confirmation_required"
  | "confirmation_expired"
  | "payload_changed"
  | "action_state_changed"
  | "self_confirmation_blocked"
  | "irreversible_ack_required"
  | "execution_locked"
  | "idempotency_conflict"
  | "invalid_transition"
  | "rollback_unavailable"
  | "bad_request"
  | "internal_error";

function mapDomainCode(code: ExecutionDomainError["code"]): ExecutionApiErrorCode {
  switch (code) {
    case "EXECUTION_PRODUCTION_BLOCKED":
      return "production_blocked";
    case "EXECUTION_GLOBAL_DISABLED":
      return "execution_disabled";
    case "EXECUTION_ENV_DISABLED":
      return "env_disabled";
    case "EXECUTION_ADAPTER_DISABLED":
      return "adapter_disabled";
    case "EXECUTION_CATEGORY_DISABLED":
      return "category_disabled";
    case "EXECUTION_EMERGENCY_STOP":
      return "emergency_stop";
    case "EXECUTION_ACTION_NOT_APPROVED":
      return "action_not_approved";
    case "EXECUTION_EVIDENCE_STALE":
      return "stale_evidence";
    case "EXECUTION_REVALIDATION_REQUIRED":
      return "revalidation_required";
    case "EXECUTION_DRY_RUN_REQUIRED":
      return "dry_run_required";
    case "EXECUTION_DRY_RUN_EXPIRED":
      return "dry_run_expired";
    case "EXECUTION_CONFIRMATION_REQUIRED":
      return "confirmation_required";
    case "EXECUTION_CONFIRMATION_EXPIRED":
      return "confirmation_expired";
    case "EXECUTION_PAYLOAD_CHANGED":
      return "payload_changed";
    case "EXECUTION_ACTION_STATE_CHANGED":
      return "action_state_changed";
    case "EXECUTION_SELF_CONFIRMATION_BLOCKED":
      return "self_confirmation_blocked";
    case "EXECUTION_IRREVERSIBLE_ACK_REQUIRED":
      return "irreversible_ack_required";
    case "EXECUTION_LOCKED":
      return "execution_locked";
    case "EXECUTION_IDEMPOTENCY_CONFLICT":
      return "idempotency_conflict";
    case "EXECUTION_INVALID_TRANSITION":
      return "invalid_transition";
    case "EXECUTION_ROLLBACK_NOT_ALLOWED":
      return "rollback_unavailable";
    default:
      return "bad_request";
  }
}

export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function executionError(error: unknown, fallbackMessage: string) {
  if (error instanceof ExecutionDomainError) {
    const code = mapDomainCode(error.code);
    // Known policy failures must not be 500.
    const status = Math.min(Math.max(error.httpStatus || 400, 400), 499);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code,
          domain_code: error.code,
          message: error.message
        }
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "internal_error" as const,
        message: fallbackMessage,
        details: {
          message: error instanceof Error ? error.message : String(error)
        }
      }
    },
    { status: 500 }
  );
}
