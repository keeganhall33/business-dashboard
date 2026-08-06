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

## Direct trigger inspection attempts (results)

- Vercel Cron (project-level, existing): **no cron jobs found** (`vercel crons ls` on the linked `business-dashboard` project).
- GitHub Actions: no workflow in `.github/workflows/*` invokes `/api/scheduler/tick`.
- Fly.io: `fly.toml` contains no scheduled process or cron configuration.
- Supabase pg_cron: no `pg_cron` usage or `cron.schedule(...)` present in `supabase/**`.

## Governed trigger foundation (this PR)

- Added a repository-governed Vercel Cron definition in `vercel.json`:
  - path: `/api/scheduler/tick`
  - schedule: `*/5 * * * *` (every five minutes)

This is intended to provide a verifiable production tick trigger once deployed to production.

## What is NOT yet directly verified (blocker)

The following remain **unverified** without separate production infrastructure inspection:

- Exact trigger provider (external uptime/cron service vs out-of-band config)
- Exact tick cadence
- Authentication header configuration in the trigger
- Timeout/retry/overlap behavior of the trigger runner

## Operational dependency for B4

B4 recurring internal orchestration activation depends on:

- the existing external production runner continuing to invoke `POST /api/scheduler/tick`.

Creating or updating a `scheduled_jobs` row alone does **not** create an external trigger.
