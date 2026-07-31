import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { normalizeOperatorId, requireHumanOperatorId } from "@/lib/actions/execution/operator";

// Phase 5: server-derived actor identity.
// Dashboard auth is the outer gate; we still block agent identities for execution.

export function getExecutionActor(request: Request): { actor: string; synthetic: boolean } {
  const base = "dashboard";
  const raw = String(request.headers.get("x-m12-harness-actor") ?? "").trim();
  const harness = String(request.headers.get("x-m12-harness") ?? "").trim();

  if (process.env.NODE_ENV !== "production" && harness === "1" && raw) {
    // Synthetic-only override for staging harness.
    const normalized = normalizeOperatorId(raw);
    if (!normalized) throw new ExecutionDomainError({ code: "EXECUTION_SELF_CONFIRMATION_BLOCKED", message: "Missing operator identity", httpStatus: 400 });
    // Still enforce human operator rule (blocks agent identities).
    return { actor: requireHumanOperatorId(normalized), synthetic: true };
  }

  return { actor: base, synthetic: false };
}

