import fs from 'node:fs';

const allowedConfidence = new Set([
  'confirmed',
  'strongly_supported',
  'likely',
  'possible',
  'insufficient_evidence'
]);

const allowedSourceStatuses = new Set([
  'connected_reliable',
  'connected_incomplete',
  'manual_only',
  'technically_connectable',
  'placeholder_or_seed',
  'unavailable',
  'not_worth_connecting'
]);

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const model = readJson('docs/bi-business-event-model.json');
const mappings = readJson('docs/bi-source-event-mappings.json');
const examples = readJson('docs/bi-event-model-examples.json');
const scorecard = readJson('docs/bi-dashboard-scorecard.json');
const inventory = readJson('docs/bi-source-inventory.json');

// basic JSON structural checks
assert(Array.isArray(model.entities?.list), 'model.entities.list missing');
assert(model.entities.list.length > 0, 'model.entities.list empty');
assert(typeof model.event_taxonomy?.groups === 'object', 'model.event_taxonomy.groups missing');

// entity uniqueness
{
  const ids = new Set();
  const dups = [];
  for (const e of model.entities.list) {
    assert(typeof e.entity === 'string' && e.entity.length, 'entity missing name');
    if (ids.has(e.entity)) dups.push(e.entity);
    ids.add(e.entity);
  }
  assert(dups.length === 0, `duplicate entity names: ${dups.join(',')}`);
}

// event types
const eventTypes = new Set();
for (const group of Object.values(model.event_taxonomy.groups)) {
  for (const t of group) eventTypes.add(t);
}
assert(eventTypes.size > 0, 'no event types defined');

// confidence vocabulary
for (const level of model.confidence_scale.levels) {
  // levels in model are allowed; later artifacts must use them.
  assert(typeof level.level === 'string', 'confidence_scale level missing');
}

// mappings sanity
assert(Array.isArray(mappings.mappings), 'mappings.mappings missing');
for (const m of mappings.mappings) {
  assert(typeof m.source === 'string', 'mapping missing source');
  for (const ce of m.canonical_events || []) {
    assert(eventTypes.has(ce.event_type), `mapping references undefined event_type: ${ce.event_type}`);
    if (ce.confidence) {
      // allow these freeform mappings but if present, enforce vocabulary
      assert(allowedConfidence.has(ce.confidence), `mapping confidence out of vocab: ${ce.confidence}`);
    }
  }
}

// examples sanity
assert(Array.isArray(examples.examples), 'examples.examples missing');
for (const ex of examples.examples) {
  for (const t of ex.canonical_events || []) {
    assert(eventTypes.has(t), `example references undefined canonical event_type: ${t}`);
  }
  for (const c of [ex.attribution?.confidence, ex.explanation?.confidence, ex.recommendation?.confidence].filter(Boolean)) {
    assert(allowedConfidence.has(c), `example uses invalid confidence: ${c}`);
  }
}

// scorecard sanity
{
  assert(scorecard.weights?.total === 100, 'scorecard.weights.total must be 100');
  let sum = 0;
  for (const [k, v] of Object.entries(scorecard.weights)) {
    if (k === 'total') continue;
    sum += v;
  }
  assert(sum === 100, `scorecard weights sum must be 100, got ${sum}`);
  assert(Object.keys(scorecard.scores || {}).length === 25, 'scorecard must contain 25 dimensions');
  for (const [k, v] of Object.entries(scorecard.scores)) {
    assert(typeof v.score === 'number', `scorecard missing numeric score for ${k}`);
  }
}

// source inventory sanity
{
  assert(Array.isArray(inventory.records), 'inventory.records missing');
  const ids = new Set();
  for (const r of inventory.records) {
    assert(!ids.has(r.id), `duplicate inventory id: ${r.id}`);
    ids.add(r.id);
    assert(allowedSourceStatuses.has(r.status), `inventory status not allowed: ${r.status} (${r.id})`);
    for (const f of r.evidence_files || []) {
      assert(!String(f).includes('op://'), `inventory evidence file must not be secret reference: ${r.id}`);
      assert(fs.existsSync(f), `inventory evidence file missing: ${r.id} -> ${f}`);
    }
  }
}

// crude secret/PII heuristics
function scanForSecrets(path) {
  const s = fs.readFileSync(path, 'utf8');
  const bad = [];
  if (s.includes('ops_eyJ') || s.includes('sb_secret_')) bad.push('token-like');
  if (s.match(/\b\d{3}-\d{2}-\d{4}\b/)) bad.push('ssn-like');
  return bad;
}

const scanned = [
  'docs/bi-business-event-model.json',
  'docs/bi-source-event-mappings.json',
  'docs/bi-event-model-examples.json',
  'docs/bi-dashboard-scorecard.json',
  'docs/bi-source-inventory.json'
];
for (const p of scanned) {
  const bad = scanForSecrets(p);
  assert(bad.length === 0, `secret/pii heuristic hit in ${p}: ${bad.join(',')}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      entityCount: model.entities.list.length,
      eventTypeCount: eventTypes.size,
      mappingsCount: mappings.mappings.length,
      examplesCount: examples.examples.length,
      scorecardDims: Object.keys(scorecard.scores).length,
      inventoryRecords: inventory.records.length
    },
    null,
    2
  )
);
