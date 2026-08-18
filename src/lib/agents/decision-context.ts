import { buildCareerOperatingSystem, type CareerLane, type CareerOutcomeRow } from "@/lib/career/career-operating-system";
import { getAgentUpdates, getRecentOutcomeMemory, getRecentResearchMemory } from "@/lib/supabase/queries";

type GenericRow = Record<string, unknown>;

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function timestampValue(row: GenericRow) {
  const raw = row.created_at ?? row.happened_at ?? row.updated_at;
  if (typeof raw !== "string") return 0;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAgentDecisionContext(agentKey: string, lanes: CareerLane[]) {
  const [agentUpdates, researchMemory, outcomeMemory, careerOutcomeMemory] = await Promise.all([
    getAgentUpdates(agentKey, 20),
    getRecentResearchMemory({ limit: 40 }),
    getRecentOutcomeMemory({ includeExpired: false, limit: 40 }),
    getRecentOutcomeMemory({ agentKey: "avery", includeExpired: true, limit: 500 })
  ]);

  const latestDirective = agentUpdates.find((row: GenericRow) => row.update_type === "directive") ?? null;
  const careerOs = buildCareerOperatingSystem(careerOutcomeMemory as CareerOutcomeRow[]);
  const laneMoves = careerOs.todayMoves.filter((move) => lanes.includes(move.lane));

  const relevantResearch = [...(researchMemory as GenericRow[])]
    .sort((a, b) => {
      const importanceDelta = asNumber(b.importance_score) - asNumber(a.importance_score);
      return importanceDelta !== 0 ? importanceDelta : timestampValue(b) - timestampValue(a);
    })
    .slice(0, 8);

  const recentMeasuredOutcomes = (outcomeMemory as GenericRow[])
    .filter((row) => {
      const metadata = row.metadata;
      if (!metadata || typeof metadata !== "object") return true;
      return (metadata as Record<string, unknown>).source !== "agent_strategy_cycle";
    })
    .slice(0, 12);

  return {
    latestDirective,
    careerOs,
    laneMoves,
    relevantResearch,
    recentMeasuredOutcomes
  };
}

export function directiveSummary(directive: GenericRow | null) {
  if (!directive) return "No current Avery directive is available; use measured evidence and the current Career OS gate.";
  const summary = directive.summary;
  const title = directive.title;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Avery issued a directive, but its text is unavailable.";
}

export function topResearchSummary(rows: GenericRow[]) {
  const top = rows[0];
  if (!top) return "No recent cross-agent research signal is available.";
  const subject = typeof top.subject === "string" ? top.subject : "Recent research";
  const summary = typeof top.summary === "string" ? top.summary : "No summary available.";
  return `${subject}: ${summary}`;
}
