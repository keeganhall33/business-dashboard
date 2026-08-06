# Phase B4 — Production scheduler trigger assessment (evidence-based)

## What is known from source

- The central scheduler tick endpoint is `POST /api/scheduler/tick`.
- It requires scheduler authentication (`assertSchedulerAuth`).
- It reads *all* active rows from `scheduled_jobs` and dispatches runners by `job_key`.
- It does **not** dispatch by `route_path` (that column is metadata only in the current implementation).
- It advances `next_run_at` via `computeNextRunAt({ cronExpression, timezone }, now)`.

Source: `src/app/api/scheduler/tick/route.ts`

## What is known from production data (evidence)

- Production has multiple active `scheduled_jobs` rows with recent `last_run_at` values and advanced `next_run_at` values.
- That implies an external production runner is actively invoking the tick endpoint and jobs are being processed.

This repository does not contain the infrastructure definition for that external runner.

## What is NOT represented in this repository (unknown)

The following are **not** represented in-repo and therefore cannot be asserted without separate provider/dashboard inspection:

- Trigger provider (Vercel Cron vs Fly vs GitHub Actions vs an external cron host)
- Cadence of the external trigger (tick route recommends every minute; production could differ)
- Timeout/retry semantics (these are defined by the runner provider)

## Operational dependency for B4

B4 recurring internal orchestration activation depends on:

- the existing external production runner continuing to invoke `POST /api/scheduler/tick`.

Creating or updating a `scheduled_jobs` row alone does **not** create an external trigger.
