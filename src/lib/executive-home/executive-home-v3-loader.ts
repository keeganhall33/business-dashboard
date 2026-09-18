import "@/lib/server-only";

import { listActions } from "@/lib/actions/action-store";
import type { DurableAction } from "@/lib/actions/action-contract";
import { getLatestAgentFusionContext, type AgentFusionContext } from "@/lib/agents/fusion-context";
import { enforceExecutiveApprovalTruthV1 } from "@/lib/executive-home/approval-truth-guard-v1";
import {
  buildExecutiveHomeFromCanonicalSystemsV3,
  buildExecutiveHomeFromDashboardOverviewV1,
  type ExecutiveHomeCanonicalInputsV3
} from "@/lib/executive-home/live-adapter";
import type { CanonicalRelationshipFollowUpQueueResultV1 } from "@/lib/relationships-crm/canonical-follow-up-queue-v1";
import { loadProductionFollowUpQueueV1 } from "@/lib/relationships-crm/production-follow-up-queue-loader-v1";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

export type ExecutiveHomeV3ReadDependencies = {
  loadFusion: () => Promise<AgentFusionContext | null>;
  loadActions: () => Promise<DurableAction[]>;
  loadFollowUps: (input: { now: string }) => Promise<CanonicalRelationshipFollowUpQueueResultV1 | null>;
};

type ExecutiveHomeV3BaseBuilder = typeof buildExecutiveHomeFromDashboardOverviewV1;

const defaultDependencies: ExecutiveHomeV3ReadDependencies = {
  loadFusion: getLatestAgentFusionContext,
  loadActions: listActions,
  loadFollowUps: ({ now }) => loadProductionFollowUpQueueV1({ now })
};

function validNow(value: string | Date | undefined, fallback: string): string {
  const date = value == null ? new Date(fallback) : value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Executive Home V3 now must be a valid timestamp");
  return date.toISOString();
}

/**
 * Reads canonical systems in parallel and fails closed per subsystem. This loader
 * has no write dependency and does not persist, approve, execute, or contact anyone.
 */
export async function loadExecutiveHomeV3(input: {
  overview: DashboardOverviewResponse;
  now?: string | Date;
  dependencies?: Partial<ExecutiveHomeV3ReadDependencies>;
  baseBuilder?: ExecutiveHomeV3BaseBuilder;
}): Promise<ReturnType<ExecutiveHomeV3BaseBuilder>> {
  const now = validNow(input.now, input.overview.timestamp);
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const [fusionResult, actionsResult, followUpsResult] = await Promise.allSettled([
    dependencies.loadFusion(),
    dependencies.loadActions(),
    dependencies.loadFollowUps({ now })
  ]);

  const canonical: ExecutiveHomeCanonicalInputsV3 = {
    now,
    fusion: fusionResult.status === "fulfilled" ? fusionResult.value : null,
    actions: actionsResult.status === "fulfilled" ? actionsResult.value : [],
    followUps: followUpsResult.status === "fulfilled" ? followUpsResult.value : null,
    availability: {
      fusion: fusionResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
      actions: actionsResult.status === "fulfilled" ? "AVAILABLE" : "UNAVAILABLE",
      followUps: followUpsResult.status === "fulfilled" && followUpsResult.value != null
        ? "AVAILABLE"
        : "UNAVAILABLE"
    }
  };

  const projection = buildExecutiveHomeFromCanonicalSystemsV3(
    input.overview,
    canonical,
    input.baseBuilder ?? buildExecutiveHomeFromDashboardOverviewV1
  );

  return enforceExecutiveApprovalTruthV1(projection, input.overview);
}
