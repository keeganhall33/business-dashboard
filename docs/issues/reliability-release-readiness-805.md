# Reliability Changes Release-Readiness Gate V1

Issue: #805
Generated: 2026-08-25T08:59:21.364Z
Result: BLOCKED_WITH_REASON

## Scope

This gate inspected current `origin/main` and open PRs that could affect orchestration reliability, especially watcher, lease, queue, and release-train behavior.

The only current open reliability PR affecting those surfaces is:

- PR #806, issue #773, `issue-773-lease-ttl-scavenger`

Active product work was kept out of the reliability release decision:

- PR #811, issue #802, `issue-802-evidence-freshness-badge`, Executive UX only, currently blocked from the release train by pending checks at evaluation time.

## Reliability PR #806

State:

- Head: `issue-773-lease-ttl-scavenger`
- Base: `main`
- Mergeable: `MERGEABLE`
- Release-train check state: `FAILED`
- Gate decision: `BLOCKED_WITH_REASON`

Changed files:

- `scripts/orchestration-v3/doctor.mjs`
- `scripts/orchestration-v3/lease-reconciliation.mjs`
- `scripts/orchestration-v3/liveness-report.mjs`
- `scripts/orchestration-v3/watcher.mjs`
- `scripts/orchestration-v3/worker.mjs`
- `test/orchestration-v3-lease-ttl-scavenger.test.mjs`

Isolation:

- All changed files are orchestration-v3 runtime/doctor/liveness/worker/lease support plus focused tests.
- No product UX, schemas, migrations, credentials, deployment settings, production handlers, or business semantics changed.
- No file overlap with the active Executive UX PR #811.

Validation evidence in PR body:

- `npm exec -- node --test test/orchestration-v3-lease-ttl-scavenger.test.mjs test/orchestration-v3-perfect-backfill.test.mjs test/orchestration-v3-liveness-report.test.mjs test/orchestration-v3-stale-running-reconciliation.test.mjs`
- `npm exec -- tsc --noEmit`
- `npm run build`
- `git diff`
- `git diff --check`

Fresh CI evidence:

- `Validated Main / Validate integrated code`: SUCCESS
- Vercel status: SUCCESS
- `Orchestration V3 CI / control-plane`: FAILURE

The failed control-plane job ran:

`node --test test/orchestration-v3-control-plane.test.mjs test/orchestration-v3-agent-exec-entrypoint.test.mjs test/orchestration-v3-local-tool-diagnostic.test.mjs test/orchestration-v3-local-tool-observed.test.mjs test/orchestration-v3-code-mode-bridge.test.mjs test/orchestration-v3-stale-lease-reconcile.test.mjs test/orchestration-v3-stale-running-reconciliation.test.mjs test/orchestration-v3-github-transient-safety.test.mjs`

Observed failure summary:

- 47 tests total
- 45 passing
- 2 failing
- Failing coverage includes `V3 never converts unknown GitHub running state into a stale live lease`.
- Failing coverage also includes stale-lease reconciliation expectations in `test/orchestration-v3-stale-lease-reconcile.test.mjs`.

Because this is a reliability change to watcher/lease behavior, the failed control-plane check is authoritative. PR #806 must not be released from stale PR-body validation alone.

## Release-Train Dry Run

Command:

`npm exec -- node scripts/orchestration-v3/integration-queue.mjs --dry-run`

Result:

- `dryRun: true`
- `merged: []`
- Release train state: `RECONCILIATION_REQUIRED`
- Merge queue: `[]`
- Current eligible PR count: `0`

Reliability-specific skipped candidate:

- PR #806 / issue #773: `CHECKS_FAILED`

Other current skipped candidates:

- PR #811 / issue #802: `CHECKS_PENDING`
- PR #705 / issue #677: `NOT_MERGEABLE:CONFLICTING`, `MISSING_VALIDATION_EVIDENCE`
- PR #702 / issue #678: `MISSING_VALIDATION_EVIDENCE`
- PR #695 / issue #694: `NOT_MERGEABLE:CONFLICTING`
- PR #638 / issue #626: `NOT_MERGEABLE:CONFLICTING`, `CHECKS_FAILED`
- Draft cleanup PRs #616, #617, #619, #620: draft/unverified/missing-validation/check failures

Historical stale PRs remain excluded unless explicitly revived.

## Local Gate Verification

Commands run from protected `local-e` worktree:

- PASS: `npm exec -- node scripts/orchestration-v3/integration-queue.mjs --dry-run`
- PASS: `npm exec -- node --test test/orchestration-v3-integration-queue.test.mjs test/orchestration-v3-release-train.test.mjs` (20/20)
- PASS: `npm exec -- tsc --noEmit`
- PASS: `npm run build`

## Decision

`BLOCKED_WITH_REASON`

Reason:

PR #806 is the only open reliability PR affecting watcher/lease/queue behavior, but it has a real failed `Orchestration V3 CI / control-plane` check covering exactly the affected behavior. The release train dry-run therefore produced no eligible merge queue entries.

## Keegan Action

KEEGAN_ACTION_REQUIRED=NO

No production action, deployment, settings change, credential change, schema change, or business action was performed.
