export class ExternalIntelligencePersistenceError extends Error {
  name = "ExternalIntelligencePersistenceError";
}

export class PersistenceIdempotencyConflictError extends ExternalIntelligencePersistenceError {
  name = "PersistenceIdempotencyConflictError";
}

export class PersistenceCompletenessError extends ExternalIntelligencePersistenceError {
  name = "PersistenceCompletenessError";
}

export class PersistenceNotFoundError extends ExternalIntelligencePersistenceError {
  name = "PersistenceNotFoundError";
}

export class PersistenceUnauthorizedError extends ExternalIntelligencePersistenceError {
  name = "PersistenceUnauthorizedError";
}

export class PersistenceInvalidArgumentError extends ExternalIntelligencePersistenceError {
  name = "PersistenceInvalidArgumentError";
}

export class PersistenceLinkedVersionNotFoundError extends ExternalIntelligencePersistenceError {
  name = "PersistenceLinkedVersionNotFoundError";
}

export class PersistenceVersionRefMismatchError extends ExternalIntelligencePersistenceError {
  name = "PersistenceVersionRefMismatchError";
}

export class PersistenceLegalHoldBlockedError extends ExternalIntelligencePersistenceError {
  name = "PersistenceLegalHoldBlockedError";
}

export class PersistenceRunCompletionBlockedError extends ExternalIntelligencePersistenceError {
  name = "PersistenceRunCompletionBlockedError";
}

export class PersistenceUnknownDatabaseError extends ExternalIntelligencePersistenceError {
  name = "PersistenceUnknownDatabaseError";
}
