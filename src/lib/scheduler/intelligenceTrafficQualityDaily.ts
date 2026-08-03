import { withJobRun } from "@/lib/scheduler/jobLogger";
import { formatPacificIsoDate, addDaysIso } from "@/lib/date/pacific";
import { runTrafficQualityMismatch } from "@/lib/intelligence-v1/traffic-quality-mismatch";
import { insertFinding, insertHypotheses } from "@/lib/intelligence-v1/store";

export async function runIntelligenceTrafficQualityDaily() {
  const jobKey = "intelligence-traffic-quality";
  const startedAt = new Date().toISOString();

  return withJobRun({
    jobKey,
    fn: async () => {
      const pacificToday = formatPacificIsoDate(new Date());
      const endDate = addDaysIso(pacificToday, -1);
      const startDate = addDaysIso(endDate, -6);
      const prevEnd = addDaysIso(startDate, -1);
      const prevStart = addDaysIso(prevEnd, -6);

    const result = await runTrafficQualityMismatch({
      current: { startDate, endDate },
      comparison: { startDate: prevStart, endDate: prevEnd }
    });

    if (!result.finding || !result.opportunity || !result.recommendation) {
      return { ok: true, startedAt, note: "No material traffic-quality mismatch detected", generatedAt: result.generatedAt };
    }

    await insertFinding(result.finding);
    await insertHypotheses(result.hypotheses);

    // Persist the remainder of the chain as an auditable payload in the job run log.
    // (Recommendation/opportunity reuse existing contracts; no parallel tables yet.)
      return {
        ok: true,
        startedAt,
        findingId: result.finding.finding_id,
        recommendationId: result.recommendation.id,
        payload: {
          finding: result.finding,
          hypotheses: result.hypotheses,
          opportunity: result.opportunity,
          recommendation: result.recommendation,
          warnings: result.warnings
        }
      };
    },
    summarize: (result) => {
      const r = result as unknown as { note?: unknown; findingId?: unknown; payload?: Record<string, unknown> };
      return {
        summary: r.note ? String(r.note) : (r.findingId ? `finding ${String(r.findingId)}` : "no finding"),
        detailsJson: r.payload ?? {}
      };
    }
  });
}
