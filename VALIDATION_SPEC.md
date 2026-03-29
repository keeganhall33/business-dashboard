# Operator Command System — Validation & Typing Spec

_All backend writes must pass through this layer. No freelancing._

## 1. Shared Request Types (`src/lib/types/requests.ts`)

- `TaskPriority`, `TaskStatus`, `ExecutionType`, `OpportunityType`, `OpportunityStatus`, `DecisionType`, `RunType`, `AgentKey` enums.
- Request interfaces: `CreateTaskRequest`, `ApproveTaskRequest`, `RejectTaskRequest`, `UpdateTaskStatusRequest`, `CompleteTaskRequest`, `CreateOpportunityRequest`, `UpdateOpportunityStatusRequest`, `CreateDecisionRequest`, `RunAgentRequest`, plus empty bodies for automation endpoints.

## 2. Zod Schemas (`src/lib/validation`) 

```
common.ts        → enums, trimmed strings, ISO datetime/date, numeric helpers
tasks.ts         → create/approve/reject/status/complete/query schemas
opportunities.ts → create/update/query schemas
decisions.ts     → create decision schema
agents.ts        → run agent schema (defaults runType to "manual")
automation.ts    → empty body schema for scheduler endpoints
```

Key helpers:
- `nonEmptyTrimmedString`, `optionalTrimmedString`
- `optionalStringArraySchema`
- `isoDatetimeSchema`, `isoDateOrDatetimeSchema`, and optional variants
- `probabilitySchema`, `scoreTenSchema`, `nonNegativeNumberSchema`

## 3. Parsing Helpers (`src/lib/validation/parse.ts`)

- `parseJsonBody(request, schema)` → returns `{ success, data } | { success, error }`, collecting `ZodError` issues.
- `parseSearchParams(searchParams, schema)` → same pattern for queries.

## 4. Response Helpers (`src/lib/api/responses.ts`)

Add `validationError(message, issues)` alongside `ok`, `badRequest`, `notFound`, `serverError` so routes can return structured validation feedback.

## 5. Route Usage

Every write route must:
1. Parse JSON via `parseJsonBody` with the correct schema.
2. On failure, return `validationError(parsed.error.message, parsed.error.issues)`.
3. On success, call the query-layer helper.

Read routes with filters (e.g., `/api/tasks`, `/api/opportunities`) must parse `URLSearchParams` via `parseSearchParams`.

## 6. Task Status Domain Guard (`src/lib/domain/taskStatus.ts`)

```
const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_review","approved","rejected"],
  in_review: ["approved","rejected","blocked"],
  approved: ["in_progress","blocked","rejected"],
  in_progress: ["blocked","completed"],
  blocked: ["in_review","approved","rejected"],
  completed: [],
  rejected: []
};

export function canTransitionTaskStatus(current: TaskStatus, next: TaskStatus) {
  return allowedTransitions[current].includes(next);
}
```

## 7. `updateTaskStatus` Hardening (queries layer)

- Fetch existing task.
- Reject invalid transitions via `canTransitionTaskStatus`.
- Enforce approval: if `requires_approval && !approved_by_user && nextStatus ∈ {in_progress, completed}`, throw.
- Update status and return row.

## 8. Approval Gate Reminder

All routes that change status must honor the approval check above. Never bypass it inside route handlers.

## 9. Typed Examples

- `/api/tasks` GET/POST
- `/api/tasks/[id]/approve|reject|status|complete`
- `/api/opportunities` GET/POST, `/api/opportunities/[id]/status`
- `/api/decisions` POST
- `/api/agents/run/[agentKey]`

All of these now use the schemas + helpers. Samples in the user brief should be mirrored.

## 10. Request Validation Contract

- No inline `if (!body.title)` checks.
- All enums enforced through Zod.
- All strings trimmed.
- All datetime strings validated.
- All responses typed.

## 11. Additional Suggestions

- Optional: type API success/error responses (`ApiErrorResponse`, etc.).
- Optional: accept both ISO datetimes and plain dates for `dueAt`, `nextStepDueAt`, `outcomeReviewDate` using `isoDateOrDatetimeSchema`.

## 12. Implementation Instruction

Use verbatim:

> Harden the backend API using Zod validation and shared request types.
>
> Requirements:
> 1. Create shared request types in `src/lib/types/requests.ts`.
> 2. Create shared Zod schemas in `src/lib/validation/common.ts`, `tasks.ts`, `opportunities.ts`, `decisions.ts`, `agents.ts`, and `automation.ts`.
> 3. Create shared parsing helpers in `src/lib/validation/parse.ts`.
> 4. Update all write routes to parse through Zod and return `validation_error` responses on failure.
> 5. Add query validation for read routes.
> 6. Add strict task status transition checks (plus approval gating) before updates.
> 7. Keep everything modular, typed, and production-ready.

No work should start without this contract.
