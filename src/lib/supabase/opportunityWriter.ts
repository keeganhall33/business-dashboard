import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOpportunityNaturalKey } from "@/lib/utils/opportunities";
import type { AgentKey, OpportunityStatus, OpportunityType } from "@/lib/types/requests";

export type OpportunityInput = {
  name: string;
  organization?: string;
  opportunityType: OpportunityType | string;
  status: OpportunityStatus | string;
  valueEstimate?: number;
  prestigeScore?: number;
  probabilityScore?: number;
  ownerAgent: AgentKey | string;
  nextStep?: string;
  nextStepDueAt?: string;
  notesMd?: string;
  source?: string;
};

export async function upsertOpportunity(client: SupabaseClient, input: OpportunityInput) {
  const naturalKey = buildOpportunityNaturalKey(input.name, input.organization ?? "");
  const payload = {
    natural_key: naturalKey,
    name: input.name,
    organization: input.organization ?? null,
    opportunity_type: input.opportunityType,
    status: input.status,
    value_estimate: input.valueEstimate ?? null,
    prestige_score: input.prestigeScore ?? null,
    probability_score: input.probabilityScore ?? null,
    owner_agent: input.ownerAgent,
    next_step: input.nextStep ?? null,
    next_step_due_at: input.nextStepDueAt ?? null,
    notes_md: input.notesMd ?? null,
    source: input.source ?? null
  };

  const { data, error } = await client
    .from("opportunity_pipeline")
    .upsert(payload, { onConflict: "natural_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
