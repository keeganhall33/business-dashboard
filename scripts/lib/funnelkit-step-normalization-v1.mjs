function fail(label, detail) {
  throw new Error(`FunnelKit ${label}: ${detail}`);
}

function strictPositiveSafeInteger(value, label) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    fail(label, 'must be a positive safe integer');
  }
  if (typeof value === 'string' && value.trim() === '') {
    fail(label, 'must be a positive safe integer');
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(label, 'must be a positive safe integer');
  }
  return parsed;
}

function strictNonnegativeSafeInteger(value, label) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    fail(label, 'must be a nonnegative safe integer');
  }
  if (typeof value === 'string' && value.trim() === '') {
    fail(label, 'must be a nonnegative safe integer');
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(label, 'must be a nonnegative safe integer');
  }
  return parsed;
}

function strictNonemptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(label, 'must be a nonempty string');
  }
  return value.trim();
}

export function normalizeFunnelKitWrittenRowCountV1(value) {
  return strictNonnegativeSafeInteger(value, 'ingest row count');
}

export function normalizeFunnelKitStepRecordsV1({ records, funnelData, requestedFunnelId }) {
  if (!Array.isArray(records) || records.length === 0) {
    fail('step records', 'must be a nonempty array');
  }
  if (!funnelData || typeof funnelData !== 'object' || Array.isArray(funnelData)) {
    fail('funnel data', 'must be an object');
  }

  const configuredFunnelId = strictPositiveSafeInteger(requestedFunnelId, 'configured funnel id');
  const returnedFunnelId = funnelData.id === null || funnelData.id === undefined
    ? configuredFunnelId
    : strictPositiveSafeInteger(funnelData.id, 'returned funnel id');
  if (returnedFunnelId !== configuredFunnelId) {
    fail('returned funnel id', `expected ${configuredFunnelId}, received ${returnedFunnelId}`);
  }

  const funnelName = strictNonemptyString(funnelData.title, 'funnel title');
  const seenStepIds = new Set();
  let activityEntries = 0;
  let activityCompletions = 0;

  const rows = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail(`step ${index + 1}`, 'must be an object');
    }

    const stepId = strictPositiveSafeInteger(record.object_id, `step ${index + 1} object_id`);
    if (seenStepIds.has(stepId)) {
      fail(`step ${index + 1} object_id`, `duplicate step id ${stepId}`);
    }
    seenStepIds.add(stepId);

    const rawStepName = typeof record.object_name === 'string' && record.object_name.trim() !== ''
      ? record.object_name
      : record.type;
    const stepName = strictNonemptyString(rawStepName, `step ${index + 1} name`);
    const entries = strictNonnegativeSafeInteger(record.views, `step ${index + 1} views`);
    const completions = strictNonnegativeSafeInteger(record.conversions, `step ${index + 1} conversions`);

    activityEntries += entries;
    activityCompletions += completions;
    if (!Number.isSafeInteger(activityEntries) || !Number.isSafeInteger(activityCompletions)) {
      fail('activity totals', 'exceed the safe integer range');
    }

    return {
      funnel_id: returnedFunnelId,
      funnel_name: funnelName,
      step_id: stepId,
      step_name: stepName,
      step_index: index + 1,
      entries,
      completions,
      avg_time_seconds: null,
      upsell_offers: 0,
      upsell_accepts: 0
    };
  });

  return { rows, activityEntries, activityCompletions };
}
