# Repair Collectors data source

**Status:** Open — needs owner assignment

## Summary
- `vw_collectors_dashboard` stopped updating on **2026-05-18** (latest `last_touch_at`).
- Fallback table `collector_relationships` was last updated **2026-04-30** and only contains 10 stale Tier A/B entries.
- No repo-owned scheduler, agent, or script writes to either source; the view is maintained via an unknown external/legacy ETL.
- Because the data is 4–6 weeks old, the Collectors panel must remain hidden and marked BROKEN.

## Required work
1. Identify the owner of `vw_collectors_dashboard` inside Supabase (or the upstream sheet/export feeding it).
2. Determine why the feed stopped on May 18 and whether the prior automation/ETL can be restarted.
3. If automation can’t be restored quickly, document a manual backfill path (CSV import or Supabase script) to refresh collector relationships within a 7-day freshness window.
4. Only after a successful refresh (proof: latest touch timestamp within 7 days) should the Collectors UI be eligible for re-enable.

## Notes
- Cron being OFF is not the cause; pipeline data continued updating through Jun 15.
- Any repair should also emit an artifact/log so future audits can verify freshness automatically.
