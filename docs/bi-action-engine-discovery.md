# Business Intelligence + Action Engine — Discovery (Current-State Audit)

> **Scope (discovery only):** inventory existing sources, ingestion, storage, APIs, UI, schedulers, intelligence logic, and action/approval mechanics. **No production changes.**

## 1) Executive discovery status

- **Branch:** `epic/bi-action-engine-discovery`
- **Base main SHA:** `511731b53d4febf069559e226733039e44e50574`
- **Milestone:** **M1 — Current-state audit** (this document + JSON inventory)
- **Artifacts:**
  - `docs/bi-action-engine-discovery.md` (this doc)
  - `docs/bi-source-inventory.json` (machine-readable inventory)

## 2) Repository architecture map (what exists today)

### Runtime shape

- **Next.js app:** `src/app/**`
- **Dashboard UI route:** `src/app/dashboard/page.tsx` + client shell components under `src/components/dashboard/**`
- **Backend API (dashboard + ops):** `src/app/api/**`
- **Supabase access layer:** `src/lib/supabase/**`
- **Dashboard computation / “intelligence” utilities:** `src/lib/dashboard/**`, `src/lib/data-confidence.ts`, `src/lib/operations-intelligence.ts`, `src/lib/opportunity-approval-pipeline.ts`
- **Agent model (internal):** `src/lib/agents/**`
- **Automation:** `src/lib/automation/**` and `src/app/api/automation/**`
- **Scheduler (in-app):** `src/lib/scheduler/**` + `src/app/api/scheduler/**`
- **Scheduler (GitHub Actions cron):** `.github/workflows/dashboard-scheduler.yml`

### Storage shape

- **Supabase schema/migrations:** `supabase/schema.sql`, `supabase/migrations/**`
- **Woo telemetry tables (production-backed):** `supabase/migrations/20260728_add_woo_order_telemetry_v1.sql`
- **Scheduler tables:** `supabase/migrations/20260430_add_scheduler_tables.sql` + `supabase/phase4_scheduler.sql`
- **Snapshot-style tables / feeds:** see `supabase/schema.sql` + `src/lib/supabase/**` (varies by source)

### CI / env templates

