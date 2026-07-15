import type {
  Opportunity,
  OpportunityVerificationStatus,
  PipelineVerificationSummary
} from "@/lib/types/dashboard";

export type OpportunityRecord = {
  verification_status?: OpportunityVerificationStatus;
  verification_source?: string | null;
  verification_notes?: string | null;
  last_verified_at?: string | null;
  last_verified_by?: string | null;
  value_basis?: string | null;
  confidence?: number | null;
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: string;
  status: string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: string;
  next_step: string | null;
  next_step_due_at: string | null;
};

const VALID_STATUSES: ReadonlySet<OpportunityVerificationStatus> = new Set([
  "unverified",
  "verified_active",
  "verified_on_hold",
  "verified_complete",
  "verified_declined",
  "invalid",
  "stale"
]);

export function normalizeVerificationStatus(row: OpportunityRecord): OpportunityVerificationStatus {
  const status = (row.verification_status ?? "unverified") as OpportunityVerificationStatus;
  return VALID_STATUSES.has(status) ? status : "unverified";
}

export function summarizeOpportunityVerification(rows: OpportunityRecord[]): PipelineVerificationSummary {
  const summary: PipelineVerificationSummary = {
    total: rows.length,
    verifiedActive: 0,
    onHold: 0,
    complete: 0,
    declined: 0,
    invalid: 0,
    stale: 0,
    unverified: 0
  };

  rows.forEach((row) => {
    const status = normalizeVerificationStatus(row);
    switch (status) {
      case "verified_active":
        summary.verifiedActive += 1;
        break;
      case "verified_on_hold":
        summary.onHold += 1;
        break;
      case "verified_complete":
        summary.complete += 1;
        break;
      case "verified_declined":
        summary.declined += 1;
        break;
      case "invalid":
        summary.invalid += 1;
        break;
      case "stale":
        summary.stale += 1;
        break;
      default:
        summary.unverified += 1;
        break;
    }
  });

  return summary;
}

export function mapOpportunityRowForResponse(
  opportunity: OpportunityRecord,
  supportingDocs: Array<{ label: string; url: string }> | null
): Opportunity {
  return {
    id: opportunity.id,
    name: opportunity.name,
    organization: opportunity.organization,
    opportunityType: opportunity.opportunity_type,
    status: opportunity.status,
    valueEstimate: opportunity.value_estimate,
    prestigeScore: opportunity.prestige_score,
    probabilityScore: opportunity.probability_score,
    ownerAgent: opportunity.owner_agent,
    nextStep: opportunity.next_step,
    nextStepDueAt: opportunity.next_step_due_at,
    verificationStatus: normalizeVerificationStatus(opportunity),
    verificationSource: opportunity.verification_source ?? null,
    verificationNotes: opportunity.verification_notes ?? null,
    lastVerifiedAt: opportunity.last_verified_at ?? null,
    lastVerifiedBy: opportunity.last_verified_by ?? null,
    valueBasis: opportunity.value_basis ?? null,
    confidence: opportunity.confidence ?? null,
    supportingDocs
  };
}
