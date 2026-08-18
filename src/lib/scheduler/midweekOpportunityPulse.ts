import { runNoah } from "@/lib/agents/noah";
import {
  createAgentUpdate,
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

function isFollowUpDue(nextStepDueAt?: string | null) {
  if (!nextStepDueAt) return true;
  const due = new Date(nextStepDueAt).getTime();
  return Number.isFinite(due) && due <= Date.now();
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
        next_step_due_at?: string | null;
      };

      const active = (opps as OpportunityRow[]).filter((o) => !["won", "lost", "parked"].includes(o.status));
      const stalled = active.filter(
        (o) => daysSince(o.updated_at) > 10 && isFollowUpDue(o.next_step_due_at)
      );

      let newTasksCreated = 0;
      for (const opp of stalled.slice(0, 10)) {
        const title = `Review stalled opportunity: ${opp.name}`;
        const existing = await findOpenTaskByTitle("noah", title);
        if (existing) continue;

        await createTask({
          title,
          description: `Opportunity has had no meaningful update for >10 days and its next-step date is due. Current next step: ${opp.next_step ?? "define the correct next step"}. Review relationship context before recommending outreach.`,
          agentKey: "noah",
          priority: "high",
          expectedImpact: "Restart justified momentum, update timing, or deliberately park the opportunity",
          impactScore: 7.8,
          whyThisMatters: "A stale pipeline should be resolved, but intentional waiting should not be mistaken for neglect.",
          relatedMetricKeys: [],
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
      const shouldEscalate = pipelineCount < 5 || ready.length === 0;
      if (shouldEscalate) {
        await createAgentUpdate({
          agentKey: "avery",
          updateType: "insight",
          title: "Opportunity pipeline requires executive review",
          summary: `Midweek pipeline check: ${pipelineCount} active opportunities, ${ready.length} ready for outreach, ${stalled.length} due/stalled. Review whether the issue is pipeline quantity, access-path quality, timing, or the current Career OS phase before demanding more outreach.`,
          detailMd:
            "This is an escalation signal, not an automatic instruction to add names. Noah should qualify access paths and current external evidence; Avery decides whether pipeline expansion is a binding priority.",
          priority: pipelineCount < 5 ? "critical" : "high",
          relatedMetricKeys: []
        });
      }

      return {
        pipelineCount,
        stalledOpportunities: stalled.length,
        newTasksCreated,
        newOpportunitiesCreated: result.opportunitiesCreated,
        escalatedToAvery: shouldEscalate
      };
    },
    summarize: (result) => ({
      summary: `Pipeline ${result.pipelineCount}, due/stalled ${result.stalledOpportunities}, tasks ${result.newTasksCreated}, executive escalation ${result.escalatedToAvery ? "yes" : "no"}`,
      detailsJson: result
    })
  });
}
