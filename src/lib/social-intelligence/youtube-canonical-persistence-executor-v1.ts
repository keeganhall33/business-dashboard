import type { CanonicalSocialAccountSnapshotV1 } from "./social-canonical-v1";
import type { YouTubeCanonicalIngestionHandoffV1 } from "./youtube-canonical-ingestion-handoff-v1";
import type {
  YouTubeCanonicalPersistenceOperationV1,
  YouTubeCanonicalPersistencePlanV1
} from "./youtube-canonical-persistence-plan-v1";

export const YOUTUBE_CANONICAL_PERSISTENCE_RPC_V1 = "persist_social_canonical_snapshot_v1" as const;

export const YOUTUBE_CANONICAL_PERSISTENCE_EXECUTION_STATES_V1 = [
  "PERSISTED",
  "NOOP",
  "VERIFICATION_REQUIRED"
] as const;
export type YouTubeCanonicalPersistenceExecutionStateV1 =
  (typeof YOUTUBE_CANONICAL_PERSISTENCE_EXECUTION_STATES_V1)[number];

export const YOUTUBE_CANONICAL_PERSISTENCE_EXECUTION_REASONS_V1 = [
  "RPC_APPLIED",
  "RPC_CHECKPOINT_ADVANCED",
  "RPC_IDEMPOTENT",
  "PLAN_ALREADY_NOOP",
  "PLAN_NOT_APPLICABLE",
  "PLAN_IDENTITY_MISMATCH",
  "PLAN_AUTHORITY_WIDENED",
  "PLAN_OPERATION_SHAPE_INVALID",
  "CANDIDATE_SNAPSHOT_MISSING",
  "CANDIDATE_SNAPSHOT_BINDING_MISMATCH",
  "EVIDENCE_BINDING_MISMATCH",
  "RPC_REJECTED",
  "RPC_THROWN",
  "RPC_RESULT_INVALID"
] as const;
export type YouTubeCanonicalPersistenceExecutionReasonV1 =
  (typeof YOUTUBE_CANONICAL_PERSISTENCE_EXECUTION_REASONS_V1)[number];

export type YouTubeCanonicalPersistenceRpcArgsV1 = {
  in_canonical_key: string;
  in_platform: "YOUTUBE";
  in_connector_id: string;
  in_run_id: string;
  in_snapshot_id: string;
  in_account_id: string;
  in_retrieved_at: string;
  in_source_state: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL";
  in_provider_evidence_refs: readonly string[];
  in_evidence_refs: readonly string[];
  in_snapshot_json: CanonicalSocialAccountSnapshotV1;
  in_expected_cursor: string | null;
  in_expected_completed_through_at: string | null;
  in_next_cursor: string | null;
  in_next_completed_through_at: string;
};

export type SocialCanonicalPersistenceRpcErrorV1 = {
  code?: unknown;
};

export type SocialCanonicalPersistenceRpcClientV1 = {
  rpc(
    functionName: typeof YOUTUBE_CANONICAL_PERSISTENCE_RPC_V1,
    args: YouTubeCanonicalPersistenceRpcArgsV1
  ): Promise<{
    data: unknown;
    error: SocialCanonicalPersistenceRpcErrorV1 | null;
  }>;
};

export type ExecuteYouTubeCanonicalPersistenceInputV1 = {
  plan: YouTubeCanonicalPersistencePlanV1;
  handoff: YouTubeCanonicalIngestionHandoffV1;
  rpcClient: SocialCanonicalPersistenceRpcClientV1;
  now: string;
};

export type YouTubeCanonicalPersistenceExecutionV1 = {
  contractVersion: "YouTubeCanonicalPersistenceExecutionV1";
  generatedAt: string;
  platform: "YOUTUBE";
  connectorId: string;
  runId: string;
  state: YouTubeCanonicalPersistenceExecutionStateV1;
  reasonCodes: readonly YouTubeCanonicalPersistenceExecutionReasonV1[];
  candidateSnapshotId: string | null;
  rpcInvoked: boolean;
  rpcStatus: "APPLIED" | "CHECKPOINT_ADVANCED" | "IDEMPOTENT" | null;
  rpcErrorCode: string | null;
  canonicalPersistencePerformed: boolean;
  providerWritesPerformed: false;
  externalActionAuthorityGranted: false;
  causalClaimsCreated: false;
  attributionClaimsCreated: false;
};

