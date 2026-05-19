This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Deploying

`./scripts/deploy.sh` wraps our release flow so Fly and Vercel stay in sync:

1. Create `.env.deploy` (ignored by git) with `VERCEL_DEPLOY_HOOK_URL=<hook>` – the production hook currently lives at `https://api.vercel.com/v1/integrations/deploy/prj_iGgUAjo6mRCpljpVtXoaY3FM8kgz/hYd64J3o6f`.
2. Run `./scripts/deploy.sh` (pass any `fly deploy` flags you need). The script deploys to Fly and, if `VERCEL_DEPLOY_HOOK_URL` is set, immediately POSTs to that hook so Vercel publishes the same commit.

## Getting Started

### Environment variables

Create a local `.env` (or copy `.env.example`) with the Supabase project settings:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000          # optional, server-side fetch base
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: use JSON seeds when you do not have Supabase access
DASHBOARD_DATA_SOURCE=seed
```

`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are required for live data. When `DASHBOARD_DATA_SOURCE=seed`,
the API falls back to `data/dashboard-seed.json` so the UI can render offline.

### Dashboard data source (Supabase vs seed JSON)

By default, the dashboard overview endpoint (`GET /api/dashboard/overview`) reads from Supabase.

If you want to run the UI without Supabase env/network (or you have a Prefect JSON export), you can switch the overview endpoint into **seed mode**:

```bash
# from business-dashboard/
export DASHBOARD_DATA_SOURCE=seed
# optional: point at a different JSON export (Prefect, etc.)
export DASHBOARD_SEED_PATH=./data/dashboard-seed.json
```

Seed mode populates:
- the **Overview KPI strip** (header metrics)
- the **Collector pipeline cards**

Everything else stays as a lightweight stub so the dashboard renders.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scheduler jobs (Supabase Scheduled Functions / cron)

The app exposes scheduler endpoints under `POST /api/scheduler/*`.

All scheduler routes require the header:

```
x-scheduler-secret: <SCHEDULER_SECRET>
```

Jobs:

- `POST /api/scheduler/daily-agent-cycle`
- `POST /api/scheduler/daily-health-check`
- `POST /api/scheduler/proof-enforcement`
- `POST /api/scheduler/deliverable-harvest`
- `POST /api/scheduler/ceo-digest`
- `POST /api/scheduler/evening-closeout`
- `POST /api/scheduler/weekly-command-cycle`
- `POST /api/scheduler/weekly-summary`
- `POST /api/scheduler/midweek-opportunity-pulse`

## Manual data entry (metric readings)

When upstream telemetry isn't wired yet, you can post manual readings into `scoreboard_metric_readings`:

`POST /api/metrics/readings`

Body:

```json
{
  "metricKey": "monthly_revenue",
  "currentValue": 28500,
  "measuredAt": "2026-05-16T03:10:00.000Z",
  "source": "manual"
}
```

## Agent run handshake (checkpoints) + nudges

To surface progress in the dashboard (and enable resume/hand-off workflows), runs can write checkpoints:

- `GET /api/agents/runs/:runId/checkpoints`
- `POST /api/agents/runs/:runId/checkpoints`

Body:

```json
{
  "agentKey": "noah",
  "checkpointKey": "pipeline_scan",
  "status": "started",
  "detailMd": "Scanning recent opportunities for staleness",
  "metadata": { "limit": 200 }
}
```

You can also "nudge" an agent to activate approved/auto-runnable tasks and publish a status snapshot:

- `POST /api/agents/nudge/:agentKey`

To run from Supabase Scheduled Functions (or any cron runner), schedule an HTTP request to the route and include `x-scheduler-secret`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
