import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseEffectiveGa4EndDate } from '../../scripts/lib/ga4-effective-range.mjs';

test('keeps requested end date when GA4 data is already decision-usable', () => {
  const result = chooseEffectiveGa4EndDate({
    dataUsableForCurrentDecisions: true,
    freshness: 'fresh',
    completeness: 'complete',
    sourceAsOf: '2026-09-01'
  }, '2026-09-01', '2026-08-19');

  assert.deepEqual(result, {
    endDate: '2026-09-01',
    lagged: false,
    warning: null
  });
});

test('uses latest complete source date for normal fresh/degraded GA4 reporting lag', () => {
  const result = chooseEffectiveGa4EndDate({
    dataUsableForCurrentDecisions: false,
    freshness: 'degraded',
    completeness: 'partial',
    sourceAsOf: '2026-08-31'
  }, '2026-09-01', '2026-08-19');

  assert.equal(result.endDate, '2026-08-31');
  assert.equal(result.lagged, true);
  assert.match(result.warning, /requested through 2026-09-01/);
  assert.match(result.warning, /latest complete source date is 2026-08-31/);
});

test('fails closed for stale data instead of masking it as normal reporting lag', () => {
  const result = chooseEffectiveGa4EndDate({
    dataUsableForCurrentDecisions: false,
    freshness: 'stale',
    completeness: 'partial',
    sourceAsOf: '2026-08-20'
  }, '2026-09-01', '2026-08-19');

  assert.equal(result, null);
});

test('fails closed when source date is outside the requested analysis range', () => {
  const result = chooseEffectiveGa4EndDate({
    dataUsableForCurrentDecisions: false,
    freshness: 'degraded',
    completeness: 'partial',
    sourceAsOf: '2026-08-18'
  }, '2026-09-01', '2026-08-19');

  assert.equal(result, null);
});
