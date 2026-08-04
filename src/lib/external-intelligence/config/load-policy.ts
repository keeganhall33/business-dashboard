import fs from "node:fs";

import { AnyPolicyFileSchema, type PolicyFile } from "@/lib/external-intelligence/config/contracts";
import { policyPath } from "@/lib/external-intelligence/config/paths";
import { createPolicyRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";
import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

export type LoadedPolicy = {
  file: PolicyFile;
  policy_ref: PolicyRef;
};

export function loadPolicyFile(input: {
  policy_name: string;
  semantic_version: string;
  expected_content_hash?: string;
  require_production_eligible?: boolean;
}): LoadedPolicy {
  const p = policyPath(input);
  const raw = fs.readFileSync(p, "utf8");
  const json = JSON.parse(raw) as unknown;
  const file = AnyPolicyFileSchema.parse(json);

  // Must match requested identity.
  if (file.policy_name !== input.policy_name) throw new Error(`policy_name mismatch: expected=${input.policy_name}`);
  if (file.semantic_version !== input.semantic_version) {
    throw new Error(`semantic_version mismatch: expected=${input.semantic_version}`);
  }

  // Fixtures must never be production-eligible in A2.
  if (file.production_eligibility !== "disabled") throw new Error(`policy production_eligibility must be disabled`);

  if (input.require_production_eligible) {
    // Fail-closed: fixture policy files are never eligible for production automation.
    throw new Error("fixture policy is not eligible for production use");
  }

  // Fail-closed: if production use were requested in the future, require explicit approval.
  // (Fixtures are approved as architecture fixtures, not approved as production automation policies.)
  if (file.approval_status !== "approved") {
    throw new Error("policy approval_status must be approved");
  }

  const content_hash = createPolicyRefContentHash(file);

  if (input.expected_content_hash && input.expected_content_hash !== content_hash) {
    throw new Error("policy content_hash mismatch");
  }

  const policy_ref: PolicyRef = {
    policy_name: file.policy_name,
    semantic_version: file.semantic_version,
    content_hash,
    effective_from: file.effective_from,
    effective_until: file.effective_until,
    approval_status: file.approval_status,
    approved_by: file.approved_by,
    changed_at: file.changed_at,
    change_reason: file.change_reason
  };

  return deepFreeze({ file, policy_ref });
}
