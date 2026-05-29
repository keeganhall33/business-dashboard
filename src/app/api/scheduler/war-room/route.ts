import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runWarRoomDigest } from "@/lib/scheduler/warRoomDigest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runWarRoomDigest();
    return ok({ ok: true, job: "war-room-digest", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "war-room-digest",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
