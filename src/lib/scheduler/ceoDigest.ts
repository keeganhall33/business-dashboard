import {
  getTaskCountsByStatus,
  getTasksAwaitingApproval,
  getUnresolvedAlerts,
  upsertSystemState
} from "@/lib/supabase/queries";

function nowIso() {
  return new Date().toISOString();
}

export type CeoDigestResult = {
  pendingApprovals: number;
  unresolvedAlerts: number;
  taskCountsByStatus: Record<string, number>;
  digestMd: string;
};

type AlertSummary = {
  severity: string;
  title: string;
  summary: string | null;
};

/**
 * CEO digest: a small, durable summary the dashboard (and Keegan) can read quickly.
 * Stores to `system_state.ceo_digest_latest` for UI consumption.
 */
export async function runCeoDigest(): Promise<CeoDigestResult> {
  const [awaitingApproval, alerts, counts] = await Promise.all([
    getTasksAwaitingApproval(50),
    getUnresolvedAlerts(25),
    getTaskCountsByStatus()
  ]);

  const pendingApprovals = awaitingApproval.length;
  const unresolvedAlerts = alerts.length;

  const topAlerts = alerts
    .slice(0, 10)
    .map((a) => {
      const alert = a as AlertSummary;
      return `- [${alert.severity}] ${alert.title} — ${alert.summary ?? ""}`;
    })
    .join("\n");

  const digestMd = [
    `# CEO Digest`,
    `Generated: ${nowIso()}`,
    "",
    `## Snapshot`,
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
    digestMd,
    updatedAt: nowIso()
  });

  return {
    pendingApprovals,
    unresolvedAlerts,
    taskCountsByStatus: counts,
    digestMd
  };
}
