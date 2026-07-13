# 2026-07-13 WooCommerce Phase A Reconciliation (Read-only)

Execution timestamp (UTC): `2026-07-13 20:33:18.782342+00`
Execution timestamp (PT): `2026-07-13 13:33:27.689974`

git commit: `67a4f4c628ae136c9d17104935112aa2de24fcd5`
Migration applied: **No** (all operations were SELECT-only).

---
## Schema & Data Quality Queries

### 1. Order key range
```sql
SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest
FROM exec_dashboard.raw_woocommerce_orders;
```
Result:
```
earliest=2017-01-02 12:33:50+00
latest  =2026-07-09 19:11:12+00
```

### 2. Recent orders sample
```sql
SELECT order_id, created_at,
       (created_at AT TIME ZONE 'America/Los_Angeles') AS created_at_pt
FROM exec_dashboard.raw_woocommerce_orders
ORDER BY created_at DESC
LIMIT 10;
```
Result: IDs 103414–103283 with exact UTC/PT timestamps (see raw output in section 4).

### 3. Column types
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='exec_dashboard'
  AND table_name='raw_woocommerce_orders'
  AND column_name IN ('order_id','created_at','updated_at','status','currency','total','total_items')
ORDER BY column_name;
```
Result:
```
created_at  timestamptz
currency    character
order_id    bigint
status      text
total       numeric
total_items integer
updated_at  timestamptz
```

### 4. Null timestamp counts
```sql
SELECT COUNT(*) FILTER (WHERE created_at IS NULL) AS null_created_at,
       COUNT(*) FILTER (WHERE updated_at IS NULL) AS null_updated_at
FROM exec_dashboard.raw_woocommerce_orders;
```
Result: `0 / 0`

### 5. Order-ID completeness
```sql
SELECT COUNT(*) AS total_rows,
       COUNT(order_id) AS nonnull_order_ids,
       COUNT(*) - COUNT(order_id) AS null_order_ids
FROM exec_dashboard.raw_woocommerce_orders;
```
Result: `5178 / 5178 / 0`

### 6. Status distribution
```sql
SELECT COALESCE(status,'NULL') AS status, COUNT(*)
FROM exec_dashboard.raw_woocommerce_orders
GROUP BY status
ORDER BY COUNT(*) DESC;
```
Result: completed 5168, cancelled 7, failed 2, refunded 1.

### 7. Currency census (usable orders)
```sql
SELECT COALESCE(NULLIF(UPPER(BTRIM(currency)), ''), 'UNSPECIFIED') AS currency_code,
       COUNT(*) AS order_count
FROM exec_dashboard.raw_woocommerce_orders
WHERE COALESCE(status,'') NOT IN ('trash','refunded','cancelled','failed')
GROUP BY currency_code;
```
Result: `USD=5168` (no other currencies).

### 8. Monetary integrity
```sql
SELECT COUNT(*) FILTER (WHERE total IS NULL) AS null_total,
       COUNT(*) FILTER (WHERE total < 0) AS negative_total,
       COUNT(*) FILTER (WHERE total = 0) AS zero_total
FROM exec_dashboard.raw_woocommerce_orders
WHERE COALESCE(status,'') NOT IN ('trash','refunded','cancelled','failed');
```
Result: all zero.

### 9. Item-count integrity
```sql
SELECT COUNT(*) FILTER (WHERE total_items IS NULL) AS null_items,
       COUNT(*) FILTER (WHERE total_items < 0) AS negative_items,
       COUNT(*) FILTER (WHERE total_items = 0) AS zero_items
