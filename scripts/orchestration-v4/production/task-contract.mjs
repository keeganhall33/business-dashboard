const FIELD = /^\*\*([a-zA-Z0-9_]+):\*\*\s*(.+?)\s*$/gm;
const ALLOWED_TASK_MUTABILITY = new Set([
  'IMPLEMENTATION_MUTATION_REQUIRED',
  'VALIDATION_EVIDENCE_ONLY',
  'EVIDENCE_ONLY',
]);
const INTEGRATION_PR_REFERENCE = /(?:\bPR\b|\bpull request\b)\s*[:=-]?\s*#?\s*\d+\b/i;

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
  return {
    ok: errors.length === 0,
    errors,
    task: errors.length ? null : Object.freeze({
      taskId: fields.task_id,
      issueNumber: issue.number,
      stream: fields.stream,
      taskMutability: fields.task_mutability,
      fileOwnership: fields.file_ownership,
      title: issue.title ?? '',
      body: issue.body ?? '',
    }),
  };
}

export function hasWatcherVisibleLabels(issue) {
  const names = new Set((issue?.labels ?? []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean));
  return names.has('agent-orchestration') && names.has('orch:ready');
}
