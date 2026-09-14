import { createHash } from "node:crypto";

const OBJECT_TYPES = new Set(["campaign", "adset"]);
const MUTABLE_FIELDS = new Set(["daily_budget", "lifetime_budget", "status"]);
const STATUS_VALUES = new Set(["ACTIVE", "PAUSED"]);

export class MetaControlPlaneError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "MetaControlPlaneError";
    this.code = code;
    this.details = details;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function stateFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function safeMessage(value, secret) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

function assertObjectType(objectType) {
  if (!OBJECT_TYPES.has(objectType)) {
    throw new MetaControlPlaneError("UNSUPPORTED_OBJECT_TYPE", "Only campaign and ad-set changes are supported");
  }
}

export function validateBoundedChange(beforeState, proposedState) {
  const changed = Object.keys(proposedState).filter((key) => proposedState[key] !== beforeState[key]);
  if (changed.length === 0) throw new MetaControlPlaneError("NO_CHANGE", "Proposal must change at least one field");
  if (changed.some((key) => !MUTABLE_FIELDS.has(key))) {
    throw new MetaControlPlaneError("UNSUPPORTED_MUTATION", "Only budget and status changes are supported");
  }

  if (changed.includes("status") && !STATUS_VALUES.has(proposedState.status)) {
    throw new MetaControlPlaneError("GUARDRAIL_REJECTED", "Status may only be ACTIVE or PAUSED");
  }

  for (const field of ["daily_budget", "lifetime_budget"]) {
    if (!changed.includes(field)) continue;
    const before = Number(beforeState[field]);
    const after = Number(proposedState[field]);
    if (!Number.isFinite(before) || before <= 0 || !Number.isFinite(after) || after <= 0) {
      throw new MetaControlPlaneError("GUARDRAIL_REJECTED", `${field} must remain a positive number`);
    }
    if (Math.abs(after - before) / before > 0.2 + Number.EPSILON) {
      throw new MetaControlPlaneError("GUARDRAIL_REJECTED", "A single budget adjustment cannot exceed 20%");
    }
  }

  return Object.fromEntries(changed.map((key) => [key, proposedState[key]]));
}

