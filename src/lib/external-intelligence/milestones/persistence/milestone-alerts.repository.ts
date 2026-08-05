import "@/lib/server-only";

import type { MilestoneHorizonAlert } from "@/lib/external-intelligence/milestones/horizon-engine";
import type { AlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

export type SportsMilestoneAlertUpsertRow = {
  alert_id: string;
  milestone_id: string;
  milestone_content_hash: string;

  horizon_days: number;
  policy_version: string;
  suppression_policy_version: string;

  suppression_identity: string;
  alert_hash: string;

  project_class: string;
  planning_stage: string;

  milestone_date: string;
  days_remaining_at_creation: number;

  // Inserted only as pending in the RPC.
  status: "pending";

  reason_codes: string[];
  expires_at: string | null;
};

function addDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString();
}

export class SportsMilestoneAlertsRepository {
  async upsertFromHorizonAlerts(input: {
    alerts: MilestoneHorizonAlert[];
    lead_time_policy: AlertLeadTimePolicy;
    now_ymd: string;
  }): Promise<{ inserted_count: number; existing_count: number; skipped_count: number }> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const policy = parseAlertLeadTimePolicy(input.lead_time_policy);

    const rows: SportsMilestoneAlertUpsertRow[] = input.alerts.map((a) => {
      const alert_id = a.alert_hash;
      const expires_at = addDays(a.milestone_date, 1); // deterministic: expire one day after event.

      return {
        alert_id,
        milestone_id: a.milestone_id,
        milestone_content_hash: a.milestone_content_hash,
        horizon_days: a.horizon_days,
        policy_version: policy.policy_version,
        suppression_policy_version: policy.suppression_policy.policy_version,
        suppression_identity: a.suppression_identity,
        alert_hash: a.alert_hash,
        project_class: a.project_class,
        planning_stage: a.planning_stage,
        milestone_date: a.milestone_date,
        days_remaining_at_creation: a.days_remaining,
        status: "pending",
        reason_codes: ["lead_time"],
        expires_at
      };
    });

    const res = await runRpc<
      Array<{
        inserted_count: number;
        existing_count: number;
        skipped_count: number;
        alert_ids: string[];
        suppression_identities: string[];
      }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.upsertSportsMilestoneAlerts,
      args: { in_alerts: rows }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    return { inserted_count: row.inserted_count, existing_count: row.existing_count, skipped_count: row.skipped_count };
  }

  async invalidateObsoletePending(): Promise<number> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const res = await runRpc<number>({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.invalidateObsoleteSportsMilestoneAlerts,
      args: {}
    });
    return res;
  }

  async expirePending(input: { now_iso: string }): Promise<number> {
    const supabase = getExternalIntelligenceSupabaseClient({});
    const res = await runRpc<number>({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.expireSportsMilestoneAlerts,
      args: { in_now: input.now_iso }
    });
    return res;
  }
}
