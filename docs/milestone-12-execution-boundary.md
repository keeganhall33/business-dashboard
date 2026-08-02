# Milestone 12 — Execution Boundary (control plane, mock-only)

Milestone 12 defines and implements the **execution safety boundary** between an internally-approved action (L4) and any future real external side effect.

**This milestone does not enable any real provider integrations.**

- no emails
- no ad changes
- no website publishing
- no spend
- no customer communication
- no external execution network calls
- production is always hard-blocked

---

## Goals

1. Separate **approval to execute** from **actual execution**.
2. Require a successful **dry run** and explicit **operator confirmation** immediately before execution.
3. Implement locking + idempotency so execution attempts are deterministic and safe.
4. Persist execution requests/attempts/steps/results/rollbacks/confirmations/locks/idempotency.
5. Provide a provider-agnostic adapter contract and a staging-only **mock** adapter.

---

## Lifecycle boundaries

### Milestone 11 action lifecycle (stable)

Milestone 11 remains the durable action lifecycle in `action_actions_v1.status`:

- recommended → draft_prepared → awaiting_approval → approved
- plus: rejected, snoozed, needs_revalidation, expired
- plus synthetic measurement lane

**L4 approval never triggers execution.**

### Execution state (Milestone 12)

Execution state is persisted in execution tables (not `action_actions_v1.status`).

Allowed execution states:

- requested
- dry_run_succeeded
- confirmation_required
- confirmed
- queued
- started
- succeeded
- partial_succeeded
- failed
- timeout
- cancel_requested
- cancelled
- rollback_requested
- rolled_back
- rollback_failed
- blocked

An action may have multiple historical execution requests/attempts, but only one active execution lock.

---

## State machine (execution)

### Core happy path

requested → dry_run_succeeded → confirmation_required → confirmed → queued → started → succeeded

### Failure + rollback

started → failed → rollback_requested → rolled_back | rollback_failed

A failed attempt remains historically failed even if rollback later succeeds.

### Cancellation

queued | started → cancel_requested → cancelled

### Blocking

Any state may transition to `blocked` when kill switches or policy rules block progress.

---

## Operator identity (Milestone 12)

- The operator identifier is derived server-side from the authenticated request actor string.
- Must be non-empty and normalized.
- Must not contain or resolve to an agent identity.
- Browser-supplied operator identity is never trusted.

Interim limitation: this milestone does not implement a new identity system.

---

## Canonical JSON + payload hashing (contract)

Execution uses deterministic canonical JSON serialization.

Rules:

- recursively sort object keys lexicographically
- preserve array order
- omit `undefined`
- reject: functions, symbols, cyclic values, unsupported object types
- reject: non-finite numbers
- normalize dates to ISO strings only when explicitly accepted by the contract
- encode canonical UTF-8 string and hash with SHA-256 (lowercase hex)

The canonicalization implementation is part of the execution contract and is used for:

- execution request payload hash
- confirmation payload hash
- execution-time payload verification
- rollback plan hash (where applicable)
- idempotency request hash

Any payload change after confirmation invalidates confirmation.

---

## Confirmation expiry

Confirmation window is controlled by:

- `ACTIONS_EXECUTION_CONFIRMATION_TTL_SECONDS`
  - default: 900 (15 minutes)
  - min: 60
  - max (staging): 3600

Rules:

- expiry calculated server-side
- expired confirmations cannot be extended in place
- a new dry run + new confirmation is required after expiry
- payload or action-state changes invalidate confirmation immediately

---

## Reversibility classification

Each execution request must declare `reversibility`:

- reversible
- partially_reversible
- irreversible

Requirements:

- explicit value before confirmation
- adapter capability declaration
- rollback-plan validation for reversible + partially reversible
- irreversible actions require:
  - an explanation
  - stronger operator confirmation
  - a second explicit irreversible acknowledgement

Category-based defaults may prefill or restrict but may not silently determine the value.

---

## Kill switches (default deny)

All gates default to deny.

Staging flags:

- `ACTIONS_ENABLE_EXECUTION_BOUNDARY=1`
- `ACTIONS_ENABLE_MOCK_EXECUTION=1`

Both must be enabled for any mock execution.

Hard blocks regardless of flags:

- `NODE_ENV=production`
- production Supabase project ref
- unknown environment
- unknown adapter
- missing configuration

---

## Adapter contract

Milestone 12 defines a provider-agnostic execution adapter interface with:

- capabilities snapshot
- validate
- dryRun (preview + blocking reasons)
- execute
- verify
- rollback
- cancel
- getStatus
- getRollbackPreview

Milestone 12 ships only a staging-only **mock** adapter.

---

## Non-goals

- No real provider adapters.
- No external execution network calls.
- No production writes.
