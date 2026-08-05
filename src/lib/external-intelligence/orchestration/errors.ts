export class OrchestrationError extends Error {
  name = "OrchestrationError";
}

export class LeaseConflictError extends OrchestrationError {
  name = "LeaseConflictError";
}

export class IneligibleScheduleError extends OrchestrationError {
  name = "IneligibleScheduleError";
}
