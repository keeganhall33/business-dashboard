# Orchestration V3

V3 is the canonical Jeeves development control plane. It exists to remove the accumulated host/runtime ambiguity from V1/V2.

## Authoritative call graph

`GitHub orch:ready -> watcher-host.mjs -> watcher.mjs -> worker.mjs -> orchestration-run-issue-openclaw.mjs -> OpenClaw local worker -> Ollama qwen3.5:9b -> machine/result verification -> GitHub labels/result`

Only the V3 watcher owns queue claiming. Only the V3 worker owns one worker turn. The existing runner is temporarily retained as the proven OpenClaw adapter while its useful parsing/evidence logic is migrated behind the V3 worker boundary.

## Invariants

- The watcher runs only from `~/.openclaw/runtime-v3/business-dashboard`, a clean git worktree pinned to a known `origin/main` SHA.
- The normal development checkout is never the scheduler runtime.
- Only explicitly labeled `orch:ready` issues enter the queue. There is no self-healing resurrection of unlabeled historical tasks.
- Exactly four worker identities exist: local-a CORE, local-b DISCOVERY, local-c UX/PRODUCTION_VALUE, local-d orchestration.
- Each worker has at most one live lease/process.
- Every worker worktree passes git-root/tree-integrity preflight before model invocation.
- Local execution is pinned to `ollama/qwen3.5:9b`; cloud fallback is disabled for the V3 local acceptance path.
- Model-authored descriptions are advisory. Git/process/GitHub/runtime evidence is authoritative.
- `human_approval_required:false` can never create a synthetic human review gate.
- A dead worker process releases its lease automatically on the next watcher poll.
- On macOS, `watcher-host.mjs` holds `caffeinate -i -w <watcher-pid>` while V3 is active. This prevents idle system sleep without preventing display sleep, and the assertion ends automatically when the watcher exits.
- launchd keeps the watcher host alive and restarts it after unexpected exit/login startup without creating a second queue owner.
- The watcher host records 60-second continuity heartbeats under the V3 state root, including watcher state, idle-sleep guard state, and active worker leases.
- `node scripts/orchestration-v3/liveness-report.mjs --github --pretty` is the read-only incident proof path for current watcher PID, launchd status, worker leases, live PIDs, worker commands, running claims without live leases, and ready queue backfill candidates.
- `npm run orchestration:v3:overnight-report` summarizes the most recent 22:00-07:00 Pacific window and reports any continuity gap greater than five minutes.
- Overnight operation should require no bedtime action once the host is activated: the display may sleep while V3 keeps the system awake only for the life of the watcher.

## Queue states

`orch:ready` -> `orch:running` -> terminal/no queue label on PASS

Failures -> `orch:blocked`

Actual human approval -> `orch:awaiting_human_approval`

`orch:awaiting_review` remains readable for legacy compatibility but V3 does not use it as a generic successful-task terminal state.

## Cutover policy

V3 is installed in parallel with the legacy runtime. Existing worker worktrees are backed up (patches + untracked files) before they are recreated cleanly. Legacy watcher processes are disabled only after the V3 doctor passes preflight. Old repair helpers/branches/PRs are archived only after the 4/4 acceptance gate succeeds.

## Acceptance gate

Do not call the system fixed until one machine-generated report proves all four workers active with distinct processes/worktrees, provider Ollama, model qwen3.5:9b, zero cloud invocations, zero stale locks, continuous queue replenishment across more than one task cycle, and an overnight report can distinguish a healthy quiet queue from a sleeping or failed control plane.
