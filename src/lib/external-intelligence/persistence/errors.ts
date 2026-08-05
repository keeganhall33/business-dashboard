export class ExternalIntelligencePersistenceError extends Error {
  name = "ExternalIntelligencePersistenceError";

  /**
   * Explicit retry classification.
   * Callers must not assume all DB failures are retryable.
   */
  retryable = false;
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

  // Default unknown DB failures to retryable; callers may downgrade based on context.
  retryable = true;
}

export class PersistenceObjectTypeMismatchError extends ExternalIntelligencePersistenceError {
  name = "PersistenceObjectTypeMismatchError";
}

export class PersistenceContentHashMismatchError extends ExternalIntelligencePersistenceError {
  name = "PersistenceContentHashMismatchError";
}

export class PersistencePolicyMismatchError extends ExternalIntelligencePersistenceError {
  name = "PersistencePolicyMismatchError";
}
