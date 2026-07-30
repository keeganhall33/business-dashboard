export type ExecutionAdapterId = "mock";

export type Reversibility = "reversible" | "partially_reversible" | "irreversible";

export type ExecutionState =
  | "requested"
  | "dry_run_succeeded"
  | "confirmation_required"
  | "confirmed"
  | "queued"
  | "started"
  | "succeeded"
  | "partial_succeeded"
  | "failed"
  | "timeout"
  | "cancel_requested"
  | "cancelled"
  | "rollback_requested"
  | "rolled_back"
  | "rollback_failed"
  | "blocked";

export type AdapterCapabilities = {
  supportsCancel: boolean;
  supportsRollback: boolean;
  supportsPartialRollback: boolean;
  supportsVerification: boolean;
  irreversibleOperations: string[];
};

export type ExecutionContext = {
  actionId: string;
  operatorId: string;
  idempotencyKey: string;
  timeoutMs: number;
  retryPolicy: { maxAttempts: number; backoffMs: number };

  approval: { approvedAt: string; approvedBy: string; auditIds: string[] };
  evidence: { snapshotId: string; hash: string; expiresAt: string | null };

  payload: { hash: string; summary: string; raw: Record<string, unknown> };
  rollbackPlan: { required: boolean; hash: string | null; summary: string; raw: Record<string, unknown> | null };

  reversibility: Reversibility;
  irreversibilityExplanation: string | null;
  auditMetadata: Record<string, unknown>;
};

export type DryRunResult = {
  ok: boolean;
  blockingReasons: string[];
  warnings: string[];

  validatedPayloadHash: string;
  validatedActionStateHash: string;
  adapterCapabilities: AdapterCapabilities;

  estimatedImpact: Record<string, unknown>;
  estimatedCost: Record<string, unknown>;

  rollbackReadiness: { ok: boolean; reasons: string[] };
  preview: { summary: string; diff?: unknown };
  expiresAtUtc: string;
};

export type ExecuteResult = {
  ok: boolean;
  status: "succeeded" | "partial_succeeded" | "failed" | "timeout" | "cancelled";
  externalSideEffects: 0;
  providerExecutionId: string | null;
  completedSteps: string[];
  failedSteps: string[];
  rollbackEligible: boolean;
  result: Record<string, unknown>;
};

export interface ExecutionAdapter {
  id: ExecutionAdapterId;
  capabilities(): AdapterCapabilities;
  validate(ctx: ExecutionContext): Promise<{ ok: boolean; errors: string[] }>; 
  dryRun(ctx: ExecutionContext): Promise<DryRunResult>;
  execute(ctx: ExecutionContext): Promise<ExecuteResult>;
  verify(ctx: ExecutionContext): Promise<{ ok: boolean; details: Record<string, unknown> }>;
  getRollbackPreview(ctx: ExecutionContext): Promise<{ ok: boolean; summary: string; warnings: string[] }>;
  rollback(ctx: ExecutionContext): Promise<ExecuteResult>;
  cancel(ctx: ExecutionContext): Promise<{ ok: boolean; status: "cancelled" | "not_cancellable"; details?: Record<string, unknown> }>;
  getStatus(input: { providerExecutionId: string }): Promise<{ status: string; details: Record<string, unknown> }>;
}

