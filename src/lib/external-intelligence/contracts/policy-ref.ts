import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import type { ApprovalStatus } from "@/lib/external-intelligence/contracts/enums";
import { z } from "zod";

export type PolicyRef = {
  policy_name: string;
  semantic_version: string;
  content_hash: string;

  effective_from: string; // YYYY-MM-DD
  effective_until: string | null; // YYYY-MM-DD

  approval_status: ApprovalStatus;
  approved_by: string | null;

  // Operational timestamp; must not contaminate semantic hashing.
  changed_at: string | null; // YYYY-MM-DD or ISO; null recommended for fixtures
  change_reason: string;
};

export const PolicyRefSchema = z
  .object({
    policy_name: z.string().min(1),
    semantic_version: z.string().min(1),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effective_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    approval_status: z.enum(["draft", "approved", "retired"]) as z.ZodType<ApprovalStatus>,
    approved_by: z.string().min(1).nullable(),
    changed_at: z.string().min(1).nullable(),
    change_reason: z.string().min(1)
  })
  .strict();

/**
 * Deterministic PolicyRef hashing:
 * - Hash only the semantic policy content (exclude non-semantic timestamps).
 * - Callers should pass the policy JSON with changed_at null (fixtures) or removed.
 */
export function computePolicyContentHash(policyFileJson: unknown): string {
  return computeContentHash(policyFileJson);
}