- **CI env templates:** `.env.*.ci` files (1Password secret references)
- **Woo-only CI env:** `.env.woo.ci` (added with PR #50)

## 3) Current dashboard capability inventory (high-level)

> **Important:** presence of a panel ≠ production-backed telemetry. Each capability below is classified (exact/partial/heuristic/seed/etc.) and linked to evidence files.

### 3.1 Core dashboard load

- **Capability:** Dashboard server render + initial data hydration
- **API:** `GET /api/dashboard/overview`
- **UI:** `src/app/dashboard/page.tsx` → `DashboardPageClient` → `DashboardShell`
- **Auth (API):** `DASHBOARD_ADMIN_TOKEN` via `x-dashboard-secret` / Bearer (server-only)
- **Evidence:**
  - `src/app/dashboard/page.tsx`
  - `src/lib/api/dashboard.ts`
  - `src/lib/auth/dashboard.ts`
  - `src/app/api/dashboard/overview/route.ts`

### 3.2 Commerce: selected-range Woo telemetry (production-backed)

- **Capability:** selected-range revenue/orders/timeseries with completeness + coverage
- **Source:** WooCommerce orders (paid-date definition `woo_paid_net_v1`)
- **Ingestion path:** Node script `scripts/run-woo-telemetry.mjs` (paid-date filtering in Pacific)
- **Storage:** `public.woo_order_telemetry_v1`, `public.woo_ingestion_runs_v1`
- **API consumption:** RPC `public.get_woo_metrics(date,date)` (PostgREST)
- **Scheduler:** GitHub Actions `Dashboard Scheduler` → `woo` job (cron `5 10 * * *`)
- **UI:** commerce panels in dashboard (e.g. `CommerceVisualsPanel`, `SalesPanel`, `WebsiteConversionPanel`)
- **Truth status:** **exact + production-backed** when completeness is `complete`; **unknown** when outside proven coverage
- **Evidence:**
  - `scripts/run-woo-telemetry.mjs`
  - `src/lib/woo/woo-ingestion.ts`
  - `supabase/migrations/20260728_add_woo_order_telemetry_v1.sql`
  - `supabase/schema.sql` (RPC stub)
  - `.github/workflows/dashboard-scheduler.yml`
  - `src/components/dashboard/CommerceVisualsPanel.tsx`

### 3.3 Website Conversion snapshot (GA4 + Woo snapshot; not selected-range truth)

- **Capability:** displays latest snapshot evidence that may differ from selected range
- **Source systems:** GA4 + Woo snapshot (recent orders)
- **Ingestion path:** scripts under `scripts/run-website-conversion.mjs` + dashboard snapshot selection utils
- **Storage:** snapshot JSON / supabase snapshot tables (needs deeper audit)
- **Truth status:** **snapshot evidence**; can be stale/partial; must not be treated as exact selected-range commerce
- **Evidence:**
  - `src/components/dashboard/WebsiteConversionPanel.tsx`
  - `scripts/run-website-conversion.mjs`
  - `src/lib/dashboard/normalize-website-snapshot.ts`

### 3.4 Meta Ads telemetry (reporting)

- **Capability:** campaign-level performance panel
- **Ingestion path:** `scripts/run-meta-reporting.mjs`
- **Storage:** likely snapshot table / JSON feed (needs deeper audit)
- **Truth status:** connected telemetry **(likely connected_incomplete)** pending schema audit
- **Evidence:**
  - `scripts/run-meta-reporting.mjs`
  - `src/components/dashboard/MetaAdsPanel.tsx`

### 3.5 Leads / CRM intelligence

- **Capability:** lead intelligence panel, Monday cadence in workflow
- **Ingestion path:** `scripts/run-lead-intelligence.mjs`
- **Truth status:** connected telemetry **(connected_incomplete)** pending storage review
- **Evidence:**
  - `scripts/run-lead-intelligence.mjs`
  - `src/components/dashboard/LeadIntelligencePanel.tsx`

### 3.6 Social intelligence

- **Capability:** social intelligence panel
- **Ingestion path:** `scripts/run-social-intelligence.mjs`
- **Truth status:** connected telemetry **(connected_incomplete)** pending storage review
- **Evidence:**
  - `scripts/run-social-intelligence.mjs`
  - `src/components/dashboard/SocialIntelligencePanel.tsx`

### 3.7 Industry pulse / news

- **Capability:** industry pulse panel + ingestion
- **Ingestion path:** `scripts/run-industry-pulse.mjs` + `scripts/runIndustryNewsPulse.ts`
- **Truth status:** connected telemetry **(connected_incomplete)** pending schema review
- **Evidence:**
  - `src/lib/news/**`
  - `src/lib/scheduler/industryNewsPulse.ts`
  - `src/app/api/scheduler/industry-news-pulse/route.ts`

### 3.8 Cloudflare telemetry

- **Capability:** Cloudflare panel
- **Ingestion path:** `scripts/run-cloudflare-telemetry.mjs`
- **Truth status:** connected telemetry **(connected_incomplete)** pending schema review
- **Evidence:**
  - `scripts/run-cloudflare-telemetry.mjs`
  - `src/components/dashboard/CloudflarePanel.tsx`

### 3.9 Action Queue / Opportunities / Approvals

- **Capability:** track actions/opportunities and approval gating
- **API:** `src/app/api/opportunities/**`, `src/app/api/tasks/**`, `src/app/api/automation/**`
- **Storage:** Supabase task queue + opportunities tables (needs focused schema crosswalk)
- **Truth status:** operational system (production-backed), but **execution scope** and external integrations must be verified
- **Evidence:**
  - `src/lib/opportunity-approval-pipeline.ts`
  - `src/lib/action-queue.ts`
  - `src/app/api/tasks/**`
  - `src/app/api/opportunities/**`

## 4) Current data-source inventory (initial)

This section is fully enumerated in `docs/bi-source-inventory.json`. This doc links the major clusters and the highest-risk truth gaps.

## 5) Current ingestion + scheduler inventory

### GitHub Actions cron (production)

- **Workflow:** `.github/workflows/dashboard-scheduler.yml`
- **Woo cron:** `5 10 * * *`
- Other scheduled jobs in that workflow include website, meta, industry, cloudflare, leads, social, executive.

### In-app scheduler (authenticated HTTP routes)

- **Routes:** `src/app/api/scheduler/*`
- **Auth:** `src/lib/scheduler/auth.ts` (x-scheduler-secret OR GitHub token verification)
- **Note:** This is separate from GitHub Actions cron and should not be conflated.

## 6) Existing intelligence + recommendation logic (what “thinks” today)

### Confidence model

- **Data confidence framework:** `src/lib/data-confidence.ts`
- **UI:** `src/components/dashboard/DataConfidencePanel.tsx` + `DataSourceMatrixPanel.tsx`

### Change detection / drivers / summaries

- Change Insights: `src/lib/dashboard/change-insights.ts` + `src/components/dashboard/ChangeInsightsPanel.tsx`
- Top Drivers: `src/components/dashboard/TopDriversPanel.tsx` + supporting libs
- Executive Summary: `src/lib/dashboard/executive-summary.ts` + `src/components/dashboard/ExecutiveSummaryPanel.tsx`
- Forward Strategy: `src/lib/dashboard/forward-strategy.ts` + `ForwardStrategyPanel.tsx`

> **Truth audit flag:** many of these are **derived** from mixed sources (some exact telemetry, some snapshot, some heuristic). They must expose provenance and avoid causal claims without evidence.

## 7) Existing action + approval capabilities

- **Task approval endpoints:** `src/app/api/tasks/[id]/*`
- **Opportunity status changes:** `src/app/api/opportunities/[id]/status/route.ts`
- **Automation evaluation + job execution:** `src/app/api/automation/**` + `src/lib/automation/**`

> **Discovery requirement:** map each action path to an “action level” (0–5) and confirm any external side effects are approval-gated.

## 8) Production-backed vs placeholder matrix (initial)

| Domain | Capability | Claim type | Current status | Key risk |
|---|---|---:|---|---|
| Commerce | selected-range Woo telemetry | exact | production-backed | completeness/coverage must gate AOV + comparisons |
| Commerce | recent-order snapshot fallback | partial | connected_incomplete | can masquerade as exact if UI not explicit |
| Website | GA4 sessions/conversion | partial | connected_incomplete | attribution + freshness + sampling |
| Meta Ads | spend/ROAS | partial | connected_incomplete | attribution + match-back to Woo sales |
| Leads | pipeline/intel | partial | connected_incomplete | definitions + historical depth |
| Social | social intel | partial | connected_incomplete | platform API limits + identity matching |
| Action system | tasks/opportunities | operational | production-backed | must ensure approval before execution |

## 9) Initial critical gaps (first pass)

1. **No unified event timeline model** tying marketing actions + external events + site behavior + commerce outcomes.
2. **Causal explanation is mostly correlational**; needs explicit evidence vs hypothesis handling.
3. **Attribution model not explicit** (e.g., Meta ↔ Woo matchback; email ↔ revenue windows).
4. **Action engine is not fully formalized** (levels 0–5 + audit trail + outcome learning loop).
5. **Source inventory lacks machine-readable truth/coverage guarantees** per metric/capability.

## 10) Evidence references (audit anchor list)

- Workflows: `.github/workflows/dashboard-scheduler.yml`
- CI templates: `.env.website.ci`, `.env.meta.ci`, `.env.leads.ci`, `.env.cloudflare.ci`, `.env.woo.ci`
- Woo telemetry: `scripts/run-woo-telemetry.mjs`, `src/lib/woo/woo-ingestion.ts`, `supabase/migrations/20260728_add_woo_order_telemetry_v1.sql`
- Dashboard API: `src/app/api/dashboard/overview/route.ts`
- Confidence: `src/lib/data-confidence.ts`
- Opportunity/action: `src/lib/opportunity-approval-pipeline.ts`, `src/app/api/opportunities/**`, `src/app/api/tasks/**`

---

## Progress ledger (M1)

- [x] Create discovery doc + JSON inventory files
- [x] Map repo architecture anchors
- [ ] Expand capability inventory to one-record-per-capability (via JSON)
- [ ] Fill truth audit per panel (exact/partial/heuristic/etc.) with file evidence
- [ ] Identify storage tables per source (Supabase crosswalk)
- [ ] Confirm schedulers (GitHub Actions vs in-app) and freshness/historical depth
