import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runProofEnforcementChecks } from "@/lib/scheduler/proofEnforcement";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runProofEnforcementChecks();
    return ok({ ok: true, job: "proof-enforcement", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "proof-enforcement",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

