# Decision Dashboard Checkpoints

## Phase 1 – Decision-first top layer
- Command Feed merged from Marketing Command + Connected Insights
- Promote / Protect action board replacing Product Performance
- Status Banner consolidation (audit notice + freshness strip)

## Phase 2 – Performance/Funnel/Paid additions
- Performance Pulse (replaces Revenue Trend chart)
- Single Funnel Leak callout
- Conditional Paid Pulse
- Demoted supporting surfaces (pipeline/collectors/ops stay below fold unless escalated)

## Live-data proof (2026‑06‑18)
- `op run --env-file=.env --env-file=.env.website -- pnpm website:run`
- `op run --env-file=.env --env-file=.env.website -- pnpm marketing:run`
- Screenshot: `artifacts/dashboard-decision-live.png`
- Panels populated with GA4/Woo/Meta data; Command Feed + Promote/Protect + Funnel Leak + Paid Pulse verified.

## Phase 2.5 – Data reliability (2026‑06‑18)
- Performance Pulse now uses real prior-window telemetry (revenue/orders/AOV/conversion/sessions) sourced from Supabase commerce snapshots.
- Cron OFF confirmed as an intentional `scheduler_control` flag (`cronEnabled: false`, note: "Cron disabled pending audit").
- Decision: keep cron disabled until scheduler audit approvals are complete.
- **Cron Step 1 (2026‑06‑18)** – Safe snapshot jobs re-enabled (`ceo-digest`, `deliverable-harvest`, `industry-news-pulse`, `scoreboard-refresh`, `weekly-summary`). Verification run completed; no alerts/outreach/tasks were created.

## Known outstanding items
- Cron still OFF during audit mode.
- Performance Pulse needs a reliable prior-window comparator feed (currently labels as “Need comparator”).
- KPI row + lower panels remain report-oriented; redesign deferred until Phase 3.
- Lint failures exist only in legacy untouched files (`ProofOfWorkPanel.tsx`, `queries.createOpportunity.test.ts`, `warroom-*.cjs`).

## Freeze notice
- Dashboard feature work is frozen after Phase 2 proof.
- Do **not** begin Phase 3 (KPI/sparkline, legacy cleanup, new panels) without explicit approval.
- Scheduler automation remains disabled until the safety audit (below) is approved.

## Phase 3C – Agent Console v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Agent states surfaced:
  - Avery – live executive/operator directives (read-only summary)
  - Sloan – live with manual POST `/api/agents/sloan/generate-actions` button
  - Lyra – blocked pending engagement_rate + cultural_relevance metrics
  - Noah – live read-only partnerships/pipeline insights
- Sloan endpoint proof: prod runs returned `actions_created: 0`, `actions_skipped_duplicate: 4`, `actions_skipped_low_confidence: 1`, with signals `[aov_gap, conversion_gap, checkout_drop, product_concentration, momentum_winner]`.
- Overview read-only proof: consecutive GET `/api/dashboard/overview` calls kept `preparedActions.length = 17`.
- Screenshot: `business-dashboard/artifacts/dashboard-agent-console-prod.png`.
- Guardrails reaffirmed: overview route read-only, agents approval-first, no scheduler/autonomy/outbound activity.

## Social Connector Scaffold (2026‑06‑21)
- Added `pnpm social:run` with Meta Graph normalization + Lyra/Noah wiring; currently blocked until Page-scoped token + IG Business ID are stored in 1Password.
- Setup doc: `docs/dashboard/social-connector-setup.md` (lists required envs, scopes, verification endpoints, and the `op run --env-file=.env --env-file=.env.meta -- pnpm social:run` command).

## Social Snapshot Persistence v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- `pnpm social:run` (via `op run --env-file=.env --env-file=.env.meta -- pnpm social:run`) pulls 5 real IG posts and uploads to Supabase `dashboard_snapshots` (`key = social_content`, `generatedAt ≈ 2026-06-21T18:30Z`).
- Snapshot contains populated metrics (reach, likes, comments, shares, saves, totalInteractions, engagementRate). Local fallback JSON still written.
- `/api/dashboard/overview` consumes `socialContent` read-only; `preparedActions.length` unchanged across repeated calls.
- Lyra Agent Console now emits the DreamBIG carousel recommendation with real metrics; update captured at `business-dashboard/artifacts/dashboard-agent-console-social-prod.png`.
- Guardrails remain: no posting/publishing/comments/DMs/scheduling/ad edits/outbound actions/scheduler or autonomous execution.

