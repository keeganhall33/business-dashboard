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

const recModel = readJson('docs/bi-recommendation-model.json');
const oppModel = readJson('docs/bi-opportunity-model.json');
const recExamples = readJson('docs/bi-recommendation-examples.json');
const recEval = readJson('docs/bi-recommendation-evaluation.json');

const actionModel = readJson('docs/bi-action-model.json');
const approvalModel = readJson('docs/bi-approval-model.json');
const preparedSchemas = readJson('docs/bi-prepared-action-schemas.json');
const actionExamples = readJson('docs/bi-action-examples.json');
const actionSecurity = readJson('docs/bi-action-security-model.json');

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
      assert(allowedConfidence.has(ce.confidence), `mapping confidence out of vocab: ${ce.confidence}`);
    }
  }
}

// Recommendation model sanity
{
  assert(Array.isArray(recModel.lifecycle) && recModel.lifecycle.length > 0, 'recModel.lifecycle missing');
  assert(typeof recModel.schema === 'object', 'recModel.schema missing');
  // ensure wait_for_more_data and take_no_action exist
  const ops = recModel.categories?.data_operations || [];
  assert(ops.includes('wait_for_more_data'), 'recModel must include wait_for_more_data');
  assert(ops.includes('take_no_action'), 'recModel must include take_no_action');
}

// Opportunity model sanity
{
  assert(Array.isArray(oppModel.types) && oppModel.types.length > 0, 'oppModel.types missing');
  const typeSet = new Set();
  for (const t of oppModel.types) {
    assert(typeof t.type === 'string' && t.type.length, 'opportunity type missing');
    assert(!typeSet.has(t.type), `duplicate opportunity type: ${t.type}`);
    typeSet.add(t.type);
    assert(Array.isArray(t.recommended_actions), `opportunity ${t.type} missing recommended_actions`);
    for (const a of t.recommended_actions) {
      // action should exist as a recommendation type in some category
      const allRecTypes = Object.values(recModel.categories || {}).flat();
      assert(allRecTypes.includes(a), `opportunity action ${a} not in recommendation categories`);
    }
  }
}

// Recommendation examples sanity
{
  assert(Array.isArray(recExamples.examples), 'recExamples.examples missing');
  assert(recExamples.examples.length >= 20, 'must have at least 20 recommendation examples');
  const allRecTypes = new Set(Object.values(recModel.categories || {}).flat());
  const oppTypes = new Set((oppModel.types || []).map((t) => t.type));
  const ids = new Set();
  for (const ex of recExamples.examples) {
    assert(typeof ex.id === 'string' && ex.id.length, 'rec example missing id');
    assert(!ids.has(ex.id), `duplicate rec example id: ${ex.id}`);
    ids.add(ex.id);
    assert(allRecTypes.has(ex.recommendation_type), `rec example uses undefined recommendation_type: ${ex.recommendation_type}`);
    assert(oppTypes.has(ex.opportunity), `rec example uses undefined opportunity type: ${ex.opportunity}`);
    assert(allowedConfidence.has(ex.confidence), `rec example uses invalid confidence: ${ex.confidence}`);
  }
}

// Recommendation evaluation sanity
{
  assert(Array.isArray(recEval.methods) && recEval.methods.length > 0, 'recEval.methods missing');
  assert(Array.isArray(recEval.learning_rules) && recEval.learning_rules.length > 0, 'recEval.learning_rules missing');
}

// Action model sanity
{
  assert(Array.isArray(actionModel.action_levels) && actionModel.action_levels.length === 6, 'actionModel must define 6 levels');
  const levels = new Set(actionModel.action_levels.map((l) => l.level));
  for (const l of ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']) {
    assert(levels.has(l), `missing action level ${l}`);
  }
  // prohibited direct L1/L2 -> L4
  const prohibited = (actionModel.prohibited_transitions || []).map((p) => p.join('->'));
  assert(prohibited.includes('L1->L4'), 'must prohibit L1->L4');
  assert(prohibited.includes('L2->L4'), 'must prohibit L2->L4');
}

// Approval model sanity
{
  assert(Array.isArray(approvalModel.approval_states) && approvalModel.approval_states.length > 0, 'approval_states missing');
  const states = new Set(approvalModel.approval_states);
  for (const s of ['draft', 'pending', 'approved', 'rejected', 'revoked', 'expired']) {
    assert(states.has(s), `approval model missing state ${s}`);
  }
  assert(typeof approvalModel.approval_classes === 'object', 'approval_classes missing');
}

// Prepared action schemas sanity
{
  assert(Array.isArray(preparedSchemas.prepared_action.required_fields), 'prepared_action.required_fields missing');
  const channelPackages = preparedSchemas.channel_packages;
  for (const key of ['meta_ads', 'email', 'website', 'social', 'sales_outreach', 'data_ops']) {
    assert(channelPackages && channelPackages[key], `missing channel package schema: ${key}`);
  }
  // Side-effect matrix must include key rows
  const m = preparedSchemas.side_effect_matrix || {};
  for (const k of ['meta_budget_increase', 'email_send', 'website_change', 'price_change', 'database_migration', 'data_deletion', 'backfill']) {
    assert(m[k], `side_effect_matrix missing ${k}`);
  }
  assert(m.data_deletion.execution_never === true, 'data_deletion must be execution_never');
}

// Action examples sanity
{
  assert(Array.isArray(actionExamples.examples) && actionExamples.examples.length >= 20, 'must have at least 20 action examples');
  const ids = new Set();
  const levels = new Set(actionModel.action_levels.map((l) => l.level));
  const allRecTypes = new Set(Object.values(recModel.categories || {}).flat());
  const approvalClasses = new Set(Object.keys(approvalModel.approval_classes || {}));

  for (const ex of actionExamples.examples) {
    assert(!ids.has(ex.id), `duplicate action example id: ${ex.id}`);
    ids.add(ex.id);
    assert(allRecTypes.has(ex.recommendation), `action example uses undefined recommendation type: ${ex.recommendation}`);
    assert(levels.has(ex.action_level), `action example uses undefined action level: ${ex.action_level}`);
    assert(typeof ex.rollback === 'string' && ex.rollback.length, 'action example missing rollback');
    assert(ex.measurement_plan && ex.measurement_plan.primary_metric, 'action example missing measurement plan');
    for (const cls of ex.required_approvals || []) {
      assert(approvalClasses.has(cls), `action example uses undefined approval class: ${cls}`);
    }
  }
}

// Action security sanity
{
  assert(Array.isArray(actionSecurity.execution_preflight) && actionSecurity.execution_preflight.length > 0, 'execution_preflight missing');
  assert(actionSecurity.pii_and_secrets?.no_plaintext_secrets === true, 'security model must forbid plaintext secrets');
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
