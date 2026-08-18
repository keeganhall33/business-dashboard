import {
  getTaskCountsByStatus,
  getTasksAwaitingApproval,
  getUnresolvedAlerts,
  upsertSystemState
} from "@/lib/supabase/queries";
import { getAgentDecisionContext } from "@/lib/agents/decision-context";
import { withJobRun } from "./jobLogger";

function nowIso() {
  return new Date().toISOString();
}

export type CeoDigestResult = {
  pendingApprovals: number;
  unresolvedAlerts: number;
  taskCountsByStatus: Record<string, number>;
  careerPhase: string;
  phaseCompletionPercent: number;
  primaryBottleneck: string;
  awaitingResults: number;
  digestMd: string;
};

type AlertSummary = {
  severity: string;
  title: string;
  summary: string | null;
};

/**
 * CEO digest: strategic orientation first, operational queue second.
 * Stores to `system_state.ceo_digest_latest` for UI consumption.
 */
export async function runCeoDigest(): Promise<CeoDigestResult> {
  return withJobRun({
    jobKey: "ceo-digest",
    fn: async () => {
      const [awaitingApproval, alerts, counts, decisionContext] = await Promise.all([
        getTasksAwaitingApproval(50),
        getUnresolvedAlerts(25),
        getTaskCountsByStatus(),
        getAgentDecisionContext("avery")
      ]);

      const pendingApprovals = awaitingApproval.length;
      const unresolvedAlerts = alerts.length;
      const { careerOs, fusionSummary } = decisionContext;
      const topMoves = careerOs.todayMoves.slice(0, 5);

      const topAlerts = alerts
        .slice(0, 10)
        .map((a) => {
          const alert = a as AlertSummary;
          return `- [${alert.severity}] ${alert.title} — ${alert.summary ?? ""}`;
        })
        .join("\n");

      const moveLines = topMoves.length
        ? topMoves.map((move) => `- **${move.lane}**: ${move.title} — ${move.description}`).join("\n")
        : "- No ready Career OS moves. Review blocked/waiting gates before adding work.";

      const digestMd = [
        `# CEO Digest`,
        `Generated: ${nowIso()}`,
        "",
        `## Strategic Position`,
        `- Career OS: **Phase ${careerOs.currentPhase.number} — ${careerOs.currentPhase.title}**`,
        `- Phase completion: **${careerOs.phaseCompletionPercent}%**`,
        `- Binding bottleneck: **${careerOs.primaryBottleneck}**`,
        `- Awaiting real-world results: **${careerOs.awaitingResults.length}**`,
        `- Fusion: ${fusionSummary}`,
        "",
        `## Today's Highest-Leverage Moves`,
        moveLines,
        "",
        `## Operator Queue`,
        `- Pending approvals: **${pendingApprovals}**`,
        `- Unresolved alerts: **${unresolvedAlerts}**`,
        "",
        `## Task Status Counts`,
        "```json\n" + JSON.stringify(counts, null, 2) + "\n```",
        "",
        `## Top Alerts`,
        topAlerts.length ? topAlerts : "- (none)",
        ""
      ].join("\n");

      await upsertSystemState("ceo_digest_latest", {
        pendingApprovals,
        unresolvedAlerts,
        taskCountsByStatus: counts,
        careerPhase: {
          number: careerOs.currentPhase.number,
          id: careerOs.currentPhase.id,
          title: careerOs.currentPhase.title,
          completionPercent: careerOs.phaseCompletionPercent,
          primaryBottleneck: careerOs.primaryBottleneck,
          awaitingResults: careerOs.awaitingResults.length
        },
        todayMoves: topMoves.map((move) => ({ id: move.id, lane: move.lane, title: move.title, status: move.status })),
        fusion: decisionContext.fusionDecision,
        digestMd,
        updatedAt: nowIso()
      });

      return {
        pendingApprovals,
        unresolvedAlerts,
        taskCountsByStatus: counts,
        careerPhase: `${careerOs.currentPhase.number} ${careerOs.currentPhase.title}`,
        phaseCompletionPercent: careerOs.phaseCompletionPercent,
        primaryBottleneck: careerOs.primaryBottleneck,
        awaitingResults: careerOs.awaitingResults.length,
        digestMd
      };
    },
    summarize: (result) => ({
      summary: `Phase ${result.careerPhase} · ${result.phaseCompletionPercent}% · ${result.pendingApprovals} approvals · ${result.unresolvedAlerts} alerts`,
      detailsJson: result
    })
  });
}