## Noah Partnership Feed v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- `pnpm partnership:run` (via `op run --env-file=.env --env-file=.env.meta -- pnpm partnership:run`) uploads `dashboard/data/opportunities/latest.json` to Supabase `dashboard_snapshots` (`key = partnership_feed`, `generatedAt = 2026-06-21T19:00Z`, 2 items).
- Live entries: Naismith Hall of Fame induction art capsule (high urgency) and Mariners/Ichiro charity series (medium urgency); sample entries are ignored.
- `/api/dashboard/overview` exposes `partnershipFeed` read-only; repeated calls keep `preparedActions.length = 17`.
- Agent Console Noah recommendation: HoF capsule with why-now evidence, Keegan angle, recommended art concept, next manual action, Prepared-Action hint; screenshot `business-dashboard/artifacts/dashboard-agent-console-partnership-prod.png`.
- “Future External Opportunity Radar” documented in `docs/dashboard/partnership-feed-setup.md` but not yet implemented (blocked until safe sources defined).
- Guardrails remain: no outreach/emails/DMs/posting/publishing/scheduler/autonomous execution.

## Noah External Opportunity Radar Design v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Documented future source categories (sports business news, entertainment/musician releases, sponsorship/brand campaigns, museum/Hall of Fame/milestone calendars, charity galas, product launches, collector-market news) in `docs/dashboard/partnership-feed-setup.md`.
- Extended feed schema + deterministic scoring rules (timeliness, relevance, relationship proximity, cultural momentum, charity potential, revenue impact, urgency/confidence). No external ingestion yet.
- Agent Console copy now states “Internal feed populated; External Radar awaiting curated sources.”
- Supabase snapshots (`social_content`, `partnership_feed`) refreshed post-deploy; `/api/dashboard/overview` remains read-only with `preparedActions.length = 17` across repeated calls.
- Lyra recommendation (DreamBIG IG carousel) + Noah recommendation (Hall of Fame capsule) proven in production; screenshot `business-dashboard/artifacts/dashboard-agent-console-social-partnership-prod.png`.
- Guardrails still active: no crawling, scheduler, automation, outreach, emails, DMs, posting/publishing, ad or website edits.
- External Opportunity Radar is documented/design-ready but intentionally not activated yet.

## Lyra + Noah Prepared Actions v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- New manual endpoints: `POST /api/agents/lyra/generate-actions` (social snapshot) and `POST /api/agents/noah/generate-actions` (partnership snapshot).
- Manual-only: not called from `/api/dashboard/overview`, dashboard load, or any scheduler/background job.
- Dedupe proof: first run creates one draft per agent, second run returns `actions_skipped_duplicate: 1` (dedupe keys `lyra:social:18067083008430614`, `noah:opportunity:naismith.hall.of.fame.2026`).
- Prepared Actions staged: “Stage DreamBIG content drop” + “Prep Naismith Basketball Hall of Fame induction capsule” (evidence, source, why-it-matters, manual next action, draft asset; no execution capability).
- `/api/dashboard/overview` read-only: repeated calls keep `preparedActions.length = 19`.
- Screenshot: `business-dashboard/artifacts/dashboard-prepared-actions-lyra-noah.png`.
- Guardrails unchanged: no outreach, emails, DMs, posting, publishing, scheduling, Meta edits, website edits, automation, or autonomous execution.

## Command Queue Prioritization v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Added deterministic scoring (`risk + confidence + category + freshness + data quality + source bonus`) to rank Prepared Actions; labels: Do next, Review soon, Backlog, Blocked.
- Top Actions panel surfaces the highest‑priority three items with agent, category, priority label, evidence, why-it-matters, confidence, and “Next manual step”. Screenshot: `business-dashboard/artifacts/dashboard-priority-panel-prod.png`.
- Current top 3: Prep Naismith HoF induction capsule (Noah), Stage DreamBIG content drop (Lyra), Promote momentum winner: Ronald Acuna Jr (Topps) (Sloan).
- Full queue remains unchanged; `/api/dashboard/overview` is read-only (two calls keep `preparedActions.length = 19`).
- Guardrails intact: dashboard load creates nothing; no approve/send/publish/execute controls added; no scheduler, automation, outbound actions, emails, DMs, posting, publishing, website edits, Meta changes, or customer/collector exposure.

## Prepared Action Lifecycle v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Lifecycle mapping uses existing Supabase statuses (no schema migration):
  - `draft` → Pending review
  - `ready_for_review` → Ready for manual work
  - `approved` → In progress
  - `manually_executed` → Completed (manual)
  - `rejected` → Dismissed
  - `archived` → Blocked
- UI buttons now expose only manual-safe actions (“Mark ready for manual work”, “Mark in progress”, “Mark completed”, “Dismiss”, “Mark blocked”). PATCH `/api/prepared-actions/{id}` is reused; no new endpoints added.
- Status update proof: DreamBIG action moved draft → ready via the new control; completed/dismissed items drop out of Top Actions automatically.
- Top Actions panel shows only pending/ready/in-progress items; screenshot paths: `business-dashboard/artifacts/dashboard-priority-panel.png` (local) and `business-dashboard/artifacts/dashboard-priority-panel-prod.png` (prod).
- `/api/dashboard/overview` remains read-only (two calls keep `preparedActions.length = 19`). Dashboard load never mutates actions.
- Guardrails unchanged: no send/publish/execute, no scheduler/automation/outbound/emails/DMs/posting/website edits/Meta changes/customer exposure.

