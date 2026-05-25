export type DashboardTelemetryEvent = {
  name:
    | "opportunity.review"
    | "opportunity.approve"
    | "opportunity.implement"
    | "opportunity.transition_blocked"
    | "action_queue.dedupe";
  ts: string;
  properties?: Record<string, unknown>;
};

export async function trackDashboardEvent(event: Omit<DashboardTelemetryEvent, "ts"> & { ts?: string }) {
  const payload: DashboardTelemetryEvent = {
    ...event,
    ts: event.ts ?? new Date().toISOString()
  };

  // Best-effort; never block UX.
  try {
    await fetch("/api/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    // Ignore.
  }
}

