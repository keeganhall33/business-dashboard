import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";

export async function persistExternalJobBlockedV1(input: {
  job_id: string;
  blocker_codes: string[];
  safe_error_summary: string;
}) {
  const supabase = getExternalIntelligenceSupabaseClient({});

  const { error } = await supabase
    .from("external_collection_jobs_v1")
    .update({
      status: "blocked",
      reason_codes: input.blocker_codes,
      error_code: "external_collection_not_activated",
      error_summary: input.safe_error_summary,
      updated_at: new Date().toISOString()
    })
    .eq("job_id", input.job_id);

  if (error) throw new Error(`Failed to persist blocked job: ${error.message}`);
}
