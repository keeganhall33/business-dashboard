import { ok, serverError } from "@/lib/api/responses";
import { evaluateRules } from "@/lib/automation/evaluateRules";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import { createSystemRun, finishSystemRun, getLatestAgentDirective } from "@/lib/supabase/queries";
import type { AgentRunResult } from "@/lib/agents/shared";

const sequence = ["sloan", "lyra", "noah", "avery"] as const;
const runners: Record<(typeof sequence)[number], () => Promise<AgentRunResult>> = {
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah,
  avery: runAvery
};

export async function POST() {
  const weeklyRun = await createSystemRun({ agentKey: "avery", runType: "weekly" });

  try {
    const rules = await evaluateRules();

    const outputs: Array<{ agentKey: string; updatesCreated: number; tasksCreated: number; opportunitiesCreated: number }> = [];

    for (const agentKey of sequence) {
      const run = await createSystemRun({ agentKey, runType: "weekly" });
      try {
        const result = await runners[agentKey]();
        await finishSystemRun(run.id, { status: "completed", outputsJson: result });
        outputs.push({
          agentKey,
          updatesCreated: result.updatesCreated,
          tasksCreated: result.tasksCreated,
          opportunitiesCreated: result.opportunitiesCreated
        });
      } catch (error) {
        await finishSystemRun(run.id, {
          status: "failed",
          errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
        });
        throw error;
      }
    }

    const directive = await getLatestAgentDirective();

    const payload = {
      rulesEvaluated: rules.rulesEvaluated,
      triggersFired: rules.triggersFired,
      sequence,
      outputs,
      weeklyDirective: directive?.summary ?? null
    };

    await finishSystemRun(weeklyRun.id, { status: "completed", outputsJson: payload });

    return ok({ ok: true, ...payload });
  } catch (error) {
    await finishSystemRun(weeklyRun.id, {
      status: "failed",
      errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });

    return serverError("Weekly cycle failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
