import { ok } from "@/lib/api/responses";

export const runtime = "nodejs";

export async function GET() {
  return ok({ ok: true, timestamp: new Date().toISOString() });
}
