# Milestone 8 — Live Data Reconciliation (Read-only)

This document preserves the **sanitized** proof that the Milestone 8 executive BI vertical slice was validated against **live Supabase/Woo telemetry** in read-only mode.

No secrets, credentials, PII, or raw tokens are included.

## Live-data proof

- Server launched with:
  - `DASHBOARD_READONLY=1`
  - environment injected via 1Password service account (`op run --env-file .env.woo.ci`)
- API proof file:
  - `.artifacts/milestone-8-live-reconciled/live-mode-proof.json`

Key proof fields (from the saved JSON):
- `dataMode: LIVE_DATA`
- `dataModeReason: DASHBOARD_READONLY=1 (no DB writes; war room thread creation disabled)`
- Resolved range (custom): **2026-07-23 → 2026-07-29**
- Woo telemetry:
  - `source: selected_range_telemetry`
  - `completeness: complete`
  - `definitionVersion: woo_paid_net_v1`
  - coverage window (proven by ingestion run): **2025-07-31 → 2026-07-29**

## Ranges validated

All reconciliation outputs are machine-readable:

- `.artifacts/milestone-8-live-reconciled/reconciliation-report.json`
- `.artifacts/milestone-8-live-reconciled/source-reconciliation.json`

Validated ranges (requested == resolved):

1. **Previous completed 7-day**: 2026-07-23 → 2026-07-29
2. **Previous completed 30-day**: 2026-06-30 → 2026-07-29
3. **Completed custom (in coverage)**: 2026-07-23 → 2026-07-26
4. **Future empty**: 2099-01-01 → 2099-01-07
5. **DST span check**: 2026-03-05 → 2026-03-15

## Direct Supabase reconciliation

For each range, Woo values reported by the dashboard overview API were recomputed directly from:

- `public.woo_order_telemetry_v1` (order-level telemetry)
- `public.woo_ingestion_runs_v1` (coverage + definition proof)

and compared for **exact equality** (cents + counts + coverage metadata).

Result:
- Revenue cents: **exact match**
- Refunded cents: **exact match**
- Order count: **exact match**
- Coverage (proven start/end + definition version): **exact match when coverage exists**, null when outside coverage (future range)

## Playwright proof

Live browser proof assets were captured under:

- `.artifacts/milestone-8-live-reconciled/`

Playwright JSON report:
- `.artifacts/milestone-8-live-reconciled/playwright-report.json`

Projects:
- Desktop Chromium
- Mobile Chromium
- Mobile WebKit

Result:
- All projects passed after Playwright browser installation.

## Screenshots produced (not committed)

Directory:
- `.artifacts/milestone-8-live-reconciled/`

Includes:
- Dashboard (30d + 7d)
- Explain
- Recommend
- Data & Integrations
- Act
- Learn
- Empty future range
- Mobile dashboard

## Tests / lint / build

At the time of live reconciliation:
- `node scripts/validate-bi-artifacts.mjs` passed
- `npm test` passed
- `npm run lint` passed
- `npm run build` passed
- `git diff --check` passed

## Known limitations (unchanged)

- Email platform not identified or connected.
- Meta-to-Woo matchback not implemented.
- UTM/campaign taxonomy not standardized.
- Identity resolution not implemented.
- Platform-attributed revenue may not reconcile to Woo revenue truth.

## Artifact directory reference

All live reconciliation artifacts are intentionally untracked:

- `.artifacts/milestone-8-live-reconciled/`

This directory should remain **uncommitted** unless a repo policy explicitly requires it.
