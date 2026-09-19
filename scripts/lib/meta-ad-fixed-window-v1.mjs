const DAY_MS = 24 * 60 * 60 * 1_000;

export const META_AD_FIXED_WINDOW_SPECS_V1 = Object.freeze([
  Object.freeze({ key: 'CURRENT_7D', role: 'CURRENT', days: 7, offsetDays: 0 }),
  Object.freeze({ key: 'PRIOR_7D', role: 'PRIOR', days: 7, offsetDays: 7 }),
  Object.freeze({ key: 'CURRENT_14D', role: 'CURRENT', days: 14, offsetDays: 0 }),
  Object.freeze({ key: 'PRIOR_14D', role: 'PRIOR', days: 14, offsetDays: 14 }),
  Object.freeze({ key: 'CONTEXT_30D', role: 'CONTEXT', days: 30, offsetDays: 0 }),
  Object.freeze({ key: 'CONTEXT_90D', role: 'CONTEXT', days: 90, offsetDays: 0 }),
]);

export const META_AD_INSIGHT_FIELDS_V1 = Object.freeze([
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'actions',
  'action_values',
]);

export const META_CAMPAIGN_INSIGHT_FIELDS_V1 = Object.freeze([
  'campaign_id',
  'campaign_name',
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'actions',
  'action_values',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function parseNow(nowInput) {
  const now = nowInput instanceof Date ? new Date(nowInput.getTime()) : new Date(nowInput);
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Meta fixed-window now instant is invalid');
  }
  return now;
}

function dateOnlyFromMs(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function utcDayStartMs(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function buildMetaAdFixedWindowPlanV1(nowInput = new Date()) {
  const now = parseNow(nowInput);
  const completeThroughMs = utcDayStartMs(now) - DAY_MS;

  const windows = META_AD_FIXED_WINDOW_SPECS_V1.map((spec) => {
    const endMs = completeThroughMs - spec.offsetDays * DAY_MS;
    const startMs = endMs - (spec.days - 1) * DAY_MS;
    return {
      key: spec.key,
      role: spec.role,
      days: spec.days,
      range: {
        startDate: dateOnlyFromMs(startMs),
        endDate: dateOnlyFromMs(endMs),
      },
    };
  });

  const byKey = new Map(windows.map((window) => [window.key, window]));
  const current7 = byKey.get('CURRENT_7D');
  const prior7 = byKey.get('PRIOR_7D');
  const current14 = byKey.get('CURRENT_14D');
  const prior14 = byKey.get('PRIOR_14D');
  if (!current7 || !prior7 || !current14 || !prior14) {
    throw new Error('Meta ad fixed-window plan is incomplete');
  }

  const prior7End = Date.parse(`${prior7.range.endDate}T00:00:00.000Z`);
  const current7Start = Date.parse(`${current7.range.startDate}T00:00:00.000Z`);
  const prior14End = Date.parse(`${prior14.range.endDate}T00:00:00.000Z`);
  const current14Start = Date.parse(`${current14.range.startDate}T00:00:00.000Z`);
  if (prior7End + DAY_MS !== current7Start || prior14End + DAY_MS !== current14Start) {
    throw new Error('Meta ad current/prior fixed windows are not adjacent');
  }

  return deepFreeze({
    generatedAt: now.toISOString(),
    completeThrough: dateOnlyFromMs(completeThroughMs),
    windows,
  });
}

function requiredText(row, key) {
  const value = row?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Meta insight row is missing ${key}`);
  }
  return value.trim();
}

function optionalText(row, key) {
  const value = row?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeNumber(row, key, { required = false, integer = false } = {}) {
  const raw = row?.[key];
  if (raw === null || raw === undefined || raw === '') {
    if (required) throw new Error(`Meta insight row is missing ${key}`);
    return null;
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(`Meta insight row has invalid ${key}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Meta insight row has invalid ${key}`);
  }
  return parsed;
}

function actionValue(actions, target) {
  if (actions === null || actions === undefined) return null;
  if (!Array.isArray(actions)) {
    throw new Error('Meta insight row has invalid action evidence');
  }
  const matches = actions.filter((action) => action?.action_type === target);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Meta insight row has conflicting ${target} action evidence`);
  }
  const raw = matches[0]?.value ?? matches[0]?.action_value ?? matches[0]?.inline_value;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Meta insight row has invalid ${target} action value`);
  }
  return parsed;
}

function summarizePerformanceFields(row) {
  const spend = nonNegativeNumber(row, 'spend', { required: true });
  const impressions = nonNegativeNumber(row, 'impressions', { required: true, integer: true });
  const clicks = nonNegativeNumber(row, 'clicks', { required: true, integer: true });
  const ctr = nonNegativeNumber(row, 'ctr');
  const cpc = nonNegativeNumber(row, 'cpc');
  const cpm = nonNegativeNumber(row, 'cpm');
  const purchases = actionValue(row.actions, 'offsite_conversion.purchase');
  const purchaseValue = actionValue(row.action_values, 'offsite_conversion.purchase');

  return {
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchaseValue,
    roas: purchaseValue !== null && spend > 0 ? purchaseValue / spend : null,
  };
}

function assertInsightRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Meta insight row is malformed');
  }
}

export function summarizeMetaCampaignInsightV1(row) {
  assertInsightRow(row);
  return deepFreeze({
    campaignId: requiredText(row, 'campaign_id'),
    campaignName: optionalText(row, 'campaign_name'),
    ...summarizePerformanceFields(row),
  });
}

export function summarizeMetaAdInsightV1(row) {
  assertInsightRow(row);
  return deepFreeze({
    campaignId: requiredText(row, 'campaign_id'),
    campaignName: optionalText(row, 'campaign_name'),
    adSetId: requiredText(row, 'adset_id'),
    adSetName: optionalText(row, 'adset_name'),
    adId: requiredText(row, 'ad_id'),
    adName: optionalText(row, 'ad_name'),
    ...summarizePerformanceFields(row),
  });
}
