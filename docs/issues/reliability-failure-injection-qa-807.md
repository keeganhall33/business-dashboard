# Issue 807 reliability failure-injection QA

## Scope

This QA pass independently checked the reliability acceptance surface for #772, #773, and #774 against current `main`, open reliability PR state, GitHub issue evidence, and focused orchestration V3 tests.

Canonical grounding was read from `docs/ARCHITECTURE.md`. This change records QA evidence only; it does not alter product semantics, schemas, migrations, credentials, production settings, deployment, scheduler ownership, or orchestration runtime behavior.

## Acceptance state

Overall state: `FAIL_WITH_MISSING_EVIDENCE`.

Keegan action required: `NO`.

| Surface | State | Evidence |
| --- | --- | --- |
| Watcher restart / host supervisor (#772) | `NOT_PROVEN` | Issue #772 has blocked orchestration comments and no accepted PR/runtime proof for automatic watcher restart, crash-loop suppression, or doctor supervisor fields. Current `main` has `test/orchestration-v3-host-recovery.test.mjs`, which covers bounded host-recovery behavior, but it does not prove the full #772 launchd supervisor contract. |
| Worker failure / queue reserve replenishment (#774) | `NOT_PROVEN` | Issue #774 remains open/running with blocked orchestration evidence and no accepted PR. Current `main` contains backfill and host-recovery tests, but no current accepted queue watermark/replenishment harness proving watcher crash, one worker crash, stale lease, and empty-reserve recovery together. |
| Stale lease reconciliation (#773 / PR #806) | `PARTIAL_FAIL` | PR #806 adds `test/orchestration-v3-lease-ttl-scavenger.test.mjs` and lease-reconciliation code for live lease preservation, orphaned PID, stale heartbeat, PID reuse/worktree mismatch, and same-cycle backfill. Its PR body records local focused tests/typecheck/build as passing, but authoritative Orchestration V3 CI control-plane failed 45/47 with two failing tests, so QA does not accept the runtime control-plane claim. |
| Label-only acceptance guard | `PASS` | The accepted QA state does not rely on `orch:*` labels alone. Labels were treated as routing metadata; issue comments, PR files, CI status, local focused tests, and runtime-proof presence/absence determined the state. |
| Doctor clean-worktree / no-legacy-process contract | `PASS_FOR_CURRENT_MAIN_TEST_CONTRACT` | Current `test/orchestration-v3-control-plane.test.mjs` asserts doctor tolerates only bounded active-worker dirt, rejects mass deletion as tolerated state, and fails if legacy orchestration runtime surfaces remain active. This is a deterministic test contract, not live host runtime proof. |

## Focused test coverage checked

Current `main` includes deterministic tests for:

- watcher/host restart safety via `test/orchestration-v3-host-recovery.test.mjs`;
- stale lease and stale running claim contracts via `test/orchestration-v3-stale-lease-reconcile.test.mjs` and `test/orchestration-v3-stale-running-reconciliation.test.mjs`;
- same-cycle backfill and non-overlap behavior via `test/orchestration-v3-perfect-backfill.test.mjs`;
- doctor/worktree/legacy-process assumptions via `test/orchestration-v3-control-plane.test.mjs`;
- liveness report shape via `test/orchestration-v3-liveness-report.test.mjs`.

PR #806 additionally introduces `test/orchestration-v3-lease-ttl-scavenger.test.mjs`, but the PR is not release-accepted while its control-plane CI is failing.

## Missing evidence

- #772 lacks accepted PR evidence and live/proven supervisor restart evidence for the full launchd watcher restart contract.
- #774 lacks accepted PR evidence and an end-to-end failure-injection harness for watcher crash, worker crash, stale lease, and empty reserve recovery.
- #806/#773 lacks green authoritative control-plane CI after adding lease TTL behavior.
- No live host reboot/login runtime proof was found during this QA pass; that remains `UNKNOWN`, not inferred from tests.

## Bounded follow-up

Fix PR #806's two failing Orchestration V3 CI control-plane tests, then add or land a single failure-injection acceptance harness for #774 that simulates watcher crash, worker crash, stale lease, and empty reserve replenishment without mutating host runtime state.

## Commands run

- `gh issue view 772 --repo keeganhall33/business-dashboard --json number,title,state,body,labels,comments`
- `gh issue view 773 --repo keeganhall33/business-dashboard --json number,title,state,body,labels,comments`
- `gh issue view 774 --repo keeganhall33/business-dashboard --json number,title,state,body,labels,comments`
- `gh pr view 806 --repo keeganhall33/business-dashboard --json number,title,state,body,files,commits,headRefName,baseRefName,mergeStateStatus,statusCheckRollup,url`
- `gh run view 32828587794 --repo keeganhall33/business-dashboard --job 97741990981 --log-failed`
