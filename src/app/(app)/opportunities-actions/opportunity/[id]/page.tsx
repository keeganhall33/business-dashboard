import { notFound } from "next/navigation";

import { ExecutiveOpportunityDetailV1 } from "@/components/opportunity-intelligence/ExecutiveOpportunityDetailV1";
import type { EditableOpportunityV1 } from "@/components/opportunity-intelligence/OpportunityEditorV1";
import type { ExecutiveCommandCenterOpportunityV1 } from "@/lib/executive-home/fixtures";
import { getOpportunityById } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function ExecutiveOpportunityDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  let row: Record<string, unknown>;
  try {
    row = await getOpportunityById(id.trim()) as Record<string, unknown>;
  } catch {
    notFound();
  }

  const name = text(row.name) ?? "Untitled opportunity";
  const valueEstimate = number(row.value_estimate);
  const prestigeScore = number(row.prestige_score);
  const nextStep = text(row.next_step);
  const editable: EditableOpportunityV1 = {
    id: String(row.id),
    name,
    organization: text(row.organization),
    status: text(row.status) ?? "active",
    contactName: text(row.contact_name),
    contactRole: text(row.contact_role),
    nextStep,
    nextStepDueAt: text(row.next_step_due_at),
    valueEstimate,
    notes: text(row.notes_md)
  };
  const opportunity: ExecutiveCommandCenterOpportunityV1 = {
    id: editable.id,
    title: name,
    upside: valueEstimate == null ? "UNKNOWN" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(valueEstimate),
    fit: prestigeScore == null ? "UNKNOWN" : `${prestigeScore} / 100`,
    timing: editable.nextStepDueAt?.slice(0, 10) ?? "UNKNOWN",
    effort: nextStep ? "Next move recorded" : "UNKNOWN",
    evidence: "KNOWN",
    next_move: nextStep ?? "Add the next move for this opportunity.",
    detail_href: `/opportunities-actions/opportunity/${encodeURIComponent(editable.id)}`
  };

  return <ExecutiveOpportunityDetailV1 opportunity={opportunity} generatedAt={text(row.updated_at)} editableOpportunity={editable} />;
}
