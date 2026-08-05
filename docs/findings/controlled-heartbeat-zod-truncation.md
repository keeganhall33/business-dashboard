# Finding: Controlled heartbeat audit truncates runtime Zod error details

## Summary
The controlled operator audit persists `safe_error_summary` using `safeSummary(error)` which truncates `error.message` to 300 characters.

When a handler fails due to a ZodError, the full issue list (paths, codes, expected/received) is not preserved, leaving only a truncated string in `system_state`.

## Where truncation occurs
- `src/lib/external-intelligence/orchestration/controlled-heartbeat-operator.ts`
  - `safeSummary(error)` returns `error.message.slice(0, 300)`
  - audit field `safe_error_summary` uses `safeSummary(error)`

## Information lost
- Full Zod issue array (`issues[]`), including:
  - `path`
  - `code`
  - `expected` / `received` (where safe)
  - `message`

## Proposed safe bounded structure (future work)
Persist a separate bounded field such as `safe_error_issues` only when the error is a ZodError:
- include only: `path`, `code`, `message`, and small scalar expectation fields
- cap: max issues (e.g., 25) and max string length per field (e.g., 200)
- never persist raw input values or full objects

## Scope guard
This is diagnostic-only follow-up and should remain separate from functional handler fixes.
