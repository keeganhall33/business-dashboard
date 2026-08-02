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

## 10) 10/10 dashboard scorecard (Milestone 2)

> **Scoring artifact:** `docs/bi-dashboard-scorecard.json`
>
> **Weighted overall score formula:**
> \( overall = \sum_{d \in dimensions} weight(d) * score(d) / 100 \)
> where `weight(d)` totals **100**.
>
> **Summary (current):**
> - **Overall weighted score:** **4.06 / 10**
> - **Reporting-dashboard score:** **6.09 / 10**
> - **Intelligence-engine score:** **2.00 / 10**
> - **Action-engine score:** **2.56 / 10**
> - **Strongest dimension:** Security
> - **Weakest dimension:** Forecasting
> - **Five blockers to 10/10:** Cross-channel integration, Attribution, Explanation quality, Recommendation quality, Outcome measurement

### Scorecard dimensions (25)

The complete per-dimension rubric + evidence is tracked in `docs/bi-dashboard-scorecard.json`.

## 11) Milestone 3 — Unified Business Event + Knowledge Model (complete)

### Durable artifacts

- `docs/bi-business-event-model.json` (canonical entities, event taxonomy, confidence + attribution, storage direction)
- `docs/bi-source-event-mappings.json` (source→event mappings + gaps)
- `docs/bi-event-model-examples.json` (10 end-to-end examples)
- `docs/bi-business-event-model.md` (human-readable companion)

### Canonical entity set (required minimum)

Defined in `docs/bi-business-event-model.json`:

- BusinessEvent
- Product
- Artwork
- Edition
- Campaign
- Channel
- Audience
- Customer
- Collector
- Lead
- Order
- Refund
- MarketingAsset
- EmailCampaign
- SocialPost
- PaidAd
- WebsiteSession
- FunnelEvent
- MediaAppearance
- Partnership
- Promotion
- Coupon
- CalendarEvent
- Recommendation
- PreparedAction
- Approval
- Execution
- Outcome
- DataSource
- SourceRecord
- AttributionTouch
- BusinessMetric

Each entity includes:
- canonical ID strategy + source identifiers
- required/optional fields
- relationships + cardinality
- timestamps
- provenance/freshness/confidence fields
- PII classification + retention expectations

### Canonical event taxonomy

Defined in `docs/bi-business-event-model.json` under `event_taxonomy.groups`.

### Source mappings (coverage)

Defined in `docs/bi-source-event-mappings.json` for:
- WooCommerce telemetry (production-backed)
- GA4 website conversion snapshot (connected_incomplete)
- FunnelKit (technically_connectable / TBD)
- Meta reporting (connected_incomplete)
- Lead intelligence (connected_incomplete)
- Collectors (connected_incomplete)
- Social intelligence (connected_incomplete)
- Cloudflare (connected_incomplete)
- Industry pulse (connected_incomplete)
- GitHub Actions scheduler (connected_reliable)
- In-app scheduler (connected_reliable)
- Manual finance snapshot (manual_only)
- Opportunities/tasks/decisions/agent runs (connected_reliable)

### Milestone 4 — Causal Explanation Architecture (complete)

Durable artifacts:
- `docs/bi-causal-explanation-model.json`
- `docs/bi-explanation-examples.json`

Explanation pipeline stages (v1):
1. **Normalize** source records → BusinessEvents (validate, dedupe, time-normalize, attach provenance)
2. **Select window**: resolve analysis range + required-source coverage gates
3. **Baseline selection**: previous-period / week-over-week / seasonal anchor (only when history supports)
4. **Change detection**: detect meaningful deltas (revenue/orders/AOV/refunds/sessions/conversion)
5. **Anomaly detection**: robust outlier detection + single-order outlier segmentation
6. **Candidate-cause generation**: traffic, conversion, marketing, external events, commerce mechanics, data quality
7. **Evidence ranking**: rank evidence by reliability + freshness + completeness + attribution validity + confound penalties
8. **Alternative testing + confounders**: overlap, seasonality, outliers, refunds, inventory constraints, partial coverage
9. **Confidence assignment**: confirmed/strongly_supported/likely/possible/insufficient_evidence
10. **Explanation rendering**: allowed wording by confidence + mandatory provenance + missing-data disclosure
11. **Recommendation handoff**: produce recommendation inputs; if insufficient evidence, only remediation recommendations

Evidence-ranking rules (non-negotiable):
- Prefer **confirmed** (exact telemetry + complete coverage) over snapshot/heuristic.
- Never mix **Woo exact revenue** with platform-reported revenue in the same causal claim.
- Require explicit attribution model + window to claim "attributed".
- If coverage is partial/unknown for required sources, downgrade confidence (often to insufficient evidence).
- Overlapping campaigns force multi-cause reporting unless a validated touch model exists.

