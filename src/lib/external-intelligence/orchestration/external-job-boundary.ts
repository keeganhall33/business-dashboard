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

type BoundaryDeps = {
  persistBlocked: typeof persistExternalJobBlockedV1;
  alert: typeof createDedupedHighSeverityAlert;
};

async function guardAndDispatchWithDeps(input: ExternalCollectionJobInput, deps: BoundaryDeps): Promise<ExternalJobBoundaryBlockedResult> {
  const guard = guardExternalCollectorExecutionV1(input);

  const block = async (codes: string[], summary: string) => {
    await deps.persistBlocked({ job_id: input.job_id, blocker_codes: codes, safe_error_summary: summary });
    await deps.alert({
      dedupeKey: `external_collection_blocked:${input.source_id}`,
      title: "Unexpected external collection attempt blocked",
      summary
    });
    return { status: "blocked" as const, job_id: input.job_id, blocker_codes: codes, safe_summary: summary };
  };

  if (!guard.ok) return block(guard.blocker_codes, guard.safe_summary);

  // Even if every guard passed, B3 categorically disallows external collection.
  return block(["external_collection_not_activated"], "external_collection_not_activated");
}

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
  return guardAndDispatchWithDeps(input, {
    persistBlocked: persistExternalJobBlockedV1,
    alert: createDedupedHighSeverityAlert
  });
}

export const __testOnly = {
  guardAndDispatchWithDeps
};
