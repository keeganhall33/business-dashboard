import { ok, serverError } from "@/lib/api/responses";
import { evaluateRules } from "@/lib/automation/evaluateRules";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";

export async function POST() {
  const run = await createSystemRun({ agentKey: "avery", runType: "rule_evaluation" });

  try {
    const result = await evaluateRules();
    await finishSystemRun(run.id, { status: "completed", outputsJson: result });
    return ok({ ok: true, ...result });
  } catch (error) {
    await finishSystemRun(run.id, {
      status: "failed",
      errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    return serverError("Rule evaluation failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
