export const LEARNING_STATUSES = Object.freeze({ CANDIDATE: 'CANDIDATE', ACTIVE: 'ACTIVE', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED' });

export function createLearningConstraint({ id, rule, appliesWhen, evidence, sourceTaskId, sourceCommit, expiresAt = null, impact = 'NORMAL' } = {}) {
  if (!id || !rule || !appliesWhen || !evidence || !sourceTaskId || !/^[0-9a-f]{40}$/i.test(String(sourceCommit ?? ''))) {
    throw new Error('V4_LEARNING_CONSTRAINT_INCOMPLETE');
  }
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) throw new Error('V4_LEARNING_EXPIRY_INVALID');
  return Object.freeze({
    id: String(id), rule: String(rule), appliesWhen: String(appliesWhen), evidence: String(evidence),
    sourceTaskId: String(sourceTaskId), sourceCommit: String(sourceCommit), expiresAt,
    impact: String(impact).toUpperCase(), status: LEARNING_STATUSES.CANDIDATE, version: 1,
  });
}

export function promoteLearningConstraint(constraint, { approvedBy, now = new Date() } = {}) {
  if (constraint?.status !== LEARNING_STATUSES.CANDIDATE) throw new Error('V4_LEARNING_NOT_CANDIDATE');
  if (!approvedBy) throw new Error('V4_LEARNING_APPROVER_REQUIRED');
  if (constraint.impact === 'HIGH' && approvedBy === 'AUTOMATION') throw new Error('V4_LEARNING_HIGH_IMPACT_HUMAN_REQUIRED');
  if (constraint.expiresAt && Date.parse(constraint.expiresAt) <= new Date(now).getTime()) throw new Error('V4_LEARNING_ALREADY_EXPIRED');
  return Object.freeze({ ...constraint, status: LEARNING_STATUSES.ACTIVE, approvedBy: String(approvedBy), approvedAt: new Date(now).toISOString() });
}

export function activeConstraints(constraints, { now = new Date(), context = '' } = {}) {
  const timestamp = new Date(now).getTime();
  return constraints.filter((constraint) => constraint.status === LEARNING_STATUSES.ACTIVE
    && (!constraint.expiresAt || Date.parse(constraint.expiresAt) > timestamp)
    && (!context || context.includes(constraint.appliesWhen)));
}
