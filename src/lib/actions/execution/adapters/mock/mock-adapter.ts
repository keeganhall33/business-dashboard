import type { AdapterCapabilities, DryRunResult, ExecutionAdapter, ExecutionContext, ExecuteResult } from "@/lib/actions/execution/adapter-contract";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { evaluateExecutionGates } from "@/lib/actions/execution/execution-kill-switch";
import { parseMockMode } from "@/lib/actions/execution/adapters/mock/mock-adapter-modes";
import { buildMockExecuteResult } from "@/lib/actions/execution/adapters/mock/mock-adapter-contract";

function nowIso() {
  return new Date().toISOString();
}

function futureIso(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

export class MockExecutionAdapter implements ExecutionAdapter {
  public readonly id = "mock" as const;

  capabilities(): AdapterCapabilities {
    return {
      supportsCancel: true,
      supportsRollback: true,
      supportsPartialRollback: true,
      supportsVerification: true,
      irreversibleOperations: []
    };
  }

  async validate(ctx: ExecutionContext): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Safety gates: deny-by-default.
    try {
      const gates = evaluateExecutionGates({
        actionId: ctx.actionId,
        category: ctx.env.category,
        adapterId: "mock",
        supabaseUrl: ctx.env.supabaseUrl,
        emergencyStop: ctx.env.emergencyStop,
        adapterEnabled: ctx.env.adapterEnabled,
        categoryEnabled: ctx.env.categoryEnabled
      });
      if (!gates.allowed) {
        errors.push(gates.blockingReasons.join("; "));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Mock adapter gate evaluation failed");
    }
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) errors.push(parsed.error);
    if (!ctx.payload.hash) errors.push("Missing payload hash");
    if (!ctx.actionId) errors.push("Missing action id");
    if (!ctx.operatorId) errors.push("Missing operator id");
    if (!ctx.idempotencyKey) errors.push("Missing idempotency key");
    return { ok: errors.length === 0, errors };
  }

  async preview(ctx: ExecutionContext): Promise<{ ok: boolean; summary: string; diff?: unknown; warnings: string[] }> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) {
      return { ok: false, summary: "Invalid mock payload", warnings: [parsed.error] };
    }
    return {
      ok: true,
      summary: `Mock adapter preview (${parsed.mode})`,
      diff: { mode: parsed.mode, deterministic: true },
      warnings: []
    };
  }

  async estimateImpact(ctx: ExecutionContext): Promise<Record<string, unknown>> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, mode: parsed.mode, impact: "none (mock)" };
  }

  async estimateCost(ctx: ExecutionContext): Promise<Record<string, unknown>> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, mode: parsed.mode, usd: 0 };
  }

  async dryRun(ctx: ExecutionContext): Promise<DryRunResult> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) {
      return {
        ok: false,
        blockingReasons: [parsed.error],
        warnings: [],
        validatedPayloadHash: ctx.payload.hash,
        validatedActionStateHash: ctx.payload.hash,
        adapterCapabilities: this.capabilities(),
        estimatedImpact: {},
        estimatedCost: {},
        rollbackReadiness: { ok: true, reasons: [] },
        preview: { summary: "Invalid mock payload" },
        expiresAtUtc: nowIso()
      };
    }

    const preview = await this.preview(ctx);
    const estimatedImpact = await this.estimateImpact(ctx);
    const estimatedCost = await this.estimateCost(ctx);
    const ttlMs = 10 * 60 * 1000;
    return {
      ok: true,
      blockingReasons: [],
      warnings: preview.warnings,
      validatedPayloadHash: ctx.payload.hash,
      validatedActionStateHash: ctx.payload.hash,
      adapterCapabilities: this.capabilities(),
      estimatedImpact,
      estimatedCost,
      rollbackReadiness: { ok: ctx.reversibility !== "irreversible", reasons: ctx.reversibility === "irreversible" ? ["Irreversible action"] : [] },
      preview: { summary: preview.summary, diff: preview.diff },
      expiresAtUtc: futureIso(ttlMs)
    };
  }

  async execute(ctx: ExecutionContext): Promise<ExecuteResult> {
    const gate = await this.validate(ctx);
    if (!gate.ok) {
      throw new ExecutionDomainError({ code: "EXECUTION_ADAPTER_DISABLED", message: gate.errors.join("; "), httpStatus: 403 });
    }
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) {
      throw new ExecutionDomainError({ code: "EXECUTION_DRY_RUN_REQUIRED", message: parsed.error, httpStatus: 400 });
    }

    // Deterministic, no timers/sleeps.
    const providerExecutionId = `mock:${ctx.actionId}:${ctx.idempotencyKey}:${parsed.mode}`;
    const steps = [
      { name: "validate", status: "succeeded" as const },
      { name: "plan", status: "succeeded" as const },
      { name: "apply", status: "succeeded" as const },
      { name: "verify", status: "succeeded" as const }
    ];

    switch (parsed.mode) {
      case "success":
      case "verification_success":
        return buildMockExecuteResult({
          ok: true,
          status: "succeeded",
          providerExecutionId,
          steps,
          rollbackEligible: ctx.reversibility !== "irreversible",
          result: { mode: parsed.mode, message: "Mock execution succeeded" }
        });
      case "partial_success":
        return buildMockExecuteResult({
          ok: true,
          status: "partial_succeeded",
          providerExecutionId,
          steps: [...steps.slice(0, 2), { name: "apply", status: "failed" }, { name: "verify", status: "skipped" }],
          rollbackEligible: true,
          result: { mode: parsed.mode, message: "Mock execution partially succeeded" }
        });
      case "failure":
      case "verification_failure":
        return buildMockExecuteResult({
          ok: false,
          status: "failed",
          providerExecutionId,
          steps: [...steps.slice(0, 2), { name: "apply", status: "failed" }, { name: "verify", status: "skipped" }],
          rollbackEligible: true,
          result: { mode: parsed.mode, message: "Mock execution failed" }
        });
      case "timeout":
        return buildMockExecuteResult({
          ok: false,
          status: "timeout",
          providerExecutionId,
          steps: [{ name: "validate", status: "succeeded" }, { name: "plan", status: "succeeded" }, { name: "apply", status: "skipped" }, { name: "verify", status: "skipped" }],
          rollbackEligible: true,
          result: { mode: parsed.mode, message: "Mock execution timed out (deterministic)" }
        });
      case "cancel_before_start":
        return buildMockExecuteResult({
          ok: false,
          status: "cancelled",
          providerExecutionId,
          steps: [{ name: "validate", status: "skipped" }, { name: "plan", status: "skipped" }, { name: "apply", status: "skipped" }, { name: "verify", status: "skipped" }],
          rollbackEligible: false,
          result: { mode: parsed.mode, message: "Cancelled before start" }
        });
      case "cancel_during_execution":
        return buildMockExecuteResult({
          ok: false,
          status: "cancelled",
          providerExecutionId,
          steps: [{ name: "validate", status: "succeeded" }, { name: "plan", status: "succeeded" }, { name: "apply", status: "skipped" }, { name: "verify", status: "skipped" }],
          rollbackEligible: false,
          result: { mode: parsed.mode, message: "Cancelled during execution" }
        });
      case "rollback_success":
      case "rollback_failure":
        // execute() still represents the forward attempt; rollback is exercised via rollback().
        return buildMockExecuteResult({
          ok: true,
          status: "succeeded",
          providerExecutionId,
          steps,
          rollbackEligible: true,
          result: { mode: parsed.mode, message: "Forward execution succeeded; rollback mode configured" }
        });
    }
  }

  async verify(ctx: ExecutionContext): Promise<{ ok: boolean; details: Record<string, unknown> }> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) return { ok: false, details: { error: parsed.error } };
    if (parsed.mode === "verification_failure") return { ok: false, details: { mode: parsed.mode, verified: false } };
    return { ok: true, details: { mode: parsed.mode, verified: true } };
  }

  async getRollbackPreview(ctx: ExecutionContext): Promise<{ ok: boolean; summary: string; warnings: string[] }> {
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) return { ok: false, summary: "Invalid mock payload", warnings: [parsed.error] };
    if (ctx.reversibility === "irreversible") return { ok: false, summary: "Rollback not available for irreversible actions", warnings: [] };
    return { ok: true, summary: `Mock rollback preview (${parsed.mode})`, warnings: [] };
  }

  async rollback(ctx: ExecutionContext): Promise<ExecuteResult> {
    const gate = await this.validate(ctx);
    if (!gate.ok) {
      throw new ExecutionDomainError({ code: "EXECUTION_ADAPTER_DISABLED", message: gate.errors.join("; "), httpStatus: 403 });
    }
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) {
      throw new ExecutionDomainError({ code: "EXECUTION_ROLLBACK_NOT_ALLOWED", message: parsed.error, httpStatus: 400 });
    }
    const providerExecutionId = `mock-rollback:${ctx.actionId}:${ctx.idempotencyKey}:${parsed.mode}`;

    if (ctx.reversibility === "irreversible") {
      return buildMockExecuteResult({
        ok: false,
        status: "failed",
        providerExecutionId,
        steps: [{ name: "rollback", status: "failed" }],
        rollbackEligible: false,
        result: { mode: parsed.mode, message: "Rollback blocked for irreversible action" }
      });
    }

    if (parsed.mode === "rollback_failure") {
      return buildMockExecuteResult({
        ok: false,
        status: "failed",
        providerExecutionId,
        steps: [{ name: "rollback", status: "failed" }],
        rollbackEligible: false,
        result: { mode: parsed.mode, message: "Mock rollback failed" }
      });
    }

    return buildMockExecuteResult({
      ok: true,
      status: "succeeded",
      providerExecutionId,
      steps: [{ name: "rollback", status: "succeeded" }],
      rollbackEligible: false,
      result: { mode: parsed.mode, message: "Mock rollback succeeded" }
    });
  }

  async cancel(ctx: ExecutionContext): Promise<{ ok: boolean; status: "cancelled" | "not_cancellable"; details?: Record<string, unknown> }> {
    const gate = await this.validate(ctx);
    if (!gate.ok) {
      return { ok: false, status: "not_cancellable", details: { errors: gate.errors } };
    }
    const parsed = parseMockMode(ctx.payload.raw);
    if (!parsed.ok) return { ok: false, status: "not_cancellable", details: { error: parsed.error } };
    return { ok: true, status: "cancelled", details: { mode: parsed.mode, deterministic: true } };
  }

  async getStatus(input: { providerExecutionId: string }): Promise<{ status: string; details: Record<string, unknown> }> {
    // No network: parse status deterministically from the providerExecutionId.
    const parts = input.providerExecutionId.split(":");
    const mode = parts[parts.length - 1] ?? "unknown";
    if (mode === "timeout") return { status: "timeout", details: { mode } };
    if (mode === "failure") return { status: "failed", details: { mode } };
    if (mode === "partial_success") return { status: "partial_succeeded", details: { mode } };
    if (mode === "cancel_before_start" || mode === "cancel_during_execution") return { status: "cancelled", details: { mode } };
    return { status: "succeeded", details: { mode } };
  }
}

export function getMockExecutionAdapter(): ExecutionAdapter {
  return new MockExecutionAdapter();
}