## Executive Command Brief v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Brief panel added above Top Actions; uses existing Prepared Action priority scoring + snapshot freshness to answer “What should Keegan pay attention to today?”.
- Current focus: “Prep Naismith Basketball Hall of Fame Induction Art Capsule” (manual next step: “Build 2-page PDF concept + prepare intro note”). Opportunity: DreamBIG content drop; evidence pulled from those Prepared Actions only.
- No new data sources, endpoints, automation, or LLM loops; strictly deterministic.
- `/api/dashboard/overview` remains read-only (two calls keep `preparedActions.length = 19`, statuses unchanged).
- Screenshot: `business-dashboard/artifacts/dashboard-executive-brief-prod.png`.
- Guardrails still active: no send/publish/schedule/execute/contact controls, no scheduler/automation/outbound/emails/DMs/posting/website edits/Meta changes/customer exposure.

## Prepared Action Detail Review v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- Prepared Actions now include expandable detail views showing evidence, source references, risk, confidence, data quality, dedupe key, timestamps, lifecycle status, manual next step, and draft asset/brief (if present).
- Verified examples: Lyra’s “Stage DreamBIG content drop,” Noah’s “Prep Naismith HoF induction capsule,” Sloan’s “Promote momentum winner: Ronald Acuna Jr.” — each displays the appropriate evidence and draft asset within the queue.
- `/api/dashboard/overview` remains read-only (two calls keep `preparedActions.length = 19`; no status changes on load).
- Screenshot: `business-dashboard/artifacts/dashboard-prepared-action-detail-prod.png`.
- Guardrails unchanged: no send/publish/schedule/execute/contact controls, no scheduler/automation/outbound/emails/DMs/posting/website edits/Meta changes/customer exposure.

## Signal Charts v1 (2026‑06‑21)
- Production URL: https://keegan-dashboard.fly.dev/
- SignalChartsPanel renders four visual modules: revenue snapshot (WooCommerce), funnel leak (GA4 sessions → add-to-cart → checkout → purchases), prepared action lifecycle, and social pulse (Instagram posts). All data comes from existing snapshots only.
- Missing or stale data displays “Data unavailable or stale.” No fabricated values.
- `/api/dashboard/overview` remains read-only (two calls keep `preparedActions.length = 19`, statuses unchanged).
- Screenshot: `business-dashboard/artifacts/dashboard-signal-charts-prod.png`.
- Guardrails intact: no new endpoints, scheduler, automation, outbound behavior, emails, DMs, posting, publishing, website edits, Meta changes, customer exposure, or execution controls.

## Dashboard Visual Hierarchy Slice 1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Fly deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<VISUAL_SLICE1_DEPLOYMENT_ID>` (monitor log in deploy session `vivid-glade`).
- Vercel hook triggered automatically; Vercel still serves the legacy placeholder/404 `/dashboard` (non-blocking for Fly prod).
- Visual hierarchy improvements: combined top command area (Status Banner + KPIs), compact KPI tiles, Executive Command Brief card grid, lean Signal Charts (Woo/GA4/action lifecycle/social pulse), scheduler noise collapsed, Agent Console/Prepared Actions unchanged aside from spacing.
- Trust labels: Panel badges now emit `Fresh`, `Stale`, `Data light`, `Missing`, `Manual only`, `Read-only`; no stale/partial panel displays generic “LIVE”.
- `/api/dashboard/overview` read-only proof (prod): two authed GETs (x-dashboard-secret) kept `preparedActions.length = 19`, statuses identical, snapshot timestamps unchanged.
- Production screenshots: `business-dashboard/artifacts/dashboard-visual-slice/top-command-prod.png`, `signal-charts-prod.png`, `agent-console-prod.png`, `prepared-actions-prod.png` (before/after set lives in same folder).
- Guardrails still active: no new data sources/endpoints/schedulers/agents/automation/outbound actions/execution controls/website edits/Meta changes/customer exposure; Agent Console + Prepared Actions remain manual-only.