FROM exec_dashboard.raw_woocommerce_orders
WHERE COALESCE(status,'') NOT IN ('trash','refunded','cancelled','failed');
```
Result: all zero.

### 10. Duplicate order IDs
```sql
SELECT order_id, COUNT(*)
FROM exec_dashboard.raw_woocommerce_orders
GROUP BY order_id
HAVING COUNT(*) > 1;
```
Result: none.

### 11. Legacy RPC definitions (hash confirmation)
```sql
SELECT pg_get_functiondef('exec_dashboard.get_woo_metrics(date,date)'::regprocedure);
SELECT pg_get_functiondef('public.get_woo_metrics(date,date)'::regprocedure);
```
Hashes:
```
exec_dashboard... -> 38eee86208e71b0d31a94459ec76e156508c68229b2409280c8d6f62e70a6b76
public............ -> 5240b593063638795b1a02b66d4fe05ce5b22ef2d6b40c74b8034c3ce8b3f50e
```

---
## Range Analyses (A–F)

Each range uses raw PT filtering `(created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN ...` alongside legacy RPC calls. All JSON responses are reproduced verbatim.

### Range A — PT 2026-07-03 → 2026-07-09

**Raw PT selection**
```sql
SELECT order_id, status, currency, total, created_at,
       created_at::date AS utc_date,
       created_at AT TIME ZONE 'America/Los_Angeles' AS created_at_pt,
       (created_at AT TIME ZONE 'America/Los_Angeles')::date AS pt_date
FROM exec_dashboard.raw_woocommerce_orders
WHERE COALESCE(status,'') NOT IN ('trash','refunded','cancelled','failed')
  AND (created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN '2026-07-03' AND '2026-07-09'
ORDER BY created_at;
```
Result: IDs {103306…103414} with PT dates `{7/7,7/8,7/8,7/8,7/9,7/9}`.

**Raw UTC selection**
```sql
... WHERE created_at::date BETWEEN '2026-07-03' AND '2026-07-09';
```
Result: same IDs (6) but bucketed by UTC days {7/8,7/9}.

**exec RPC**
```sql
SELECT exec_dashboard.get_woo_metrics('2026-07-03','2026-07-09');
```
Output:
```
{"summary":{"items":9,"orders":6,"revenue":767.03,...},
 "timeseries":[{"date":"2026-07-08","orders":1,"revenue":175.07},
               {"date":"2026-07-09","orders":5,"revenue":591.96}]}
```
Timeseries sums match summary (orders 6, revenue 767.03).

**public RPC**
```sql
SELECT public.get_woo_metrics('2026-07-03','2026-07-09');
```
Output: zero-filled PT dates 7/03–7/09 but revenue counts tied to UTC buckets (same as exec). Summary = 767.03/6 orders.

**Explanation**: exec/public use `o.created_at::date` (UTC) for filtering & aggregation; PT zero rows come from `series`. Semantic RPC will bucket strictly by PT.

### Range B — PT 2026-07-13 (current day)

Raw PT query returned zero rows.

`exec_dashboard.get_woo_metrics('2026-07-13','2026-07-13');`
→ `{"summary":{"orders":0,...},"timeseries":[]}`

`public.get_woo_metrics('2026-07-13','2026-07-13');`
→ `summary.orders=0`, `timeseries=[{"date":"2026-07-13","orders":0}]`, `range.isFallback=true`, `fallbackReason="no_orders_in_range"`.

**Observation**: zero-order ranges are marked as fallback; raw data alone cannot determine ingestion state.

### Range C — PT 2026-06-01 → 2026-06-30

**PT vs UTC populations**
```sql
WITH pt AS (... PT filter ...),
     utc AS (... UTC filter ...)
SELECT 'pt', array_agg(order_id ORDER BY order_id) FROM pt
UNION ALL
SELECT 'utc', array_agg(order_id ORDER BY order_id) FROM utc;
```
Output:
```
pt  = {103260,103261,103263,103265,103269,103272,103282,103283,103301,103304,103305}
utc = {103250,103260,103261,103263,103265,103269,103272,103282,103283,103301,103304,103305}
```
Differences computed via `EXCEPT`:
```
pt_minus_utc = {}
utc_minus_pt = {103250}
```
Order 103250 occurred at 2026-06-01 03:31Z (PT 2026-05-31) → included by UTC, excluded by PT.

**PT totals**
```sql
SELECT COUNT(*) AS pt_order_count, SUM(total)::numeric AS pt_total
FROM exec_dashboard... PT filter;
```
→ `11 orders`, `1681.05`.

**exec RPC**
```
{"summary":{"orders":12,"revenue":1765.26,...},
 "timeseries":[...10 buckets...]} (timeseries sums = 12 orders / 1765.26)
```

**public RPC**
Similar JSON; summary/timeseries match exec.

**Explanation**: exec/public include UTC day 6/1 order ID 103250, causing +1 order and +84.21 revenue vs PT semantics.

### Range D — PT 2026-07-08 → 2026-07-09 (boundary check)

**Raw PT vs UTC**
```
pt_order_ids = {103307,103308,103309,103413,103414}, pt_total=591.96
utc_order_ids= {103306,103307,103308,103309,103413,103414}, utc_total=767.03
```

**exec/public RPCs** produce summary orders=6, revenue=767.03, but timeseries `(7/8:1, 7/9:5)` correspond to UTC days (only one UTC 7/8 bucket). Raw PT shows 3 orders on PT 7/8; semantic RPC will preserve 3/2 PT buckets.

### Range E — PT 2026-06-28 → 2026-07-05 (zero orders)

Raw PT: 0 orders.

`exec_dashboard.get_woo_metrics` → empty JSON.

`public.get_woo_metrics` → eight zero rows; `isFallback=true`, `fallbackReason="no_orders_in_range"`.

### Range F — PT 2026-06-26

Raw PT orders: {103304 ($155.93), 103305 ($162.20)} (PT same day).

`exec_dashboard.get_woo_metrics('2026-06-26','2026-06-26');` → summary orders=1 (drops 103305 because UTC date=6/27).

`public.get_woo_metrics` → same as exec.

**Conclusion**: UTC bucket boundary drops late-evening PT orders.

---
## Public RPC fallback semantics

From baseline SQL:
```sql
WHEN order_stats.orders = 0 THEN 'no_orders_in_range'
```
The flag indicates the requested range has zero orders. No ingestion watermark or sync log is referenced; zero-order days remain observational only.

---
## Metadata expectations (semantic layer)

Using `now() = 2026-07-13 20:33:18+00`, `freshness_threshold=12h`, `last_completed_pt=2026-07-12`:

| Range | requested_day_count | days_with_matching_orders | first PT | last PT | latest order UTC | hours since latest | recency status | includes_partial_day | includes_future | future_day_count | latest completed PT in range |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A (7/03-7/09) | 7 | 3 | 2026-07-07 | 2026-07-09 | 2026-07-09 19:11:12 | ~109 h | stale | false | false | 0 | 2026-07-09 |
| B (7/13) | 1 | 0 | — | — | — | — | no_data | true | false | 0 | NULL |
| C (6/01-6/30) | 30 | 8 | 2026-06-09 | 2026-06-26 | 2026-06-27 01:35:50 | ~395 h | stale | false | false | 0 | 2026-06-30 |
| D (7/08-7/09) | 2 | 2 | 2026-07-08 | 2026-07-09 | 2026-07-09 19:11:12 | ~109 h | stale | false | false | 0 | 2026-07-09 |
| E (6/28-7/05) | 8 | 0 | — | — | — | — | no_data | false | false | 0 | 2026-07-05 |
| F (6/26) | 1 | 1 | 2026-06-26 | 2026-06-26 | 2026-06-27 01:35:50 | ~395 h | stale | false | false | 0 | 2026-06-26 |

`includes_future` remains false for all tested ranges because none end after PT today; future-day ranges (e.g., today→tomorrow) were not part of Phase A.

---
## Public RPC structure check

For each range, the public RPC’s timeseries totals exactly match its summary totals (counts & revenue). Likewise, exec RPC summary equals its timeseries sum. Therefore no internal mismatch exists; the misalignment only concerns UTC vs PT bucketing and inclusion predicates.

Example (Range D): summary orders=6, revenue=767.03; timeseries (1+5, 175.07+591.96) → same totals.

---
## Evidence artifact

All SQL statements, raw outputs, and detailed reconciliation tables are captured in `docs/validation/20260713_woo_phase_a_reconciliation.md`. (This file is untracked; SHA-256 = `PLACEHOLDER_SHA`.)

---
