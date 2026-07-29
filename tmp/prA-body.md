### Summary

PR A implements the missing **Woo telemetry ingestion pipeline** and a canonical, versioned metric definition:

- **Canonical definition:** `woo_paid_net_v1`
  - Orders: `completed|processing`
  - Date attribution: paid timestamp → Pacific calendar date (inclusive boundaries)
  - Revenue: **net** cents = gross total cents − refunded cents (floored at 0)
  - Currency: single primary currency only (mixed currency fails the run)

### What changed

**Schema (migration)**
- Adds `woo_order_telemetry_v1` (public) with:
  - woo_order_id PK
  - status, currency
  - created/paid/modified timestamps
  - paid_pacific_date
  - gross/refunded/net cents
  - discount/tax/shipping cents
  - source checksum + ingested timestamp
- Adds `woo_ingestion_runs_v1` with run-level metadata:
  - requested coverage, proven coverage, status, rows fetched/inserted/updated/unchanged, error summary
  - definition version + source_as_of_gmt

**Ingestion job**
- `scripts/run-woo-telemetry.mjs` (reusable module + thin CLI)
  - Woo REST pagination with per_page=100 until exhaustion
  - bounded retries with backoff
  - idempotent upsert by woo_order_id
  - updates when checksum changes
  - overlaps incremental sync window (default 14d) and supports explicit start/end
  - supports dry-run mode

**Scheduler integration**
- Adds `woo` target to `.github/workflows/dashboard-scheduler.yml` (scheduled 02:05 PT / 10:05 UTC + workflow_dispatch)
- Uses existing 1Password env workflow pattern (no new secrets printed)

**RPC repair**
- Replaces `get_woo_metrics` stub to read from `woo_order_telemetry_v1` using canonical paid_pacific_date + status filter.
- Returns explicit summary fields including:
  - source: `selected_range_telemetry`
  - completeness: `complete|unknown` based on latest successful ingestion run coverage
  - asOf, coverageStart, coverageEnd
  - net revenue + gross + refunded
  - definitionVersion

### Root cause addressed (sanitized)
Production showed live Woo eligible orders >> telemetry because the dashboard was reading `exec_dashboard.raw_woocommerce_orders`, but this repo had **no operational writer** for that table. This PR provides an authoritative writer + coverage metadata.

### Not included
- No production historical backfill is executed in this PR.
- Upstream repair/backfill orchestration is a follow-up step once this is reviewed and deployed.