export function createMetaMarketingClient({ accessToken, fetchImpl = globalThis.fetch, baseUrl = "https://graph.facebook.com/v25.0" }) {
  if (!accessToken?.trim()) throw new MetaControlPlaneError("MISSING_CREDENTIAL", "Meta access token is not configured");
  if (typeof fetchImpl !== "function") throw new MetaControlPlaneError("MISSING_FETCH", "Fetch implementation is required");
  const token = accessToken.trim();

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${path}`, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${token}` }
      });
    } catch (error) {
      throw new MetaControlPlaneError("META_TRANSPORT_ERROR", safeMessage(error instanceof Error ? error.message : error, token));
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload?.error?.message ?? `Meta API returned HTTP ${response.status}`;
      throw new MetaControlPlaneError(
        response.status === 401 || response.status === 403 ? "META_PERMISSION_DENIED" : "META_API_ERROR",
        safeMessage(reason, token),
        { status: response.status }
      );
    }
    return payload;
  }

  return {
    async readObject(objectType, objectId) {
      assertObjectType(objectType);
      const fields = "id,status,effective_status,daily_budget,lifetime_budget,updated_time";
      return request(`${encodeURIComponent(objectId)}?fields=${encodeURIComponent(fields)}`);
    },
    async writeObject(objectType, objectId, patch) {
      assertObjectType(objectType);
      const unknown = Object.keys(patch).filter((key) => !MUTABLE_FIELDS.has(key));
      if (unknown.length) throw new MetaControlPlaneError("UNSUPPORTED_MUTATION", "Mutation contains unsupported fields");
      return request(encodeURIComponent(objectId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
    }
  };
}

export function createReviewModeService({ repository, metaClient, now = () => new Date().toISOString() }) {
  if (!repository || !metaClient) throw new MetaControlPlaneError("INVALID_CONFIGURATION", "Repository and Meta client are required");

  async function requireProposal(id) {
    const proposal = await repository.get(id);
    if (!proposal) throw new MetaControlPlaneError("NOT_FOUND", "Proposal not found");
    return proposal;
  }

  return {
    list: (state) => repository.list(state),

    async observe(input) {
      assertObjectType(input.objectType);
      if (!input.objectId?.trim() || !input.rationale?.trim() || !input.proposer?.trim() || !input.idempotencyKey?.trim()) {
        throw new MetaControlPlaneError("INVALID_PROPOSAL", "Object id, rationale, proposer, and idempotency key are required");
      }
      if (!input.proposedState || typeof input.proposedState !== "object" || Array.isArray(input.proposedState)) {
        throw new MetaControlPlaneError("INVALID_PROPOSAL", "Proposed state must be an object");
      }
      const existing = await repository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
      const beforeState = await metaClient.readObject(input.objectType, input.objectId);
      const mutation = validateBoundedChange(beforeState, input.proposedState);
      return repository.create({
        object_type: input.objectType,
        object_id: input.objectId,
        before_state: beforeState,
        proposed_state: { ...beforeState, ...mutation },
        rationale: input.rationale,
        supporting_metrics: input.supportingMetrics ?? {},
        confidence: input.confidence,
        risk_tier: input.riskTier,
        proposer: input.proposer,
        approval_state: "PENDING",
        execution_state: "NOT_STARTED",
        meta_response: null,
        idempotency_key: input.idempotencyKey,
        precondition_state: stateFingerprint(beforeState),
        rollback_metadata: null,
        created_at: now(),
        updated_at: now()
      });
    },

    async approve(id, actor) {
      const proposal = await requireProposal(id);
      if (proposal.approval_state === "REJECTED") throw new MetaControlPlaneError("REJECTED", "Rejected proposals cannot be approved");
      if (!actor?.trim()) throw new MetaControlPlaneError("APPROVER_REQUIRED", "Explicit approver is required");
      return repository.update(id, { approval_state: "APPROVED", approved_by: actor, approved_at: now(), updated_at: now() });
    },

    async reject(id, actor, reason) {
      const proposal = await requireProposal(id);
      if (proposal.execution_state === "SUCCEEDED") throw new MetaControlPlaneError("ALREADY_EXECUTED", "Executed proposals cannot be rejected");
      if (!actor?.trim() || !reason?.trim()) throw new MetaControlPlaneError("REJECTION_DETAILS_REQUIRED", "Rejector and reason are required");
      return repository.update(id, { approval_state: "REJECTED", rejected_by: actor, rejection_reason: reason, updated_at: now() });
    },

    async execute(id, { dryRun = true, confirmLiveWrite = false } = {}) {
      const proposal = await requireProposal(id);
      if (proposal.approval_state !== "APPROVED") throw new MetaControlPlaneError("APPROVAL_REQUIRED", "Proposal requires explicit approval");
      if (proposal.execution_state === "SUCCEEDED") return proposal;
      if (!dryRun && !confirmLiveWrite) throw new MetaControlPlaneError("LIVE_CONFIRMATION_REQUIRED", "Live write requires separate confirmation");

      const liveState = await metaClient.readObject(proposal.object_type, proposal.object_id);
      if (stateFingerprint(liveState) !== proposal.precondition_state) {
        return repository.update(id, { execution_state: "STALE", meta_response: null, updated_at: now() });
      }
      const mutation = validateBoundedChange(proposal.before_state, proposal.proposed_state);
      if (dryRun) {
        return repository.update(id, {
          execution_state: "DRY_RUN",
          meta_response: { dryRun: true, mutation },
          updated_at: now()
        });
      }

      try {
        const response = await metaClient.writeObject(proposal.object_type, proposal.object_id, mutation);
        return repository.update(id, {
          execution_state: "SUCCEEDED",
          meta_response: response,
          executed_at: now(),
          rollback_metadata: { reversible: true, restore: Object.fromEntries(Object.keys(mutation).map((key) => [key, proposal.before_state[key]])) },
          updated_at: now()
        });
      } catch (error) {
        await repository.update(id, {
          execution_state: "FAILED",
          meta_response: { code: error?.code ?? "META_API_ERROR", message: error instanceof Error ? error.message : String(error) },
          updated_at: now()
        });
        throw error;
      }
    },

    async rollback(id, { dryRun = true, confirmLiveWrite = false } = {}) {
      const proposal = await requireProposal(id);
      if (proposal.execution_state !== "SUCCEEDED" || !proposal.rollback_metadata?.reversible) {
        throw new MetaControlPlaneError("ROLLBACK_UNAVAILABLE", "Proposal has no reversible successful execution");
      }
      if (!dryRun && !confirmLiveWrite) throw new MetaControlPlaneError("LIVE_CONFIRMATION_REQUIRED", "Live rollback requires separate confirmation");
      if (dryRun) return repository.update(id, { rollback_state: "DRY_RUN", updated_at: now() });
      const response = await metaClient.writeObject(proposal.object_type, proposal.object_id, proposal.rollback_metadata.restore);
      return repository.update(id, { rollback_state: "SUCCEEDED", rollback_response: response, rolled_back_at: now(), updated_at: now() });
    }
  };
}
