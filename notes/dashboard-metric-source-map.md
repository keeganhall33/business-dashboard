# Dashboard metric source map (default executive view)

> Sprint: Dashboard Accuracy + Simplification
> 
> Rule of thumb: **Woo = canonical commerce truth** for Revenue/Orders/AOV unless explicitly labeled otherwise.

## Global
- **Selected range**
  - Source: `GET /api/dashboard/overview` → `range` (computed in `src/app/api/dashboard/overview/route.ts` via `resolveRange()`)
  - Behavior: presets and `custom` set `range`, `start`, `end` query params.
  - Comparison period:
    - Performance Baseline uses `computePreviousInclusiveDateRange()` to select an equal-length previous window.

- **Freshness**
  - Primary evidence currently surfaced in: Executive header + Data Confidence panel.
  - Known limitation: not every metric has a first-class `lastVerified` timestamp.

## Executive KPI Scorecard
Data: `headerMetrics` from `/api/dashboard/overview`.

- Monthly Revenue
  - Source system: WooCommerce telemetry (`getCommerceTelemetry`) overriding scoreboard metric `monthly_revenue`.
  - Field: `commerceTelemetry.woo.summary.revenue`
  - Range behavior: respects selected range.
  - Target period: **monthly** (scoreboard target is assumed monthly).
  - Comparison: `metric.stats.changePercent` (scoreboard-derived if available).
  - Unavailable: `null` → UI shows `Unavailable`.

- AOV
  - Source system: Woo telemetry
  - Field: `commerceTelemetry.woo.summary.avgOrderValue`

- Conversion Rate
  - Canonical: FunnelKit conversion rate (if present), else GA4 session→purchase * 100 (fallback)
  - Range behavior: selected range.

- Revenue per visitor
  - Derived: `woo revenue / GA4 sessions`
  - Range behavior: selected range.
  - Display precision: values < $1 show cents.

## Performance Baseline
- Source: `performanceBaseline` snapshot built from **current** + **previous** commerce telemetry.
- Fields: `buildPerformanceBaselineSnapshot`.
- Comparison period: equal-length previous range.
- Units:
  - revenue (currency)
  - orders (count)
  - avg order value (currency)
  - sessions (count)
  - conversion rate (percent)

## Website & Conversion panel
- Source: Supabase dashboard snapshot key `website` (payload) with server normalization.
- GA4 section:
  - fields: `websiteConversion.ga4.{totalUsers,sessions,ecommercePurchases,purchaseRevenue,...}`
- Woo section:
  - Revenue: `wooCommerce.totalRevenue || netRevenue || grossOrderRevenue`
  - Orders: `wooCommerce.orderCount || paidOrdersInWindow`
  - AOV: `wooCommerce.averageOrderValue` or revenue/orders when valid.
- Recent orders:
  - Source: `wooCommerce.recentOrders[]`
  - Normalization: if `customer` is missing, derive from Woo order `billing.first_name/last_name` when present.

## Meta Ads panel
- Source: Supabase dashboard snapshot key `meta`.
- Spend/purchases/ROAS: Meta-reported.

## Data Confidence
- Source: `buildDataConfidenceModel(data)`
- Known rules:
  - Missing data is never represented as `0`.
  - Sources can be Trusted / Watch / Conflicting.

## Forward Strategy
- Source: Woo revenue telemetry + scoreboard targets (assumed monthly targets).
- Range compatibility: only supports `month_to_date` and `previous_month`.
- Daily Needed eligibility: only for `month_to_date` and only when target + remaining days + current are known.

## Experimental
- Brand Power (social/cultural scores)
  - Source: scoreboard metrics: `social_growth_monthly`, `engagement_rate`, `cultural_relevance_score`.
  - Status: treated as **Experimental** until provenance + freshness is visible.
