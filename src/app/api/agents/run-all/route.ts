import { ok, serverError } from "@/lib/api/responses";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import { AGENT_EXECUTION_SEQUENCE } from "@/lib/agents/operating-model";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";
import type { AgentRunResult } from "@/lib/agents/shared";
import type { AgentKey } from "@/lib/types/requests";

const sequence = AGENT_EXECUTION_SEQUENCE;

const runners: Record<AgentKey, () => Promise<AgentRunResult>> = {
  avery: runAvery,
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah
};

export async function POST() {
  const outputs: Array<{
    agentKey: AgentKey;
    runId: string;
    ok: boolean;
    result?: AgentRunResult;
    error?: string;
  }> = [];

  try {
    for (const agentKey of sequence) {
      const run = await createSystemRun({ agentKey, runType: "manual" });
      try {
        const result = await runners[agentKey]();
        await finishSystemRun(run.id, { status: "completed", outputsJson: result });
        outputs.push({ agentKey, runId: run.id, ok: true, result });
      } catch (error) {
        await finishSystemRun(run.id, {
          status: "failed",
          errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
        });
        outputs.push({
          agentKey,
          runId: run.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    }

    return ok({ ok: true, sequence, outputs });
  } catch (error) {
    return serverError("Failed to run agents", {
      message: error instanceof Error ? error.message : String(error),
      outputs
    });
  }
}
