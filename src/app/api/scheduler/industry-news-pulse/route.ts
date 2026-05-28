import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runIndustryNewsPulse } from "@/lib/scheduler/industryNewsPulse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runIndustryNewsPulse();
    return ok({ ok: true, job: "industry-news-pulse", result });
  } catch (error) {
    return serverError("Industry news pulse failed", {
      job: "industry-news-pulse",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
