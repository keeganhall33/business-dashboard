import type { DurableAction } from "@/lib/actions/action-contract";
import { canonicalJsonSha256Hex } from "@/lib/actions/execution/canonical-json";

export function executionActionStateHash(action: DurableAction): string {
  // Only include fields that materially affect execution safety.
  const state = {
    id: action.id,
    status: action.status,
    current_level: action.current_level,
    approval_level: action.approval_level,
    approved_by: action.approved_by,
    approved_at: action.approved_at,
    expires_at: action.expires_at,
    evidence_snapshot_id: action.evidence_snapshot_id,
    evidence_snapshot_hash: action.evidence_snapshot_hash,
    execution_plan: action.execution_plan,
    approval_requirements: action.approval_requirements,
    prepared_assets: action.prepared_assets,
    estimated_cost: action.estimated_cost,
    affected_products: action.affected_products,
    affected_audiences: action.affected_audiences
  };
  return canonicalJsonSha256Hex(state);
}
