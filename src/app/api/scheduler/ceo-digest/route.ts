import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runCeoDigest } from "@/lib/scheduler/ceoDigest";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runCeoDigest();
    return ok({ ok: true, job: "ceo-digest", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "ceo-digest",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

