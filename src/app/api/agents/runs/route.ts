import { ok, serverError } from "@/lib/api/responses";
import { getRecentSystemRunsByAgent } from "@/lib/supabase/queries";

export async function GET() {
  try {
    const [sloan, lyra, noah, avery] = await Promise.all([
      getRecentSystemRunsByAgent("sloan", 10),
      getRecentSystemRunsByAgent("lyra", 10),
      getRecentSystemRunsByAgent("noah", 10),
      getRecentSystemRunsByAgent("avery", 10)
    ]);

    return ok({
      ok: true,
      byAgent: { sloan, lyra, noah, avery }
    });
  } catch (error) {
    return serverError("Failed to fetch runs", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
