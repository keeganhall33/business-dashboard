import { runNoah } from "@/lib/agents/noah";
import {
  createSystemRun,
  finishSystemRun,
  findOpenTaskByTitle,
  getRecentOpportunities,
  getLatestOpportunitiesByStatus,
  createTask
} from "@/lib/supabase/queries";
import { withJobRun } from "./jobLogger";
import { writeDashboardSnapshotMeta } from "./stateWriters";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / DAY_MS;
}

export async function runMidweekOpportunityPulse() {
  return withJobRun({
    jobKey: "midweek-opportunity-pulse",
    fn: async () => {
      const [opps, ready] = await Promise.all([
        getRecentOpportunities(200),
        getLatestOpportunitiesByStatus("ready_for_outreach", 200)
      ]);

      type OpportunityRow = {
        status: string;
        updated_at?: string | null;
        name: string;
        next_step?: string | null;
      };

      const active = (opps as OpportunityRow[]).filter((o) => !["won", "lost", "parked"].includes(o.status));
      const stalled = active.filter((o) => daysSince(o.updated_at) > 10);

      let newTasksCreated = 0;
      for (const opp of stalled.slice(0, 10)) {
        const title = `Follow up stalled opportunity: ${opp.name}`;
        const existing = await findOpenTaskByTitle("noah", title);
        if (existing) continue;

        await createTask({
          title,
          description: `Opportunity appears stalled (>10 days). Next step: ${opp.next_step ?? "define next step"}.`,
          agentKey: "noah",
          priority: "high",
          expectedImpact: "Restart conversation momentum or decide to park",
          impactScore: 7.8,
          whyThisMatters: "Stalled opportunities rot pipeline health.",
          relatedMetricKeys: ["active_brand_conversations"],
          requiresApproval: true,
          executionType: "outreach_prep",
          createdBy: "system"
        });

        newTasksCreated++;
      }

      const run = await createSystemRun({ agentKey: "noah", runType: "scheduler" });
      const result = await runNoah();
      await finishSystemRun(run.id, { status: "completed", outputsJson: result });

      await writeDashboardSnapshotMeta({
        source: "midweek-opportunity-pulse",
        lastRefreshedAt: new Date().toISOString()
      });

      const pipelineCount = active.length;
      const escalatedToAvery = pipelineCount < 5 || ready.length === 0;

      return {
        pipelineCount,
        stalledOpportunities: stalled.length,
        newTasksCreated,
        newOpportunitiesCreated: result.opportunitiesCreated,
        escalatedToAvery
      };
    },
    summarize: (result) => ({
      summary: `Pipeline ${result.pipelineCount}, stalled ${result.stalledOpportunities}, tasks ${result.newTasksCreated}`,
      detailsJson: result
    })
  });
}
