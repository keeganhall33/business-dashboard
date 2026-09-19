import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const collector = readFileSync(join(repoRoot, "scripts/run-funnelkit-telemetry.mjs"), "utf8");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260919170000_authoritative_funnelkit_range_coverage_v4.sql"),
  "utf8",
);

test("records FunnelKit coverage only after a successful persisted-day write", () => {
  const ingestCall = collector.indexOf("'ingest_funnelkit_day_v2'");
  const normalizeWritten = collector.indexOf("normalizeFunnelKitWrittenRowCountV1(written)");
  const coverageCall = collector.indexOf("'mark_funnelkit_coverage_day_v1'");
  const processedDay = collector.indexOf("processedDays += 1");

  assert.ok(ingestCall >= 0);
  assert.ok(normalizeWritten > ingestCall);
  assert.ok(coverageCall > normalizeWritten);
  assert.ok(processedDay > coverageCall);
});

test("reconciles successful-day proof against the raw rows actually persisted", () => {
  assert.match(migration, /row_count integer not null check \(row_count >= 0\)/);
  assert.match(migration, /select count\(\*\)::integer[\s\S]*raw_funnelkit_steps[\s\S]*collected_at = p_coverage_date/);
  assert.match(migration, /if actual_row_count <> p_row_count then/);
  assert.match(migration, /p_row_count is null or p_row_count < 0/);
});

test("requires exact requested-day coverage before FunnelKit becomes decision-grade", () => {
  assert.match(migration, /fkc\.covered_days = p\.expected_days/);
  assert.match(migration, /fkc\.coverage_start = p\.range_start/);
  assert.match(migration, /fkc\.coverage_end = p\.range_end/);
  assert.match(migration, /dataUsableForCurrentDecisions', c\.usable/);
  assert.match(migration, /coverageProofVersion', 'exact_daily_presence_v1'/);
});

test("keeps GA4 fallback conservative when exact daily presence cannot be shown", () => {
  assert.match(migration, /count\(distinct event_date\)::integer as covered_days/);
  assert.match(migration, /gac\.covered_days = p\.expected_days/);
  assert.match(migration, /when r\.ga_exact and r\.ga_freshness in \('fresh','degraded'\) then 'ga4_ecommerce_fallback'/);
  assert.match(migration, /else 'unavailable'/);
});

test("uses proven coverage rather than raw-row recency for FunnelKit freshness", () => {
  assert.match(migration, /select 'funnelkit', max\(coverage_date\) from exec_dashboard\.funnelkit_day_coverage_v1/);
  assert.match(migration, /select max\(coverage_date\) from exec_dashboard\.funnelkit_day_coverage_v1/);
});

test("coverage authority stays private and does not establish attribution or causality", () => {
  assert.match(migration, /revoke all on table exec_dashboard\.funnelkit_day_coverage_v1 from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.mark_funnelkit_coverage_day_v1\(date,text,integer,jsonb\) to service_role/);
  assert.match(migration, /'attributionEstablished', false/);
  assert.match(migration, /'causalityEstablished', false/);
});
