"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const opportunitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(240),
  organization: z.string().trim().max(240).optional(),
  status: z.string().trim().min(1).max(80),
  contactName: z.string().trim().max(240).optional(),
  contactRole: z.string().trim().max(240).optional(),
  nextStep: z.string().trim().max(2_000).optional(),
  nextStepDueAt: z.string().trim().max(40).optional(),
  valueEstimate: z.union([z.number().nonnegative(), z.null()]),
  notes: z.string().trim().max(20_000).optional()
});

export type OpportunityMutationInputV1 = z.input<typeof opportunitySchema>;
export type OpportunityMutationResultV1 = { ok: true } | { ok: false; message: string };

const nullable = (value: string | undefined) => value?.trim() || null;

export async function saveOpportunityActionV1(input: OpportunityMutationInputV1): Promise<OpportunityMutationResultV1> {
  const parsed = opportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the opportunity and try again." };
  try {
    const { error } = await getSupabaseServerClient().from("opportunity_pipeline").update({
      name: parsed.data.name,
      organization: nullable(parsed.data.organization),
      status: parsed.data.status,
      contact_name: nullable(parsed.data.contactName),
      contact_role: nullable(parsed.data.contactRole),
      next_step: nullable(parsed.data.nextStep),
      next_step_due_at: nullable(parsed.data.nextStepDueAt),
      value_estimate: parsed.data.valueEstimate,
      notes_md: nullable(parsed.data.notes),
      source: "DASHBOARD_MANUAL",
      updated_at: new Date().toISOString()
    }).eq("id", parsed.data.id);
    if (error) throw error;
    revalidatePath("/opportunities-actions");
    revalidatePath(`/opportunities-actions/opportunity/${parsed.data.id}`);
    revalidatePath("/relationships");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The opportunity could not be saved." };
  }
}

export async function archiveOpportunityActionV1(id: string): Promise<OpportunityMutationResultV1> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid opportunity." };
  try {
    const { error } = await getSupabaseServerClient().from("opportunity_pipeline").update({ status: "parked", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    revalidatePath("/opportunities-actions");
    revalidatePath("/relationships");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The opportunity could not be removed." };
  }
}
