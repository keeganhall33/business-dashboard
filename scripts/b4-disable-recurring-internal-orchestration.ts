import "@/lib/server-only";

import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import {
  B4_CONFIGURATION_VERSION,
  B4_EXPECTED_PROJECT_REF,
  computeB4ConfigurationHash,
  DEFAULT_B4_CONFIG,
  requireB4ApprovalFlags,
  requireExpectedProjectRef
} from "./b4-activate-recurring-internal-orchestration";

export type B4DisableDeps = {
  nowIso: () => string;
  supabase: ReturnType<typeof getExternalIntelligenceSupabaseClient>;
};

export async function disableB4RecurringInternalOrchestration(deps: B4DisableDeps) {
  requireB4ApprovalFlags();
  requireExpectedProjectRef();

  const disableId = process.env.B4_DISABLE_ID;
  if (!disableId) throw new Error("precondition_failed:missing_disable_id");
  const requestedBy = process.env.B4_REQUESTED_BY ?? "unknown";

  const configurationHash = computeB4ConfigurationHash(DEFAULT_B4_CONFIG);

  const { data, error } = await deps.supabase.rpc("disable_external_intelligence_internal_orchestration_v1", {
    in_disable_id: disableId,
    in_configuration_version: B4_CONFIGURATION_VERSION,
    in_configuration_hash: configurationHash,
    in_environment: "production",
    in_requested_by: requestedBy,
    in_requested_at: deps.nowIso(),
    in_review_by: "owner",
    in_governing_policy_reference: "external-intelligence.phase-b4.v1",
    in_expected_project_ref: B4_EXPECTED_PROJECT_REF
  });
  if (error) throw new Error(`B4 disable RPC failed: ${error.message}`);
  return { ok: true, result: data } as const;
}

async function main() {
  const supabase = getExternalIntelligenceSupabaseClient({});
  const deps: B4DisableDeps = { nowIso: () => new Date().toISOString(), supabase };
  const mode = (process.env.B4_ACTION ?? "disable") as "inspect" | "disable";
  if (mode === "inspect") {
    // Importing inspect from activation script keeps inspection non-mutating.
    const { inspectB4RecurringInternalOrchestration } = await import("./b4-activate-recurring-internal-orchestration");
    const res = await inspectB4RecurringInternalOrchestration(deps);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const res = await disableB4RecurringInternalOrchestration(deps);
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1]?.includes("b4-disable-recurring-internal-orchestration")) {
  main().catch((e) => {
    console.error("B4 disable failed", { message: e?.message ?? String(e) });
    process.exitCode = 1;
  });
}
