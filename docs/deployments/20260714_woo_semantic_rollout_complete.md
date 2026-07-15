# 2026-07-14 Woo Semantic Rollout Completion (Phase 2B.1B)

## Objective
Cut over the first-party dashboard from the legacy UTC-bucketed WooCommerce RPC to the new Pacific-time semantic metrics pipeline with automatic legacy fallback, ensuring API compatibility, zero data regressions, and a documented rollback path.

## Architecture

### Before
- Dashboard API called `public.get_woo_metrics` (UTC buckets) directly from the Next.js route.
- Semantic RPC (`exec_dashboard.get_woo_metrics_semantic`) existed only for shadow validation and could be invoked exclusively by the Supabase `service_role`.
- Runtime logic defaulted to legacy mode (`WOO_METRICS_MODE=legacy`), optionally running semantic requests in parallel (`shadow`) for comparison logs.

### After
- Production mode is `semantic`; `fetchWooMetricsWithMode` now serves semantic telemetry and only falls back to legacy on RPC failure.
- API route hits `public.get_woo_metrics_semantic_v1`, a SECURITY DEFINER wrapper that proxies to the exec schema function so the dashboard never needs elevated privileges.
- Semantic adapter normalizes `currency_totals`, enforces single-currency safety, strips partial/future days, and surfaces metadata for downstream UI work.
- Legacy RPC remains deployed but is only used when semantic errors trigger the guarded fallback.

## Database changes
- `20260713_add_woo_semantic_rpc.sql`: installs `exec_dashboard.get_woo_metrics_semantic(date,date)` plus privileges and schema grants.
- `20260714_add_woo_semantic_wrapper.sql`: exposes `public.get_woo_metrics_semantic_v1(date,date)` as the only callable surface for the dashboard and locks execution to `service_role`.
- Matching install/rollback artifacts are retained under `supabase/deployment/20260713_*` and `20260714_*` with verified checksums.
- No tables or grants outside the RPC wrapper were modified during cutover.

## Application changes
- `fetchWooMetricsWithMode` learned the semantic mode, the adapter, and error-classified fallback path while keeping the API response shape unchanged.
- Woo semantic tests (`test/woo-metrics.test.ts`) now cover multi-currency rejections, metadata propagation, and adapter safety rules.
- Temporary `[woo-metrics][shadow]` info logs used during rollout were removed to reduce production noise (warnings/errors remain for semantic failures).

## Wrapper design rationale
- SECURITY DEFINER wrapper keeps the exec schema private while letting the dashboard reuse the existing `service_role` Supabase client.
- Wrapper is additive, so outsiders cannot bypass ACLs, and the legacy RPC stays untouched for emergency fallback.
- Having both public and exec versions lets migrations install/rollback without changing consumers.

## Validation summary
- Local: `npm run test` (Node test runner), `npx tsc --noEmit`, and targeted ESLint on touched files.
- Shadow: 25 mixed-range comparisons (today-mapped 30d, 7d, 30d, 90d, PT-boundary) with zero semantic errors.
- Post-cutover: semantic-only verification for 7d/30d/90d/custom boundary/empty ranges via Fly SSH with `x-dashboard-secret` header.
- Deployment: Fly secrets update + single deploy of the Next.js app, both recorded in Fly logs.
- Observability: No `[woo-metrics][semantic][fallback]` or `[woo-metrics][shadow][semantic-error]` events after cutover.

## Production rollout timeline (UTC)
| Time | Event |
| --- | --- |
| 2026-07-13T20:05Z | Semantic exec RPC installed (Phase 2B.1A) |
| 2026-07-14T19:23Z | Public wrapper installed, semantic shadow validation resumed |
| 2026-07-14T23:28Z | Final shadow comparison logs captured (25-range sweep) |
| 2026-07-14T23:33Z | `WOO_METRICS_MODE` flipped to `semantic` via Fly secrets |
| 2026-07-14T23:35Z | Next.js app redeployed with semantic mode |
| 2026-07-15T00:17Z | Unified telemetry + executive brief deployment (`deployment-01KXHJ1NK61YVYDS05T6TF302R`) completed |
| 2026-07-15T00:18Z | 7d/30d/90d/boundary/partial-day/empty API validations run via Fly SSH (all HTTP 200) |
| 2026-07-14T23:38Z | Post-deploy API checks (7d/30d/90d/boundary/empty) confirmed success |

