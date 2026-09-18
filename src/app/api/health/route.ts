import { ok } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      releaseSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
