# Business Dashboard

A Next.js + Supabase decision and intelligence system for running the business and career operating system.

The product is not intended to be a collection of independent dashboards or autonomous recommendation bots. Its core question is:

> **What should Keegan do next?**

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current system map and canonical source hierarchy.

## Core decision flow

```text
Business + external evidence
→ normalized knowledge
→ Fusion
→ Avery
→ Sloan / Lyra / Noah
→ prioritized moves
→ execution
→ measured outcomes
→ learning
```

See:
- [`docs/intelligence/AI_DECISION_CONSTITUTION.md`](docs/intelligence/AI_DECISION_CONSTITUTION.md)
- [`docs/intelligence/AGENT_OPERATING_MODEL.md`](docs/intelligence/AGENT_OPERATING_MODEL.md)
- [`docs/intelligence/EXTERNAL_INTELLIGENCE_ARCHITECTURE.md`](docs/intelligence/EXTERNAL_INTELLIGENCE_ARCHITECTURE.md)
- [`docs/intelligence/ROADMAP.md`](docs/intelligence/ROADMAP.md)

## Production deployment

**Vercel is the only production application runtime.**

- Vercel Git integration deploys the application from GitHub.
- `.github/workflows/validated-main-deploy.yml` validates integrated `main` with typecheck, tests, and a production build.
- The workflow can optionally smoke-check the configured production URL through the `DASHBOARD_PRODUCTION_URL` repository variable.
- Fly and Docker deployment paths are retired.

Do not introduce another production runtime without an explicit architecture decision.

## Application scheduler

Application-level schedules have one control plane:

1. `.github/workflows/autopilot.yml` wakes the application every five minutes.
2. It calls `POST /api/scheduler/tick` on the configured production dashboard URL.
3. `/api/scheduler/tick` reads Supabase `scheduled_jobs` and runs any due internal jobs.
4. Job timing belongs in `scheduled_jobs`, not duplicated GitHub cron expressions.

The scheduler workflow intentionally refuses Fly targets.

Required GitHub configuration:
- repository variable `DASHBOARD_PRODUCTION_URL` → canonical Vercel production dashboard URL (preferred)
- legacy fallback repository variable `SCHEDULER_BASE_URL` may be used temporarily during migration
- repository secret `SCHEDULER_SECRET`

## Evidence refresh jobs

`.github/workflows/dashboard-scheduler.yml` runs external/internal telemetry collection that must execute in GitHub Actions, including website, WooCommerce, Meta, Cloudflare, lead, social, and industry refreshes.

These jobs **collect evidence**. They do not own executive strategy. Operating recommendations flow through the canonical intelligence/Fusion/agent system.

Committed 1Password templates live in `config/env/*.op.env`. They may contain only `op://` references or non-secret constants. Resolved/local `.env*` files are ignored by Git.

## Local development

Install and run:

```bash
npm ci
npm run dev
```

Useful validation commands:

```bash
npx tsc --noEmit
npm test
npm run build
npm run lint
```

### Environment

Create a local `.env` from `.env.example` and provide the development values you need. At minimum, live Supabase-backed operation typically needs:

```text
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never commit resolved credentials.

## Seed and test modes

Non-production seed and fixture modes exist for local/E2E validation. They must remain explicitly labeled and must never silently replace production data.

- `DASHBOARD_DATA_SOURCE=seed` enables seed mode intentionally.
- `E2E_TEST=1` enables the static test harness.
- staging fixtures are for explicit preview/testing environments only.

## Repository conventions

- Canonical architecture belongs under `docs/` and `docs/intelligence/`.
- Historical Supabase migrations remain in the repository even when later migrations retire a feature.
- Do not create a parallel scheduler, recommendation engine, agent definition, deployment runtime, or memory system when a canonical owner already exists.
- `AGENTS.md` contains coding-agent/worktree safety rules. Product-agent roles live in `src/lib/agents/operating-model.ts`.

## Key directories

```text
src/app/                       Next.js routes and UI
src/lib/agents/                Avery, Sloan, Lyra, Noah + canonical operating model
src/lib/career/                Career OS
src/lib/intelligence-v1/       Internal intelligence
src/lib/external-intelligence/ External knowledge/intelligence
src/lib/fusion-v1/             Evidence-gated decision fusion
src/lib/scheduler/             Internal job orchestration
supabase/migrations/           Immutable database history
docs/intelligence/             Canonical intelligence architecture
config/env/                    Safe-to-commit 1Password reference templates
```
