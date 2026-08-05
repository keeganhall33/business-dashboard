import "@/lib/server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

export function getExternalIntelligenceSupabaseClient(input?: { client?: SupabaseServerClient }): SupabaseServerClient {
  return input?.client ?? getSupabaseServerClient();
}
