const FIELD = /^\*\*([a-zA-Z0-9_]+):\*\*\s*(.+?)\s*$/gm;
const ALLOWED_TASK_MUTABILITY = new Set([
  'IMPLEMENTATION_MUTATION_REQUIRED',
  'VALIDATION_EVIDENCE_ONLY',
  'EVIDENCE_ONLY',
]);
const INTEGRATION_PR_REFERENCE = /(?:\bPR\b|\bpull request\b)\s*[:=-]?\s*#?\s*\d+\b/i;
const BUSINESS_VALUE_CONTRACT = 'BUSINESS_VALUE_V2';

function section(body, heading) {
  const lines = String(body).split(/\r?\n/);
  const target = heading.trim().toLowerCase();
  const start = lines.findIndex((line) => line.replace(/^#{2,6}\s+/, '').trim().toLowerCase() === target && /^#{2,6}\s+/.test(line));
  if (start < 0) return '';
  const endOffset = lines.slice(start + 1).findIndex((line) => /^#{2,6}\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n').trim();
}

export function parseTaskContract(body = '') {
  const fields = {};
  for (const match of String(body).matchAll(FIELD)) fields[match[1]] = match[2];
  return fields;
}

export function validateTaskContract(issue) {
  const fields = parseTaskContract(issue?.body ?? '');
  const errors = [];
  if (!issue?.number) errors.push('ISSUE_NUMBER_REQUIRED');
  if (!fields.task_id) errors.push('TASK_ID_REQUIRED');
  if (!fields.stream) errors.push('STREAM_REQUIRED');
  if (fields.human_approval_required !== 'false') errors.push('HUMAN_APPROVAL_REQUIRED_OR_UNKNOWN');
  if (!fields.task_mutability) errors.push('TASK_MUTABILITY_REQUIRED');
  else if (!ALLOWED_TASK_MUTABILITY.has(fields.task_mutability)) errors.push('TASK_MUTABILITY_INVALID');
  if (!fields.file_ownership || fields.file_ownership.trim() === '') errors.push('FILE_OWNERSHIP_REQUIRED');
  if (fields.stream === 'INTEGRATION_RELEASE' && !INTEGRATION_PR_REFERENCE.test(String(issue?.body ?? ''))) errors.push('INTEGRATION_REFERENCED_PR_REQUIRED');
  const isBusinessValueV2 = fields.contract_version === BUSINESS_VALUE_CONTRACT;
  const businessOutcome = section(issue?.body, 'Business outcome');
  const businessReason = section(issue?.body, 'Business reason');
  const successMetric = section(issue?.body, 'Success metric');
  const proofRequired = section(issue?.body, 'Proof required');
  if (isBusinessValueV2) {
    if (!businessOutcome) errors.push('BUSINESS_OUTCOME_REQUIRED');
    if (!businessReason) errors.push('BUSINESS_REASON_REQUIRED');
    if (!successMetric) errors.push('SUCCESS_METRIC_REQUIRED');
    if (!proofRequired) errors.push('PROOF_REQUIRED');
    if (fields.verification_owner !== 'INDEPENDENT') errors.push('INDEPENDENT_VERIFICATION_REQUIRED');
  }
  return {
    ok: errors.length === 0,
    errors,
    task: errors.length ? null : Object.freeze({
      taskId: fields.task_id,
      issueNumber: issue.number,
      stream: fields.stream,
      taskMutability: fields.task_mutability,
      fileOwnership: fields.file_ownership,
      contractVersion: fields.contract_version ?? 'LEGACY_V1',
      businessOutcome,
      businessReason,
      successMetric,
      proofRequired,
      verificationOwner: fields.verification_owner ?? 'UNSPECIFIED',
      title: issue.title ?? '',
      body: issue.body ?? '',
    }),
  };
}

export { BUSINESS_VALUE_CONTRACT };

export function hasWatcherVisibleLabels(issue) {
  const names = new Set((issue?.labels ?? []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean));
  return names.has('agent-orchestration') && names.has('orch:ready');
}
