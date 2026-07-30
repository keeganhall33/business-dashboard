# Milestone 11 — Action Center (durable lifecycle, no execution)

Milestone 11 adds a **durable, governed action lifecycle** that turns Milestone 10 recommendations into persisted actions with:

- immutable evidence snapshot linkage
- fingerprint-based deduplication
- explicit state transitions (validated)
- audit events for every transition (actor + idempotency key)
- internal-only approval (no external side effects)
- synthetic-only measurement/outcomes

## Safety guarantees

- **No production writes.** Server-side persistence is blocked in `NODE_ENV=production`.
- **Writes are gated** by `ACTIONS_ENABLE_WRITES=1` (local/staging only).
- Approval updates internal state only and explicitly returns:

> Approved for future execution. No external action has been performed.

## Data model

Additive migration (local/staging):
- `supabase/migrations/20260730_add_action_center_v1.sql`
- `...rollback.sql`

Core tables:
- `action_actions_v1` — durable action record
- `action_evidence_snapshots_v1` — immutable evidence blobs + hash
- `action_audit_events_v1` — append-only audit trail
- `action_comments_v1` — operator notes
- `action_measurement_plans_v1` — per-action measurement plan
- `action_preferences_v1` — future suppression/learning hooks
- `action_synthetic_outcomes_v1` — synthetic measurement outcomes

Key constraints:
- check constraints for `status` + `current_level` + `approval_level`
- active-action dedupe by `recommendation_fingerprint` (partial unique index)

## Transition matrix

## Verification (staging-safe)

All Milestone 11 verification is designed to produce **zero external execution** and **zero production requests**.

### Phase C: 22-scenario harness

Run (staging env + 1Password):

```bash
OP_SERVICE_ACCOUNT_TOKEN="$SERVICE_TOKEN" \
  /opt/homebrew/bin/op run \
  --env-file .env.actions-staging.local \
  -- pnpm -s tsx scripts/m11-run-action-center-scenarios.ts --phase C
```

Artifact:

- `.artifacts/milestone-11-action-center/phase-c-report.json`

Expected invariants:

- selected/executed/passed: **22/22/22**
- failed/skipped: **0/0**
- `external_side_effect_count: 0`
- `production_request_count: 0`
- cleanup ok with `remaining_harness_rows: 0`

### Authenticated API integration probe

Run:

```bash
OP_SERVICE_ACCOUNT_TOKEN="$SERVICE_TOKEN" \
  /opt/homebrew/bin/op run \
  --env-file .env.actions-staging.local \
  -- pnpm -s tsx scripts/m11-action-center-api-integration.ts
```

Artifact:

- `.artifacts/milestone-11-action-center/api-integration-report.json`

### Playwright (UI smoke across desktop + mobile)

Local dev server (staging env, but API auth disabled for browser-origin requests):

```bash
OP_SERVICE_ACCOUNT_TOKEN="$SERVICE_TOKEN" \
  /opt/homebrew/bin/op run \
  --env-file .env.actions-staging.local \
  -- bash -lc 'DASHBOARD_ADMIN_TOKEN= ACTIONS_ENABLE_WRITES=1 ACTIONS_ENABLE_SYNTHETIC_OUTCOMES=1 pnpm -s dev --port 3456'
```

Run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3456 \
  pnpm exec playwright test --config playwright.config.local.ts e2e/m11-action-center.spec.ts --reporter=json \
  > .artifacts/milestone-11-action-center/playwright-report.json
```

Validated in `src/lib/actions/action-transitions.ts` and tested in `test/actions/action-transitions.test.tsx`.

Minimum supported transitions:
- `recommended → draft_prepared`
- `draft_prepared → awaiting_approval`
- `awaiting_approval → approved|rejected|snoozed`
- `snoozed → awaiting_approval`
- `approved → execution_blocked`

Synthetic-only lane:
- `approved → measuring → successful|unsuccessful|inconclusive`

Staleness:
- `revalidate` can mark `needs_revalidation` for active actions when evidence hash changes.
- explicit `expire` transition supported.

## APIs

Routes (all auth-protected via `DASHBOARD_ADMIN_TOKEN`):
- `GET /api/actions` (list)
- `POST /api/actions` (create from recommendation + evidence snapshot; fingerprint dedupe)
- `GET /api/actions/[id]`
- `GET /api/actions/[id]/audit`
- `POST /api/actions/[id]/comment`
- `POST /api/actions/[id]/prepare`
- `POST /api/actions/[id]/ready`
- `POST /api/actions/[id]/approve` (internal-only)
- `POST /api/actions/[id]/reject`
- `POST /api/actions/[id]/snooze`
- `POST /api/actions/[id]/unsnooze`
- `POST /api/actions/[id]/revalidate`
- `POST /api/actions/[id]/expire`
- `POST /api/actions/[id]/block`
- Synthetic-only:
  - `POST /api/actions/[id]/measure`
  - `POST /api/actions/[id]/complete`
  - `POST /api/actions/[id]/outcome`

All mutating routes require `x-idempotency-key` and write an audit event.

## UI

- Action Center UI is integrated into `/act`.
- Sections: Needs approval, Drafts, Recommended next, Waiting, Approved (not executed), Completed (synthetic).

## Staging verification

This repo requires Docker for local Supabase verification via `supabase` CLI.
If Docker isn’t available, migrations can’t be applied locally from this environment.

Recommended staging steps:
1. Apply migration `20260730_add_action_center_v1.sql` on staging Supabase.
2. Exercise flows via `/act`:
   - create action from recommendation
   - prepare → ready → approve
   - verify audit events include idempotency keys
3. Roll back with `...rollback.sql` and reapply to confirm reversibility.
