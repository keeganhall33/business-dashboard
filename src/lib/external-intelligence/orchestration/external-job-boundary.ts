import "@/lib/server-only";

import { createSystemAlert, getOpenAlertByDedupeKey } from "@/lib/supabase/queries";
import type { ExternalCollectionJobInput } from "@/lib/external-intelligence/orchestration/external-collector-guard";
import { guardExternalCollectorExecutionV1 } from "@/lib/external-intelligence/orchestration/external-collector-guard";
import { persistExternalJobBlockedV1 } from "@/lib/external-intelligence/orchestration/external-job-blocking";

export type ExternalJobBoundaryBlockedResult = {
  status: "blocked";
  job_id: string;
  blocker_codes: string[];
  safe_summary: string;
};

async function createDedupedHighSeverityAlert(input: { dedupeKey: string; title: string; summary: string }) {
  const existing = await getOpenAlertByDedupeKey(input.dedupeKey);
  if (existing) return { created: false };
  await createSystemAlert({
    alertType: "orchestration_failure",
    severity: "high",
    title: input.title,
    summary: input.summary,
    dedupeKey: input.dedupeKey
  });
  return { created: true };
}

/**
 * B3 boundary function: validates and blocks unexpected external collection jobs.
 *
 * This function MUST NOT execute any collector callback in B3.
 */
export async function guardAndDispatchExternalCollectionJobV1(input: ExternalCollectionJobInput): Promise<ExternalJobBoundaryBlockedResult> {
  const guard = guardExternalCollectorExecutionV1(input);

  if (!guard.ok) {
    await persistExternalJobBlockedV1({
      job_id: input.job_id,
      blocker_codes: guard.blocker_codes,
      safe_error_summary: guard.safe_summary
    });

    await createDedupedHighSeverityAlert({
      dedupeKey: `external_collection_blocked:${input.source_id}`,
      title: "Unexpected external collection attempt blocked",
      summary: guard.safe_summary
    });

    return {
      status: "blocked",
      job_id: input.job_id,
      blocker_codes: guard.blocker_codes,
      safe_summary: guard.safe_summary
    };
  }

  // Even if every guard passed, B3 categorically disallows external collection.
  await persistExternalJobBlockedV1({
    job_id: input.job_id,
    blocker_codes: ["external_collection_not_activated"],
    safe_error_summary: "external_collection_not_activated"
  });

  await createDedupedHighSeverityAlert({
    dedupeKey: `external_collection_blocked:${input.source_id}`,
    title: "Unexpected external collection attempt blocked",
    summary: "external_collection_not_activated"
  });

  return {
    status: "blocked",
    job_id: input.job_id,
    blocker_codes: ["external_collection_not_activated"],
    safe_summary: "external_collection_not_activated"
  };
}
