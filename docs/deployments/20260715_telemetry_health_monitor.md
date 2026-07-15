# 2026-07-15 Telemetry Health Monitor Rollout (Phase 3B)

## Objective
Automate telemetry surveillance so Woo, GA4, FunnelKit, and Meta data health is recorded, alerted, and visible without manual checks. Scope covered the persistence layer, alert evaluator, scheduler, operator UI, diagnostics API, and documentation/runbooks.

## Architecture Changes
- Added `telemetry_health_events` table to log source health samples (source, range, freshness, coverage, warnings, latency, deployment version). Scheduled cleanup retains ~45 days of history.
- Created `/api/scheduler/telemetry-health-monitor` job (cron: every 30 minutes PT) that fetches semantic telemetry, persists events, deletes stale rows, and evaluates alert rules.
- Built alert evaluator inside `src/lib/telemetry/healthMonitor.ts` that raises/clears `telemetry_health` alerts via the existing `system_alerts` table and dedupe keys per source/reason.
- Persisted incident state in `system_state` to track first/last observation and consecutive counts for summaries.
- Added `/api/telemetry/diagnostics` admin endpoint for on-demand metadata + recent history + scheduler status.
- Extended dashboard API payload with `telemetryMetadata`, `telemetryHealth`, and `telemetryHealthHistory` plus a new UI panel for operators.

## Validation
- Unit tests (`node --test`) now cover health-event building, incident detection, summary formatting, and existing suites.
- TypeScript + ESLint + `npm run build` executed locally.
- Scheduler job invoked locally via `/api/scheduler/telemetry-health-monitor` using service-role auth.

## Runbook
1. **Manual execution**: `curl -X POST https://keegan-dashboard.fly.dev/api/scheduler/telemetry-health-monitor -H "x-scheduler-secret: $SCHEDULER_TOKEN"` to force a health sweep.
2. **Diagnostics**: `curl -H "x-dashboard-secret: $DASHBOARD_ADMIN_TOKEN" https://keegan-dashboard.fly.dev/api/telemetry/diagnostics` for current statuses, alerts, scheduler metadata, and last events.
3. **Retention**: Monitor `telemetry_health_events` row count; job prunes entries older than 45 days automatically.
4. **Alert triage**: Open alerts appear under `telemetry_health`. Each summary includes source, reason, first/last timestamps, and consecutive count.

## Rollback
1. Disable scheduler job by marking `scheduled_jobs.is_active=false` for `telemetry-health-monitor` (or revert migration) and redeploy.
2. Remove new UI panel by reverting `src/components/dashboard/TelemetryOperationsPanel.tsx` / `DashboardShell.tsx` diff and redeploy.
3. Drop `telemetry_health_events` table with the rollback SQL from `supabase/migrations/20260715_add_telemetry_health_events.sql` if permanent removal is required.
4. Clear outstanding `telemetry_health` alerts via `/api/scheduler/...` or `resolveAlertByKey` helper.

## Deployment
- UTC timestamp: 2026-07-15T01:20:00Z
- Fly deployment ID: `deployment-01KXHNQ6DPGK9Y043T3C3A1NNY`
- Git commit: `6e1b7699135dd95f9afda2c1088f69c1fa9a1455` (update after code commit)
- Tests/Checks: `npm run test`, `npx tsc --noEmit`, targeted ESLint, `npm run build`
- Validated API ranges: 7d, 30d, 90d, custom boundary (2026-07-12→2026-07-13), partial current day, empty range
- API compatibility: additive fields (`telemetryMetadata`, `telemetryHealth`, `telemetryHealthHistory`); existing consumers unaffected.
- Database changes: Added `telemetry_health_events` table + scheduler job row only.
