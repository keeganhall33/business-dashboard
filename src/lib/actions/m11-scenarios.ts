export type ScenarioId =
  | "meta_measurement"
  | "email_integration"
  | "website_conversion"
  | "bundle"
  | "insufficient_evidence"
  | "rejected_suppression"
  | "snoozed"
  | "stale_revalidation"
  | "draft_prepared_and_edited"
  | "internal_l4_approval"
  | "synthetic_success"
  | "synthetic_failure"
  | "synthetic_inconclusive"
  | "deduplication"
  | "invalid_transition"
  | "agent_self_approval"
  | "missing_measurement_plan"
  | "idempotent_approval_replay"
  | "expired_evidence_blocks_approval"
  | "website_missing_rollback_blocks_approval"
  | "recipient_missing_preview_blocks_approval"
  | "budget_missing_amount_blocks_approval";

export type ScenarioDef = {
  id: ScenarioId;
  name: string;
};

export const M11_SCENARIOS: ScenarioDef[] = [
  { id: "meta_measurement", name: "1. Meta measurement recommendation" },
  { id: "email_integration", name: "2. Email integration recommendation" },
  { id: "website_conversion", name: "3. Website conversion recommendation" },
  { id: "bundle", name: "4. Bundle recommendation" },
  { id: "insufficient_evidence", name: "5. Insufficient-evidence recommendation" },
  { id: "rejected_suppression", name: "6. Rejected recommendation suppression" },
  { id: "snoozed", name: "7. Snoozed recommendation" },
  { id: "stale_revalidation", name: "8. Stale recommendation requiring revalidation" },
  { id: "draft_prepared_and_edited", name: "9. Draft prepared and edited" },
  { id: "internal_l4_approval", name: "10. Internal L4 approval with zero external execution" },
  { id: "synthetic_success", name: "11. Synthetic successful outcome" },
  { id: "synthetic_failure", name: "12. Synthetic unsuccessful outcome" },
  { id: "synthetic_inconclusive", name: "13. Synthetic inconclusive outcome" },
  { id: "deduplication", name: "14. Duplicate recommendation deduplication" },
  { id: "invalid_transition", name: "15. Invalid transition rejection" },
  { id: "agent_self_approval", name: "16. Agent self-approval rejection" },
  { id: "missing_measurement_plan", name: "17. Missing measurement-plan rejection" },
  { id: "idempotent_approval_replay", name: "18. Idempotent approval replay" },
  { id: "expired_evidence_blocks_approval", name: "19. Expired evidence approval rejection" },
  { id: "website_missing_rollback_blocks_approval", name: "20. Website action without rollback-plan rejection" },
  { id: "recipient_missing_preview_blocks_approval", name: "21. Recipient action without recipient-preview rejection" },
  { id: "budget_missing_amount_blocks_approval", name: "22. Budget action without explicit budget rejection" }
];