## Dashboard Visual Hierarchy Slice 2 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<VISUAL_SLICE2_DEPLOYMENT_ID>`; Vercel deploy hook fired (Vercel `/dashboard` placeholder unchanged and non-blocking).
- Agent Console: trust/data-state chips + best move/manual next step tiles now surface first; evidence/confidence condensed; secondary details (data sources, missing data, safe actions) tucked behind expand/collapse so cards read like advisor summaries.
- Prepared Actions Queue: lifecycle groups remain but collapsed rows now show title, agent/source, priority, lifecycle status, one-line “why it matters,” manual next step, and draft-asset badge; full metadata/evidence/draft assets/buttons live inside the expanded view.
- `/api/dashboard/overview` read-only proof (prod): consecutive authed GETs kept `preparedActions.length = 19`, statuses identical, snapshot timestamps unchanged (marketing 2026‑06‑19T02:37:46.701Z; website 2026‑06‑21T12:09:43.155Z; meta 2026‑06‑21T13:01:38.021Z; social 2026‑06‑21T19:03:44.820Z).
- Screenshot proof: `business-dashboard/artifacts/dashboard-visual-slice/agent-console-prod-slice2.png`, `.../prepared-actions-prod-slice2.png` (before/after pairs stored alongside).
- Guardrails still active: UI-only changes; no new endpoints/data sources/schedulers/automation/outbound behaviors/execution controls; Agent Console + Prepared Actions remain manual-only; trust labels prevent generic “LIVE”.

