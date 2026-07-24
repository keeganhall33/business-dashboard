import { NextResponse } from "next/server";
import { authorizeInternalRequest } from "@/lib/auth/internal";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAlertByKey } from "@/lib/scheduler/alerting";
import { markAlertStatus, type AlertLifecycleStatus } from "@/lib/scheduler/alertLifecycle";

export async function POST(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { alertId, action, source, reason } = await request.json();
  if (!alertId || !action || !source) {
    return NextResponse.json({ ok: false, error: "alertId, action, and source required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: alert, error } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("id", alertId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!alert) {
    return NextResponse.json({ ok: false, error: "Alert not found" }, { status: 404 });
  }

  const dedupeKey = alert.dedupe_key as string;
  let newStatus: AlertLifecycleStatus = alert.is_resolved ? "resolved" : "unresolved";

  if (action === "acknowledge") {
    newStatus = "acknowledged";
  } else if (action === "resolve") {
    await resolveAlertByKey(dedupeKey);
    newStatus = "resolved";
  } else if (action === "suppress") {
    newStatus = "suppressed";
  } else if (action === "unsuppress") {
    newStatus = "unresolved";
  } else {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const entry = await markAlertStatus({
    dedupeKey,
    alertId,
    status: newStatus,
    source,
    reason
  });

  return NextResponse.json({ ok: true, status: entry });
}
