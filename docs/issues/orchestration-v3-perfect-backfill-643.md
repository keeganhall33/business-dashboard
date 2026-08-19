# Issue 643 Event-Driven Backfill Verification

Verification timestamp: 2026-08-19T20:13:00Z.

## Current-Main Implementation Evidence

The event-driven V3 backfill implementation is present on current `main`:

- `scripts/orchestration-v3/watcher.mjs` defaults to a 20 second safety interval.
- Worker child exit handlers call `requestWake("WORKER_EXIT", ...)`.
- Poll execution is serialized with `pollInFlight` and coalesced through `pollWakePending`.
- Stale leases and false label-only running claims are reconciled before ready selection.
- One pass can fill multiple dependency-safe idle workers while preventing double-claims with `claimedWorkersThisPass`.
- Background #337 is explicitly deprioritized behind product work.
- `scripts/orchestration-v3/activate-host.mjs` writes the launchd watcher with `--interval 20`.

## Validation Evidence

Focused V3 tests passed:

```text
node --test test/orchestration-v3-perfect-backfill.test.mjs test/orchestration-v3-stale-lease-reconcile.test.mjs test/orchestration-v3-liveness-report.test.mjs test/orchestration-v3-result-contract.test.mjs test/orchestration-v3-cloud-host-verification.test.mjs
tests 24, pass 24, fail 0
```

Repository validation through the observed package-manager wrappers passed:

```text
npx tsc --noEmit
npm run build
```

Runtime verification from the active host showed `CONTROL_PLANE: HEALTHY`, `SAFETY_POLL_SECONDS=20`, one V3 watcher process, no legacy watcher processes, live worker leases for currently mapped work, and `running_claims_without_live_lease=[]`.

## Acceptance Mapping

- `EVENT_DRIVEN_BACKFILL=PASS`
- `SAFETY_POLL_SECONDS=20`
- `POLL_OVERLAP=0`
- `STALE_LEASE_AUTO_RECONCILIATION=PASS`
- `FALSE_LABEL_ONLY_RUNNING=0`
- `KEEGAN_ACTION_REQUIRED=NO`

At the final check, the ready queue contained CORE_INTELLIGENCE tasks mapped to busy `local-a` plus unmapped #337; no four-lane safe ready fixture was present in the live queue, so saturation proof is covered by regression tests and current watcher behavior rather than by fabricating labels.
