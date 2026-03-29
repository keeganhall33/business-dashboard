import { ok, serverError } from "@/lib/api/responses";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";
import type { AgentRunResult } from "@/lib/agents/shared";

const sequence = ["sloan", "lyra", "noah", "avery"] as const;

const runners: Record<(typeof sequence)[number], () => Promise<AgentRunResult>> = {
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah,
  avery: runAvery
};

export async function POST() {
  const outputs: Array<{
    agentKey: (typeof sequence)[number];
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