## Data Refresh Reliability v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<DATA_REFRESH_RELIABILITY_DEPLOYMENT_ID>`; Vercel hook fired (Vercel `/dashboard` placeholder unchanged/non-blocking).
- Data Freshness panel surfaces six audited sources (Website & Funnel, Marketing Command, Meta Ads, Instagram Content, Partnership Feed, Prepared Actions) with trust/data badges, last refresh timestamps, dependent panels, and manual refresh command guidance (e.g. `op run --env-file=.env --env-file=.env.website -- pnpm website:run`, `... marketing:run`, `... meta:run`, `... social:run`, `... partnership:run`).
- Manual refresh commands are informational only; no dashboard control runs them. Prepared Actions row notes its manual-only status.
- Stale/missing sources show amber/rose badges and bubble warnings into Executive Command Brief + Agent Console; no stale panel shows a generic “LIVE” badge.
- `/api/dashboard/overview` read-only proof (prod): consecutive authed GETs kept `preparedActions.length = 19`, statuses identical, snapshot timestamps unchanged (marketing 2026‑06‑19T02:37:46.701Z; website 2026‑06‑21T12:09:43.155Z; meta 2026‑06‑21T13:01:38.021Z; social 2026‑06‑21T19:03:44.820Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshot: `business-dashboard/artifacts/dashboard-visual-slice/data-freshness-panel-prod.png`.
- Guardrails still active: UI-only work; no new endpoints/data sources/scheduler/automation/outbound behavior; `/api/dashboard/overview` remains read-only.

## Recommendation Quality + Action Usefulness v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<RECOMMENDATION_QUALITY_DEPLOYMENT_ID>`; Vercel hook fired (Vercel placeholder unchanged).
- Recommendation structure: Executive Command Brief now shows “What to do / Why now / Evidence / Expected upside / Manual next step / Confidence / Risk / Data caveat” with stale-data confidence downgrades.
- Top Actions: filters out completed/dismissed/blocked/internal/test items, prioritizes only `do_next`/`review_soon` actions with clear upside/risk context.
- Agent Console: each advisor card highlights best move, manual step, expected upside, risk if ignored, evidence, confidence, and data caveats sourced from the freshness panel.
- Prepared Actions Queue: collapsed cards show upside + risk text; detail view badges stale/data-light/internal/test items so low-value/testing artifacts aren’t promoted.
- Internal/test detection: conservative regex list (e.g., “PhaseA Smoke”, “Prod Dedupe”, “QA Smoke”) flagged none in current production, so no legitimate actions were mislabeled.
- `/api/dashboard/overview` read-only proof (prod): consecutive authed GETs kept `preparedActions.length = 19`, statuses identical, snapshot timestamps unchanged (marketing 2026‑06‑19T02:37:46.701Z; website 2026‑06‑21T12:09:43.155Z; meta 2026‑06‑21T13:01:38.021Z; social 2026‑06‑21T19:03:44.820Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshots: `artifacts/dashboard-visual-slice/executive-brief-prod-rec-quality.png`, `.../top-actions-prod-rec-quality.png`, `.../agent-console-prod-rec-quality.png`, `.../prepared-actions-prod-rec-quality.png`.
- Guardrails still active: UI-only improvements; no new endpoints, scheduler, automation, outbound behavior, or execution controls.

## Decision Range + Marketing/Social Intelligence v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<DECISION_RANGE_DRMSI_DEPLOYMENT_ID>`; Vercel hook fired (placeholder `/dashboard` unchanged).
- Decision Range panel: top of dashboard now shows the 30‑day decision window, 7‑day momentum pulse, comparison period, and latest snapshot context. Range badges appear on KPI tiles, Command modules, Social, Paid, Agent Console, etc., so no module silently mixes windows.
- KPI cleanup: Headline + Quick Scan KPIs display their range, target, and comparison deltas (with “comparison pending” caveats when data is missing) so revenue/AOV/conversion metrics no longer conflict.
- “What Changed” panel: surfaces meaningful last-30-day shifts (revenue/orders/AOV/sessions), social pulse, and newly staged prepared actions for at-a-glance context.
- Social Intelligence: adds “What worked / Next play” cards with inferred hook/subject, best-post metrics, recommendation for repurposing, and snapshot-data warnings (“Latest snapshot,” “Data light”).
- Paid Marketing: distinguishes “Data light” vs. “Refresh/Pause,” highlights missing telemetry, and recommends only safe manual next steps; no scale instructions without purchase evidence.
- Internal/Test queue: Prod Dedupe, Dedupe Clean, Dedupe Test, Meta creative refresh test, and PhaseA Smoke are hidden from the default queue and live in a collapsed “Internal/Test” section so they no longer affect urgency.
- Agent feedback UI: buttons emit UI-only toasts (no POST/PATCH, no persistence) to flag “Useful,” “Needs more evidence,” etc.; confirmed UI-only in prod.
- `/api/dashboard/overview` read-only proof (prod): consecutive authed GETs kept `preparedActions.length = 19`, statuses identical, snapshot timestamps unchanged (marketing 2026‑06‑19T02:37:46.701Z; website 2026‑06‑22T15:22:41.976Z; meta 2026‑06‑22T15:47:49.636Z; social 2026‑06‑21T19:03:44.820Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshots: `artifacts/dashboard-visual-slice/top-area-prod-drmsi.png`, `kpi-area-prod-drmsi.png`, `what-changed-prod-drmsi.png`, `social-prod-drmsi.png`, `paid-marketing-prod-drmsi.png`, `prepared-actions-internal-prod-drmsi.png`, `agent-feedback-prod-drmsi.png`.
- Guardrails still active: UI-only changes; no new data sources/integrations, scheduler, automation, outbound behavior, or execution controls.

## Data Range Accuracy Audit + Label Fix v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Root cause: Woo snapshot totals always powered the dashboard, but the UI echoed the user-selected range (7d/30d). Selecting 7 days changed labels to “Last 7 days” while values stayed 30-day totals, producing the false “$19,625 last 7 days” callout.
- Corrected Woo labeling: all Woo-derived metrics now show `Woo snapshot` badges plus refreshed timestamps. When `windowStart/windowEnd/rangeDays` are missing, the badge states “Source range unavailable” instead of implying Last 7/30 days.
- Metrics marked source range unavailable: Quick KPI revenue/orders/AOV, Product Performance revenue cards, Woo top products, What Changed revenue deltas, and any Woo field without explicit range metadata.
- Source-specific badge behavior: Meta Ads, Instagram, Sales Trends (commerce telemetry), Paid Marketing, and Social Intelligence now use their actual source metadata (e.g., Meta 7-day window, Instagram snapshot dates). Missing metadata surfaces “Range unavailable” rather than fabricated windows.
- Social duplication cleanup: Social Pulse remains a compact leaderboard (top posts, reach, interactions). Social Intelligence now provides interpretation only (what worked, inferred hook/subject, next play, repurpose plan, data caveat) without repeating the leaderboard metrics.
- Failed DashboardShell edit: initial patch failed because the text block shifted; a second targeted edit landed successfully. Final git diff only contains intended code, `pnpm build` ran afterward, and `fly deploy` used that state.
- `/api/dashboard/overview` read-only proof (prod): two authed GETs kept `preparedActions.length = 19`, statuses unchanged (17 draft, 1 ready_for_review, 1 manually_executed), snapshot timestamps stable (marketing 2026‑06‑19T02:37:46.701Z; website 2026‑06‑22T15:22:41.976Z; meta 2026‑06‑22T15:47:49.636Z; social 2026‑06‑21T19:03:44.820Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshots: `artifacts/dashboard-visual-slice/top-area-prod-rangefix.png`, `kpi-area-prod-rangefix.png`, `what-changed-prod-rangefix.png`, `social-prod-rangefix.png`, `paid-marketing-prod-rangefix.png`, `product-performance-prod-rangefix.png`, `sales-trends-prod-rangefix.png`, `prepared-actions-prod-rangefix.png`, `agent-feedback-prod-rangefix.png`.
- Guardrails still active: UI-only adjustments; no new features/endpoints/schedulers/automation/outbound behavior/execution controls. Feedback chips remain UI-only toasts; `/api/dashboard/overview` stays read-only.

## Dashboard Consolidation + Universal Range v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Deploy proof: `fly deploy --remote-only` → `registry.fly.io/keegan-dashboard:<CONSOLIDATION_UNIVERSAL_RANGE_DEPLOYMENT_ID>`; Fly rollout logs confirm machines `896420c6e524e8` / `89642ea663d418` restarted cleanly.
- True selected-range Woo proof:
  - 7d (`range=7d`): revenue $308.92, orders 1, AOV $308.92 (commerceTelemetry.woo.summary).
  - 30d (`range=30d`): revenue $988.53, orders 8, AOV $123.57 (commerceTelemetry.woo.summary).
- 6M / 12M / YTD behavior: Supabase currently lacks multi-month Woo telemetry; cards show “Unavailable for selected range” + “Latest Woo snapshot $19,625 · 50 orders” instead of faking totals. Requirement: ingest/order-level Woo history so `get_woo_metrics` can emit 180d/365d/YTD aggregates.
- Universal range presets: 7d, 30d, 6M (180d), 12M (365d), YTD, custom. `DateRangeControls` + API query params share the same contract so every panel reads consistent ranges.
- Duplicate KPI consolidation: Quick KPI Scan now limits itself to one Woo card per metric with explicit range badges; Headline KPIs keep scoreboard context; redundant revenue/orders/AOV copies were removed from lower panels.
- Funnel correction: Standalone bars only render when GA4 provides the stage counts; missing stages show “Tracking incomplete” warnings + manual next steps instead of shrunken zero bars.
- Social cleanup: Social Pulse is the metric leaderboard; Social Intelligence only references hooks/interpretation/next play, eliminating the repeated metric cards.
- Prepared Action completion loop: Quick buttons map to existing PATCH transitions (“I did this” → manually_executed, “Skip”/“Wrong priority” → archived, “Needs evidence” → rejected) plus a UI-only “Request reassessment” toast. No automation or agents run when those buttons fire.
- Overview read-only proof: consecutive authed GETs kept `preparedActions.length = 19`, statuses unchanged (17 draft / 1 ready_for_review / 1 manually_executed), snapshot timestamps stable (marketing 2026‑06‑19T02:37:46Z; website 2026‑06‑22T15:22:41Z; meta 2026‑06‑22T15:47:49Z; social 2026‑06‑21T19:03:44Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshots: `artifacts/dashboard-consolidation/kpi-selected-range.png`, `signal-charts.png`, `social-intel.png`, `funnel-panel.png`, `prepared-actions-loop.png`.
- Guardrails still active: `/api/dashboard/overview` remains read-only; no new endpoints, schedulers, automation, outbound behavior, or execution paths were added; manual-only controls continue to gate all mutations.

## Woo Historical Coverage + Long-Range Commerce v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Woo audit: Supabase `raw_woocommerce_orders` + `raw_woocommerce_order_items` currently hold 90 completed orders spanning 2026‑03‑08 → 2026‑06‑22. Anything earlier is unavailable until a backfill runs.
- RPC update: `get_woo_metrics` was replaced directly in production via `psql ... -f tmp/get_woo_metrics.sql`; schema.sql now matches the deployed function (day/week/month buckets, full metadata, products, recent orders).
- 7d proof: revenue $308.92, orders 1, AOV $308.92, top product Gary Payton $300 (no totals exceeding the window).
- 30d proof: revenue $911.30, orders 7, AOV $130.19, top products sum to $911.30; panel only shows selected-range data when `isSelectedRange` is true.
- Product Performance: falls back to the Woo snapshot only when selected-range products are unavailable, labeling rows “Snapshot fallback.”
- 180d buckets: 17 weekly buckets (coverage limited to Mar 8–Jun 22); Sales Trends tooltips now read “Week of …” so the aggregation is explicit.
- Limitation: No Woo history before 8 Mar 2026—true 6M/12M/YTD accuracy still requires a backfill. Long-range panels continue to mark partial coverage and show fallback context.
- `/api/dashboard/overview` read-only proof: consecutive 30d GETs kept `preparedActions.length = 19`, statuses unchanged (17 draft, 1 ready_for_review, 1 manually_executed), and snapshot timestamps stable (marketing 2026‑06‑19T02:37:46Z; website 2026‑06‑22T15:22:41Z; meta 2026‑06‑22T15:47:49Z; social 2026‑06‑21T19:03:44Z; partnership 2026‑06‑21T19:00:00Z).
- Screenshots: `artifacts/dashboard-consolidation/long-range/product-performance-7d.png`, `product-performance-30d.png`, `sales-trends-180d.png`, `kpi-30d.png`.
- Guardrails still active: read-only dashboard loads, no scheduler/automation/outbound actions/execution controls; we did not run the Woo backfill yet.

## Woo Backfill Runner Dry-Run v1 (2026‑06‑22)
- Files changed: new `scripts/backfill-woo-orders.ts` runner + `woo:backfill` npm script.
- Runner options: `--lookback-days`, `--from`, `--to`, `--limit-pages`, `--dry-run` (default), `--write` (required to mutate).
- Dry-run default: without `--write`, the script only fetches + normalizes, logs sanitized samples (customer email redacted), and skips Supabase writes.
- Missing-env guard: `pnpm tsx scripts/backfill-woo-orders.ts --lookback-days 1 --dry-run` fails immediately with `Missing required env var: WOO_BASE_URL` when Woo creds are absent.
- Write path locked: only `--write` triggers Supabase upserts (orders `onConflict: order_id`; line items `onConflict: line_item_id,order_id`, preserving idempotency).
- Dry-run commands queued (pending 1Password/Woo env injection):
  - `op run --env-file=.env --env-file=.env.website -- pnpm tsx scripts/backfill-woo-orders.ts --lookback-days 180 --dry-run`
  - `op run --env-file=.env --env-file=.env.website -- pnpm tsx scripts/backfill-woo-orders.ts --lookback-days 365 --dry-run`
  - `op run --env-file=.env --env-file=.env.website -- pnpm tsx scripts/backfill-woo-orders.ts --from 2026-01-01 --dry-run`
- Blocker: 1Password CLI isn’t signed in and `.env.website` isn’t KEY=value, so Woo credentials can’t load yet. Dry-runs will proceed once `op signin` (or a proper env file) is available.
- Confirmation: no Supabase writes occurred; dashboard remained read-only; no scheduler/automation/outbound paths were added.

## Woo Historical Coverage + Long-Range Commerce v1 (2026‑06‑22)
- Production URL: https://keegan-dashboard.fly.dev/
- Range telemetry: `get_woo_metrics` now emits `summary`, `timeseries`, `products`, `recentOrders`, and full metadata (`rangeStart/End`, `rangeDays`, `effectiveStart`, `dataStartDate`, `isSelectedRange`, `isFallback`, `fallbackReason`, `lastRefreshedAt`). 7d/30d panels consume the selected-range truth; 180d/365d/YTD badge themselves as partial coverage instead of faking totals.
- Current Woo coverage: Supabase `exec_dashboard.raw_woocommerce_orders` contains 90 completed orders spanning 2026‑03‑08 → 2026‑06‑22. Any range starting before 8 Mar 2026 is flagged as partial with “Data available from Mar 8, 2026.”
- Backfill requirement: to make 6 M/12 M/YTD fully accurate we must ingest historical Woo orders prior to 2026‑03‑08 (bulk export or API backfill). Until then, dashboards continue to show “Woo data partial” warnings for those windows.
- Prepared Actions: “I did this,” “Skip,” “Needs evidence,” “Wrong priority,” and “Request reassessment” buttons map to existing PATCH transitions; Request reassessment stays UI-only. No automation or outbound actions were added.
- `/api/dashboard/overview` proof: two authed GETs kept `preparedActions.length = 19`, statuses identical (17 draft, 1 ready_for_review, 1 manually_executed), and snapshot timestamps unchanged (marketing 2026‑06‑19T02:37Z; website 2026‑06‑22T15:22Z; meta 2026‑06‑22T15:47Z; social 2026‑06‑21T19:03Z; partnership 2026‑06‑21T19:00Z). Dashboard load remains read-only.
## Scheduler safety audit (Phase 2.5)
- Jobs classified (see main report) into:
  - **SAFE SNAPSHOT** (read-only + system_state writes): `deliverable-harvest`, `ceo-digest`, `industry-news-pulse`, `scoreboard-refresh`, `weekly-summary`.
  - **INTERNAL ENFORCEMENT/ALERTS** (creates alerts/tasks but no external outreach): `daily-health-check`, `evening-closeout`, `proof-enforcement`, `war-room-digest` (only fires in war-room mode).
  - **HIGH IMPACT / RUN AGENTS** (must stay manual): `agent-idea-pulse`, `daily-agent-cycle`, `midweek-opportunity-pulse`, `weekly-command-cycle`.
- Recommended re-enable plan: step 1 = SAFE SNAPSHOT jobs only; step 2 = add enforcement/alerts once reviewed; keep high-impact agent runners manual until explicitly approved.
- Step 2 guardrails added (2026‑06‑18): enforcement modes per job stored in `system_state.scheduler_enforcement_modes`.
  - Modes: `disabled`, `observe_only` (read-only reporting), `alert_only` (alerts allowed, no tasks/messages), `active` (full behavior).
  - Current modes: `daily-health-check` = alert_only, `evening-closeout` = observe_only, `proof-enforcement` = disabled, `war-room-digest` = disabled.
  - Observe-only verification complete via direct API calls (no alerts/messages/tasks written; results returned simulated actions only).
  - Noise suppression (2026‑06‑18): observe-only reports now aggregate resolve spam, cap high/medium alert candidates to the top five, log suppressed counts by severity, and write summaries to `system_state.scheduler_observe_*`.
- Alert-only pilot (2026‑06‑18): `daily-health-check` limited to ≤3 high-severity alerts/run with 24h cooldown; first run created alerts `d44502d2-ef4b-48ac-beca-60a34aec255e` (“Research 25 prestige-fit targets”) and `9087bf13-b837-419d-b6bf-b8fc14039667` (“Design premium pricing architecture”). `evening-closeout` remains observe_only; other jobs remain disabled.

## Scheduler control state (current)
- **Active (Step 1)**: `ceo-digest`, `deliverable-harvest`, `industry-news-pulse`, `scoreboard-refresh`, `weekly-summary`.
- **Step 2**: `daily-health-check` = alert_only pilot (cap 3, 24h cooldown, lifecycle required); `evening-closeout` = observe_only; `proof-enforcement` = disabled; `war-room-digest` = disabled.
- **Step 3 / agents**: `agent-idea-pulse`, `daily-agent-cycle`, `midweek-opportunity-pulse`, `weekly-command-cycle` all disabled.
- **Alert lifecycle controls**: statuses `unresolved/acknowledged/resolved/suppressed` stored in `scheduler_alert_lifecycle`; alert-only dispatcher honors dedupe + cooldown + lifecycle states (acknowledged/suppressed alerts skipped automatically).
- **No outbound actions**: automated jobs still barred from tasks, War Room posts, agent messages, outreach, emails, customer messages, or campaign edits without explicit approval.
- **Alert policy config**: `system_state.scheduler_alert_policy` stores category taxonomy (eligible: stale_critical_task; grouped digest: conversion_hygiene; manual-review: stalled_opportunity, pending_approvals). StatusBanner shows current summary + counts from observe-only reports.

## Phase 3A – Intelligence Layer (accepted 2026‑06‑18)
- **Sales Trends / Product Performance / Funnel Performance / Prepared Actions preview** ship with guardrails:
  - GA4 + Supabase data only (no new ingestion, no new cron jobs).
  - Woo-only buyers masked to First + Last Initial (“Needs verification”) and stale collector telemetry surfaced (“Most recent touch 44d ago”).
  - Repeat-buyer detection intentionally blocked until Woo customer IDs or deduped history exists (panel copy states this requirement explicitly).
  - Prepared Actions preview stays read-only; Command Feed + Promote/Protect remain the only action feeds.
- Live proof: `artifacts/dashboard-phase3a-live.png`.

## Phase 3B‑1 – Paid/Traffic/Collector panels (accepted 2026‑06‑18)
- **Paid Performance Deep Dive** renders spend/purchases/ROAS/CTR/CPC with “Too thin to judge” badge when purchases <3; recommendations never say “scale” unless ROAS ≥2 with solid sample.
- **Traffic Sources Deep Dive** highlights channel & device mix with a banner: “GA4 purchase-by-channel data is not ingested yet; use this panel to direct attention, not attribution.”
- **Collector Signals panel** uses existing `collector_relationships`, masks Woo-only names, labels stale touchpoints, and calls out Woo-only imports as “Needs verification before outreach.”
- Proof screenshots: `artifacts/dashboard-phase3b1.png`, `artifacts/dashboard-phase3b1-meta.png`.

## Phase 3B‑2 – Prepared Actions Queue v1 (accepted + verified 2026‑06‑19)
- `prepared_actions` table + API endpoints:
  - `GET /api/prepared-actions` filters by status/category/risk/source.
  - `POST /api/prepared-actions` creates draft rows (evidence required, dedupe enforced while status ∈ draft/ready/approved).
  - `PATCH /api/prepared-actions/[id]` supports manual transitions only (`draft → ready_for_review → approved/rejected → manually_executed → archived`). Rejects require reasons; manual execution requires a note.
- Dashboard queue UI replaces the old preview: grouped columns by status, risk/confidence/data-light chips, buttons limited to “Mark ready”, “Approve for manual execution”, “Reject”, “Mark manually executed”, “Archive”. Screenshot: `artifacts/dashboard-phase3b2-prepared-actions.png` / verification run `artifacts/dashboard-prepared-actions-verification.png`.
- Safety verification (`PREPARED_ACTIONS_FILE_STORE=1` mock ledger) covered:
  - **Valid transitions**: draft→ready, ready→approved, ready→rejected, approved→manually executed, non-terminal→archived.
  - **Invalid transitions blocked**: draft→approved, rejected→approved, manually_executed→approved, archived→ready, manually_executed→active.
  - **Validation**: POST without evidence/with invalid category fails; PATCH rejected without reason fails; PATCH manually_executed without note fails.
  - **Dedupe**: duplicate active drafts rejected; archived actions free the dedupe key (Replacement Action proved this).
  - **Side effects**: approvals/manual execution update ledger only (file-store writes + toasts). No emails, Meta changes, website edits, checkout tweaks, collector outreach, task creation, scheduler mutations, or agent runs occurred.
- Prepared Actions Queue therefore serves purely as an approval ledger awaiting manual execution.