type CheckpointOperationV1 = Extract<
  YouTubeCanonicalPersistenceOperationV1,
  { kind: "COMPARE_AND_SET_CHECKPOINT" }
>;
type AppendOperationV1 = Extract<
  YouTubeCanonicalPersistenceOperationV1,
  { kind: "APPEND_CANONICAL_SNAPSHOT" }
>;

const MAX_REFERENCE_LENGTH = 2_000;
const SAFE_RPC_ERROR_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function normalizeRefs(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function refsEqual(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizeRefs(left);
  const b = normalizeRefs(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function safeReference(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_REFERENCE_LENGTH) return false;
  if (/^bearer\s+/i.test(normalized)) return false;
  if (/(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) return false;
    for (const key of ["access_token", "token", "api_key", "apikey", "signature", "secret"]) {
      if (parsed.searchParams.has(key)) return false;
    }
  } catch {
    // Evidence references may be durable internal IDs rather than URLs.
  }
  return true;
}

function sanitizeRpcErrorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_RPC_ERROR_CODE.test(normalized) ? normalized : null;
}

function executionResult(input: {
  generatedAt: string;
  plan: YouTubeCanonicalPersistencePlanV1;
  state: YouTubeCanonicalPersistenceExecutionStateV1;
  reasons: readonly YouTubeCanonicalPersistenceExecutionReasonV1[];
  rpcInvoked?: boolean;
  rpcStatus?: "APPLIED" | "CHECKPOINT_ADVANCED" | "IDEMPOTENT" | null;
  rpcErrorCode?: string | null;
  canonicalPersistencePerformed?: boolean;
}): YouTubeCanonicalPersistenceExecutionV1 {
  return freeze({
    contractVersion: "YouTubeCanonicalPersistenceExecutionV1",
    generatedAt: input.generatedAt,
    platform: "YOUTUBE",
    connectorId: input.plan.connectorId,
    runId: input.plan.runId,
    state: input.state,
    reasonCodes: [...new Set(input.reasons)].sort((left, right) => left.localeCompare(right)),
    candidateSnapshotId: input.plan.candidateSnapshotId,
    rpcInvoked: input.rpcInvoked ?? false,
    rpcStatus: input.rpcStatus ?? null,
    rpcErrorCode: input.rpcErrorCode ?? null,
    canonicalPersistencePerformed: input.canonicalPersistencePerformed ?? false,
    providerWritesPerformed: false,
    externalActionAuthorityGranted: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false
  });
}

function verification(
  generatedAt: string,
  plan: YouTubeCanonicalPersistencePlanV1,
  reason: YouTubeCanonicalPersistenceExecutionReasonV1,
  rpcInvoked = false,
  rpcErrorCode: string | null = null
): YouTubeCanonicalPersistenceExecutionV1 {
  return executionResult({
    generatedAt,
    plan,
    state: "VERIFICATION_REQUIRED",
    reasons: [reason],
    rpcInvoked,
    rpcErrorCode
  });
}

function candidateSnapshot(handoff: YouTubeCanonicalIngestionHandoffV1): CanonicalSocialAccountSnapshotV1 | null {
  return handoff.projection?.snapshot ?? null;
}

function parseOperationShape(operations: readonly YouTubeCanonicalPersistenceOperationV1[]): {
  append: AppendOperationV1 | null;
  checkpoint: CheckpointOperationV1 | null;
} | null {
  if (operations.length === 1 && operations[0]?.kind === "COMPARE_AND_SET_CHECKPOINT") {
    return { append: null, checkpoint: operations[0] };
  }
  if (
    operations.length === 2 &&
    operations[0]?.kind === "APPEND_CANONICAL_SNAPSHOT" &&
    operations[1]?.kind === "COMPARE_AND_SET_CHECKPOINT"
  ) {
    return { append: operations[0], checkpoint: operations[1] };
  }
  return null;
}

function parseRpcRow(data: unknown): {
  status: "APPLIED" | "CHECKPOINT_ADVANCED" | "IDEMPOTENT";
  snapshotId: string;
  checkpointCompletedThroughAt: string;
} | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const raw = data[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (status !== "APPLIED" && status !== "CHECKPOINT_ADVANCED" && status !== "IDEMPOTENT") return null;
  if (typeof record.snapshot_id !== "string" || typeof record.checkpoint_completed_through_at !== "string") return null;
  let checkpointCompletedThroughAt: string;
  try {
    checkpointCompletedThroughAt = requireIso(
      record.checkpoint_completed_through_at,
      "rpc.checkpoint_completed_through_at"
    );
  } catch {
    return null;
  }
  return {
    status,
    snapshotId: record.snapshot_id,
    checkpointCompletedThroughAt
  };
}

export async function executeYouTubeCanonicalPersistenceV1(
  input: ExecuteYouTubeCanonicalPersistenceInputV1
): Promise<YouTubeCanonicalPersistenceExecutionV1> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.rpcClient || typeof input.rpcClient.rpc !== "function") throw new Error("rpcClient.rpc must be a function");
  const generatedAt = requireIso(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const { plan, handoff } = input;

  if (
    !plan ||
    plan.contractVersion !== "YouTubeCanonicalPersistencePlanV1" ||
    plan.platform !== "YOUTUBE" ||
    !handoff ||
    handoff.contractVersion !== "YouTubeCanonicalIngestionHandoffV1" ||
    handoff.platform !== "YOUTUBE"
  ) {
    throw new Error("plan and handoff must be exact YouTube canonical persistence artifacts");
  }

  if (Date.parse(requireIso(plan.generatedAt, "plan.generatedAt")) > nowMs) {
    throw new Error("plan cannot be future-dated");
  }
  if (Date.parse(requireIso(handoff.generatedAt, "handoff.generatedAt")) > nowMs) {
    throw new Error("handoff cannot be future-dated");
  }

  if (
    plan.connectorId !== handoff.connectorId ||
    plan.runId !== handoff.runId ||
    plan.candidateSnapshotId !== handoff.candidateSnapshotId
  ) {
    return verification(generatedAt, plan, "PLAN_IDENTITY_MISMATCH");
  }

  if (
    plan.providerWritesAllowed !== false ||
    plan.externalActionAuthorityGranted !== false ||
    plan.causalClaimsCreated !== false ||
    plan.attributionClaimsCreated !== false ||
    plan.canonicalPersistencePerformed !== false ||
    handoff.providerWritesPerformed !== false ||
    handoff.canonicalPersistencePerformed !== false ||
    handoff.canonicalPersistenceAuthorized !== false ||
    handoff.externalActionAuthorityGranted !== false ||
    handoff.causalClaimsCreated !== false ||
    handoff.attributionClaimsCreated !== false
  ) {
    return verification(generatedAt, plan, "PLAN_AUTHORITY_WIDENED");
  }

  if (!refsEqual(plan.evidenceRefs, handoff.evidenceRefs)) {
    return verification(generatedAt, plan, "EVIDENCE_BINDING_MISMATCH");
  }
  const allArtifactRefs = [...plan.evidenceRefs, ...handoff.providerEvidenceRefs];
  if (!allArtifactRefs.length || allArtifactRefs.some((ref) => !safeReference(ref))) {
    return verification(generatedAt, plan, "EVIDENCE_BINDING_MISMATCH");
  }

  if (plan.disposition === "NOOP") {
    if (plan.operations.length !== 0 || plan.localCanonicalPersistencePlanAllowed !== false) {
      return verification(generatedAt, plan, "PLAN_OPERATION_SHAPE_INVALID");
    }
    return executionResult({
      generatedAt,
      plan,
      state: "NOOP",
      reasons: ["PLAN_ALREADY_NOOP"]
    });
  }

  if (plan.disposition !== "APPLY" || plan.localCanonicalPersistencePlanAllowed !== true) {
    return verification(generatedAt, plan, "PLAN_NOT_APPLICABLE");
  }

  const shape = parseOperationShape(plan.operations);
  if (!shape?.checkpoint) {
    return verification(generatedAt, plan, "PLAN_OPERATION_SHAPE_INVALID");
  }

  const snapshot = candidateSnapshot(handoff);
  if (!snapshot) return verification(generatedAt, plan, "CANDIDATE_SNAPSHOT_MISSING");

  const sourceState = snapshot.sourceCoverage?.effectiveState;
  if (
    snapshot.contractVersion !== "CanonicalSocialAccountSnapshotV1" ||
    snapshot.platform !== "YOUTUBE" ||
    snapshot.snapshotId !== plan.candidateSnapshotId ||
    snapshot.externalAccessPerformed !== false ||
    snapshot.writesPerformed !== false ||
    (sourceState !== "CONNECTED_AND_INGESTING" && sourceState !== "CONNECTED_PARTIAL")
  ) {
    return verification(generatedAt, plan, "CANDIDATE_SNAPSHOT_BINDING_MISMATCH");
  }

  const checkpoint = shape.checkpoint;
  const expectedCompleted = checkpoint.expected.completedThroughAt
    ? requireIso(checkpoint.expected.completedThroughAt, "checkpoint.expected.completedThroughAt")
    : null;
  const nextCompleted = checkpoint.next.completedThroughAt
    ? requireIso(checkpoint.next.completedThroughAt, "checkpoint.next.completedThroughAt")
    : null;
  const snapshotRetrievedAt = requireIso(snapshot.retrievedAt, "snapshot.retrievedAt");
  const expectedCanonicalKey = `YOUTUBE:${snapshot.accountId}:${snapshot.snapshotId}`;

  if (
    checkpoint.platform !== "YOUTUBE" ||
    checkpoint.connectorId !== plan.connectorId ||
    checkpoint.next.cursor !== null ||
    nextCompleted === null ||
    nextCompleted !== snapshotRetrievedAt ||
    (shape.append !== null &&
      (shape.append.canonicalKey !== expectedCanonicalKey ||
        shape.append.snapshot.snapshotId !== snapshot.snapshotId ||
        shape.append.snapshot.accountId !== snapshot.accountId ||
        !refsEqual(shape.append.snapshot.evidenceRefs, snapshot.evidenceRefs)))
  ) {
    return verification(generatedAt, plan, "CANDIDATE_SNAPSHOT_BINDING_MISMATCH");
  }

  if (
    snapshot.evidenceRefs.length === 0 ||
    handoff.providerEvidenceRefs.length === 0 ||
    snapshot.evidenceRefs.some((ref) => !safeReference(ref)) ||
    handoff.providerEvidenceRefs.some((ref) => !safeReference(ref))
  ) {
    return verification(generatedAt, plan, "EVIDENCE_BINDING_MISMATCH");
  }

  const rpcArgs: YouTubeCanonicalPersistenceRpcArgsV1 = {
    in_canonical_key: expectedCanonicalKey,
    in_platform: "YOUTUBE",
    in_connector_id: plan.connectorId,
    in_run_id: plan.runId,
    in_snapshot_id: snapshot.snapshotId,
    in_account_id: snapshot.accountId,
    in_retrieved_at: snapshotRetrievedAt,
    in_source_state: sourceState,
    in_provider_evidence_refs: [...handoff.providerEvidenceRefs],
    in_evidence_refs: [...snapshot.evidenceRefs],
    in_snapshot_json: snapshot,
    in_expected_cursor: checkpoint.expected.cursor,
    in_expected_completed_through_at: expectedCompleted,
    in_next_cursor: checkpoint.next.cursor,
    in_next_completed_through_at: nextCompleted
  };

  let response: Awaited<ReturnType<SocialCanonicalPersistenceRpcClientV1["rpc"]>>;
  try {
    response = await input.rpcClient.rpc(YOUTUBE_CANONICAL_PERSISTENCE_RPC_V1, rpcArgs);
  } catch {
    return verification(generatedAt, plan, "RPC_THROWN", true);
  }

  if (response.error) {
    return verification(
      generatedAt,
      plan,
      "RPC_REJECTED",
      true,
      sanitizeRpcErrorCode(response.error.code)
    );
  }

  const row = parseRpcRow(response.data);
  if (
    !row ||
    row.snapshotId !== snapshot.snapshotId ||
    row.checkpointCompletedThroughAt !== nextCompleted
  ) {
    return verification(generatedAt, plan, "RPC_RESULT_INVALID", true);
  }

  const reason: YouTubeCanonicalPersistenceExecutionReasonV1 =
    row.status === "APPLIED"
      ? "RPC_APPLIED"
      : row.status === "CHECKPOINT_ADVANCED"
        ? "RPC_CHECKPOINT_ADVANCED"
        : "RPC_IDEMPOTENT";

  return executionResult({
    generatedAt,
    plan,
    state: "PERSISTED",
    reasons: [reason],
    rpcInvoked: true,
    rpcStatus: row.status,
    canonicalPersistencePerformed: row.status !== "IDEMPOTENT"
  });
}
