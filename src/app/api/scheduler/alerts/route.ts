import { NextResponse } from "next/server";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { createSystemAlert, resolveSystemAlert } from "@/lib/supabase/queries";

const HAS_SUPABASE = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { agentKey, status, message } = body as {
    agentKey?: string;
    status?: string;
    message?: string;
  };

  const dedupeKey = `agent:${agentKey ?? "website_conversion"}`;
  const summary = message ?? "Agent status update";

  if (status?.toLowerCase() === "success") {
    if (HAS_SUPABASE) {
      await resolveSystemAlert(dedupeKey).catch((error) => {
        console.warn("[scheduler-alerts] Failed to resolve alert", error);
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (!HAS_SUPABASE) {
    console.warn("[scheduler-alerts] Alert received without Supabase credentials", {
      agentKey,
      status,
      summary
    });
    return NextResponse.json({ ok: true, warning: "Supabase credentials missing" });
  }

  await createSystemAlert({
    alertType: "website_agent_failure",
    severity: "high",
    title: `${agentKey ?? "website_conversion"} failure`,
    summary,
    relatedAgentKey: agentKey ?? "website_conversion",
    dedupeKey
  });

  return NextResponse.json({ ok: true });
}