## 12) Milestone 5 — Recommendation + Opportunity Architecture (complete)

Durable artifacts:
- `docs/bi-recommendation-model.json`
- `docs/bi-opportunity-model.json`
- `docs/bi-recommendation-examples.json` (20 examples)
- `docs/bi-recommendation-evaluation.json`

Key outputs:
- full recommendation lifecycle (signal → explanation → opportunity → recommendation → prepared action → approval → execution → outcome → evaluation)
- canonical recommendation schema + status transitions + dedup/idempotency + expiration
- categories covering paid ads, email, website, social, sales/collectors, product/merchandising, and data/ops (includes wait_for_more_data + take_no_action)
- opportunity taxonomy with detection conditions + minimum data requirements + exclusions + confidence gates
- transparent gates + "why this recommendation" evidence packet requirements
- impact estimation tiers with range-based estimates (no false precision)
- conflict detection + precedence rules
- memory rules preventing repeated rejected or conflicting advice

## 13) Milestone 6 — Action Preparation + Approval Model (complete)

Durable artifacts:
- `docs/bi-action-model.json` (L0–L5 definitions + allowed/prohibited transitions + execution states)
- `docs/bi-approval-model.json` (approval classes + schema + state machine + invalidation rules)
- `docs/bi-prepared-action-schemas.json` (PreparedAction schema + per-channel packages + side-effect matrix)
- `docs/bi-action-examples.json` (20 worked examples)
- `docs/bi-action-security-model.json` (least-privilege + preflight + secrets/PII rules)

### Action levels summary (L0–L5)

- **L0:** insight only; no recommendation; no approval.
- **L1:** recommendation only; no deployable work.
- **L2:** editable draft prepared; not deployable.
- **L3:** execution-ready package + approval request; **no external side effects**.
- **L4:** approved execution only; strict preflight + scope + idempotency.
- **L5:** outcome measurement + learning.

Hard prohibition: system must never jump directly from **L1/L2 → L4**.

### Approval classes

Informational, Content, Audience, Financial, Publication, Customer-contact, Data/system.

### Side-effect boundaries

Encoded in `docs/bi-prepared-action-schemas.json` under `side_effect_matrix`.
- `data_deletion` is **execution_never=true**.
- email sends are irreversible (`cannot_unsend`), requiring publication approval.

## 14) Milestone 7 — Integration Gap Analysis (complete)

Durable artifacts:
- `docs/bi-integration-gap-analysis.json`
- `docs/bi-integration-priority-map.json`
- `docs/bi-data-coverage-matrix.json`
- `docs/bi-connector-capability-map.json`
- `docs/bi-integration-risk-register.json`

Highlights:
- Explicit source-by-source classification using approved status vocabulary
- 100-point weighted priority scoring model (weights sum to 100)
- Coverage matrix with approved coverage/backfill vocab
- Identity resolution + consent boundaries
- Canonical campaign naming + UTM standards recommendation
- Tier 1–4 minimum viable source stack
- Manual fallback workflows + worked scenarios

## 15) Milestone 8 — UX Blueprint (started)

### Proposed navigation (draft)

- **Dashboard**
  - Executive Summary
  - Scorecard
  - Evidence Explorer
- **Explain**
  - What happened
  - Why (causal explanations)
  - Evidence + confidence
- **Recommend**
  - Opportunities
  - Recommendations
  - Suppressions (why we are *not* acting)
- **Act**
  - Prepared Actions (L2/L3)
  - Approvals (L3→L4)
  - Executions + Rollbacks
- **Learn**
  - Outcomes
  - Experiments
  - What changed in the model
- **Data & Integrations**
  - Source status
  - Coverage matrix
  - Identity resolution
  - Risk register

### Executive-summary hierarchy (draft)

1) Revenue + net orders (truth: Woo)
2) Spend + efficiency (truth: Meta/Google where connected)
3) Conversion funnel (truth: GA4 + Woo)
4) Lifecycle + email (truth: email platform once connected)
5) Pipeline (leads/collectors) (truth: CRM + manual)
6) What to do next (only L1–L3 unless explicitly approved)

### Summary → explanation → evidence → action flow (draft)

- **Summary**: changes + deltas + confidence + freshness
- **Explanation**: top causes + counterfactuals + assumptions
- **Evidence**: source citations, joins, missingness, staleness
- **Action**: L1 recommendation → L2 drafts → L3 execution-ready package → approval → (optional) L4 execution → L5 learning

## 16) Evidence references (audit anchor list)

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