## Final production state
- `WOO_METRICS_MODE=semantic`; automatic legacy fallback remains enabled for RPC errors only.
- `public.get_woo_metrics_semantic_v1` calls the exec function and is the sole dashboard entry point.
- No semantic errors or legacy fallbacks have occurred since the cutover.
- Logs contain only warning/error events for semantic issues; debug comparison logs are removed.
- Legacy RPC + wrapper install/rollback SQL scripts remain checked in for auditability.

## Intentional Pacific vs UTC behavior change
The semantic RPC buckets orders in America/Los_Angeles. Legacy 7-day windows occasionally included an extra UTC order (e.g., July 7 23:xx PT). After the cutover, 7-day ranges now align to completed PT business days, so counts during the transition window may differ by ±1 order. This is expected and documented in the dashboard backlog for UI messaging.

## Rollback procedure
1. `fly secrets set WOO_METRICS_MODE=legacy` for `keegan-dashboard`.
2. `./scripts/deploy.sh` to redeploy the dashboard.
3. Confirm `/api/dashboard/overview` responds and watch Fly logs for `[woo-metrics][legacy]` errors (none expected).
4. Semantic wrapper and RPC stay installed; no database rollback is required unless the semantic code itself needs to be removed.

## Lessons learned
- Keep semantic metadata and adapter logic in one place so UI work can read from a single contract.
- Shadow comparison logging was valuable during rollout but noisy afterward; plan disposable observability with clear cleanup criteria.
- Using a public wrapper simplified permissions and removed the need for high-privilege clients inside the Next.js app.
- Early installation of rollback SQL saved time during validation—having artifacts ready avoids scrambling if production issues occur.

## Future enhancement opportunities
- Surface semantic metadata (PT window, freshness, coverage, future-day warnings) in the dashboard UI.
- Add automated alerting if semantic fallbacks ever trigger after the mode switch.
- Expand Woo ingestion to capture refunds/adjustments so semantic totals and AOVs include full net revenue context.
- Harden semantic coverage signals by cross-referencing ingestion completeness (e.g., per-day 0-order vs missing-ingestion detection).
- Revisit GA4 and FunnelKit adapters to adopt the same metadata model for cross-channel consistency.

## Deployment verification (2026-07-15)
- **UTC execution timestamp:** 2026-07-15T00:17:45Z
- **Fly deployment ID:** `deployment-01KXHJ1NK61YVYDS05T6TF302R`
- **Git commit:** `b71006faff0021aa9f5fd53c5a0fb130eff71ff4`
- **Files changed:**
  - `src/lib/types/dashboard.ts`
  - `src/lib/supabase/queries.ts`
  - `src/lib/telemetry/intelligence.ts`
  - `src/app/api/dashboard/overview/route.ts`
  - `src/components/dashboard/ExecutiveBriefPanel.tsx`
  - `src/components/dashboard/DashboardShell.tsx`
  - `test/telemetry-intelligence.test.ts`
  - `test/woo-metrics.test.ts`
- **Test/build commands:**
  - `node --test`
  - `npx tsc --noEmit`
  - `npx eslint <changed files>`
  - `npm run build`
  - `./scripts/deploy.sh`
- **Validated API ranges:** 7d, 30d, 90d, custom boundary (2026-07-12–2026-07-13), partial current day, empty (2024-01-01).
- **API compatibility:** Existing response fields unchanged; new optional fields (`telemetryMetadata`, `telemetryHealth`, `executiveInsights`) are additive and null-safe.
- **Rollback procedure:** Revert to previous commit, redeploy via `./scripts/deploy.sh`, or temporarily set `WOO_METRICS_MODE=legacy` if Woo semantic data needs to be bypassed.
- **Database changes:** None (application-only deployment).
