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
