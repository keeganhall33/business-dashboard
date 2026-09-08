# Ingestion Automation OS V1

## Purpose

The dashboard uses one governed data plane for first-party telemetry, external intelligence, business memory, and outcomes. Collectors produce evidence. They never bypass Fusion or executive decision governance.

The canonical machine-readable inventory is `config/data-plane/ingestion_manifest.v1.json`. Existing collectors, GitHub Actions, Supabase schedules, local authorized workers, and manual research are execution adapters. None is a separate source of truth.

## Runtime

```text
five-minute wake-up
  -> inspect due sources
  -> enqueue independent source jobs
  -> return within 30 seconds

source worker
  -> atomically claim one job
  -> fetch incrementally within source timeout/rate limits
  -> retain bounded raw evidence + checksum
  -> normalize canonical entities/events/metrics
  -> reconcile related sources
  -> compute quality and freshness from source_as_of
  -> publish only decision-eligible evidence
  -> update capability health and outcome attribution
```

Long-running collection does not execute inside the wake-up request. A slow source cannot block queue intake or another source. Webhook and polling paths share idempotency keys. Backfills use separate low-priority capacity and cannot starve current incremental collection.

Supabase is the durable authority for the future queue/run ledger. Use Postgres-native atomic claims, visibility leases, bounded retries, dead-letter records, and partial indexes for queued/active work. Tables exposed through the Data API require RLS; service-role credentials remain server-only.

## Evidence contract

Every adapter must emit the manifest's required evidence fields. `retrieved_at` records collector activity. `source_as_of` records how current the evidence actually is. Only the latter, together with coverage, completeness, reconciliation, legal status, and quality, can make evidence usable for decisions.

Missing data is `UNKNOWN` or `NO_DATA`, never zero. Normal publication latency is `EXPECTED_LAG`, not a collection failure. Contradictions are `CONFLICTED` and block affected high-impact recommendations until resolved or explicitly disclosed by policy.

## Acquisition order

1. First-party webhook or official API
2. Authorized incremental API
3. Approved RSS/feed/structured export
4. Authorized IMAP or standards-based read adapter
5. Compliant primary public document/page collection
6. Reputable secondary reporting for corroboration
7. Manual-only evidence when automation is restricted
8. Paid/licensed data only after value-of-information review and Keegan approval

Never bypass authentication, access controls, paywalls, robots directives, licensing, or platform terms.

## Cadence by decision value

- Event-driven: orders, checkout, correspondence, CRM changes, decisions, outcomes, and critical incidents.
- Intraday: active funnel, advertising, fulfillment, site availability, and security signals.
- Daily: commerce reconciliation, GA4 after expected lag, paid/social performance, search health, news, and active opportunities.
- Weekly: broad discovery, competitors, cultural/event radar, and strategy synthesis.
- Monthly or quarterly: source governance, licensing/access review, market structure, portfolio allocation, and learning calibration.

## Boardroom and external intelligence

Boardroom is explicitly present as `sports_business.boardroom` and points to the repository's existing bounded RSS adapter. It is a high-quality secondary context source, not first-party truth and not an executive recommendation feed.

The current production Source Registry still marks Boardroom disabled, manual-only, and pending terms review. Therefore the manifest makes the source visible and adapter-ready while keeping recurring execution manual-only. Activation requires a separate reviewed change that records approved access, preserves excerpt limits and raw provenance, passes current network/qualification tests, and proves that Boardroom failure cannot affect other sources.

The same rules apply to every governed external source. Sources marked prohibited remain disabled. Paid or licensed sources cannot be purchased or activated automatically.

## Capability impairment

Consumers query the manifest and source health before reasoning. If required evidence is stale, unavailable, partial, or conflicted, the affected capability reports an explicit impairment and the exact next connection or implementation needed. Other unaffected capabilities continue.

Examples:

- Fresh Woo orders plus stale GA4 permits revenue truth but blocks current funnel attribution.
- Fresh Boardroom reporting without primary corroboration may create a research lead but not a high-impact recommendation.
- Email unavailable means relationship recommendations disclose the memory gap instead of guessing from CRM timestamps.

## Activation sequence

1. Canonical manifest and validator
2. Durable queue/run ledger with atomic claim, retry, circuit breaker, and dead letter
3. Enqueue-only scheduler wake-up
4. Woo + GA4 + FunnelKit + WordPress convergence
5. IONOS/CRM memory ingestion
6. Ads, social, content, Search Console, Clarity, and shipping adapters
7. Approved external source collectors, including Boardroom after its access gate
8. Cross-source reconciliation and decision-eligibility gate
9. Operations/freshness dashboard, alerts, and source-to-outcome learning

Each activation is a bounded reviewed change with exact-head CI, owned paths, production canary evidence, and rollback instructions.

## Required production proofs

- Commerce evidence flows end to end through reconciliation and a governed recommendation.
- Email/CRM evidence updates a relationship record without sending mail.
- An external opportunity uses multiple independent source tiers and exposes unknowns.
- A failed source enters retry/dead-letter without stopping other jobs.
- Poll/webhook duplicates collapse to one canonical record.
- Cursor recovery resumes after interruption without a full reload.
- Backfill work does not delay fresh incremental jobs.
- Conflicting metrics block the affected executive recommendation.
- A measured outcome retains links to the evidence sources that influenced the decision.

## Credential setup

The manifest stores environment-variable reference names only. Secrets belong in the existing approved secret store and are injected only into the relevant server-side adapter. Connection requests should be bundled, least-privilege, and read-only whenever possible. No credential is required merely to load or validate the manifest.
