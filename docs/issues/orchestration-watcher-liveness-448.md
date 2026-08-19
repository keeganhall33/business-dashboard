# Issue 448 Orchestration Watcher Liveness Recovery

Recovery check timestamp: 2026-08-18T19:18:46Z.

## Runtime State

- LaunchAgent `com.keegan.jeeves.orchestration-v3` was running from `/Users/keeganhall/Library/LaunchAgents/com.keegan.jeeves.orchestration-v3.plist`.
- Watcher host PID `86255` was running `/Users/keeganhall/.openclaw/runtime-v3/business-dashboard/scripts/orchestration-v3/watcher-host.mjs --interval 60`.
- Watcher PID `86256` was running `scripts/orchestration-v3/watcher.mjs --interval 60`.
- Idle sleep guard PID `86257` was alive through `caffeinate -i -w watcher_pid`.
- The latest heartbeat showed `watcher_alive: true`, `active_worker_count: 4`, and active leases for `local-a`, `local-b`, `local-c`, and `local-d`.

## Active Runtime Leases

| Worker | Issue | PID | Started At | Worktree |
| --- | ---: | ---: | --- | --- |
| local-a | 597 | 7717 | 2026-08-18T19:13:37.554Z | `/Users/keeganhall/.openclaw/worktrees/local-a` |
| local-b | 608 | 86949 | 2026-08-18T18:59:14.658Z | `/Users/keeganhall/.openclaw/worktrees/local-b` |
| local-c | 598 | 97443 | 2026-08-18T19:08:29.289Z | `/Users/keeganhall/.openclaw/worktrees/local-c` |
| local-d | 448 | 86800 | 2026-08-18T18:59:05.966Z | `/Users/keeganhall/.openclaw/worktrees/local-d` |

Each live worker log contained a fresh `WORKER_START` record with a healthy worktree preflight and configured model `ollama/qwen3.5:9b`.

## Queue State

Open product claims with `agent-orchestration` and `orch:running` were:

- #597, Decision Under Uncertainty V1, worker `local-a`.
- #598, Decision Room V1, worker `local-c`.
- #608, external knowledge into production Fusion, worker `local-b`.

The current recovery worker #448 had live process and lease evidence but the GitHub issue was already closed with only the `agent-orchestration` label. No stale open `orch:running` claim was found without matching runtime evidence.

Open ready items remained available for normal backfill after a worker slot exits: #613, #611, #610, #609, #607, #600, and #337. The older preference list from the issue body (#537, #535, #536, #538, #416, #542) was no longer present in the current ready queue.

## Action Taken

No watcher restart was performed because launchd, host PID, watcher PID, heartbeat, and worker leases were healthy.

No lease or lock was manually reconciled because each active lease had a live PID. The controller's normal reconciler had already requeued earlier stale claims that lacked authoritative live leases.

The controller was left running for normal immediate backfill.

## 2026-08-19 Follow-up Recovery Evidence

Recovery check timestamp: 2026-08-19T20:00:46Z.

The watcher remained launchd-owned and alive from the current V3 host configuration:

- LaunchAgent `com.keegan.jeeves.orchestration-v3` was loaded.
- Watcher host PID `39911` was alive and running `/Users/keeganhall/.openclaw/runtime-v3/business-dashboard/scripts/orchestration-v3/watcher-host.mjs --interval 20`.
- Latest heartbeat was fresh at `2026-08-19T20:00:45.522Z` with `watcher_alive: true`.

The incident was narrowed to worker worktree health, not a stopped watcher. `local-a` had no live owner and failed preflight with `MASS_TRACKED_DELETION`, preventing CORE_INTELLIGENCE ready-lane claims. The stale `local-a` lease was removed only after runtime ownership checks showed no live worker process, and the disposable `local-a` worktree was rebuilt from `origin/main`.

Post-repair liveness evidence showed:

| Worker | Issue | PID | Started At | Worktree |
| --- | ---: | ---: | --- | --- |
| local-a | 654 | 850 | 2026-08-19T19:59:06.830Z | `/Users/keeganhall/.openclaw/worktrees/local-a` |
| local-d | 448 | 90945 | 2026-08-19T19:44:50.613Z | `/Users/keeganhall/.openclaw/worktrees/local-d` |

GitHub `orch:running` claims were #654 and #448, and `running_claims_without_live_lease` was empty. Ready items #653 and #287 remained mapped to `local-a` for normal backfill when the active CORE_INTELLIGENCE worker slot exits; #337 remained unmapped by stream ownership. No production or business action was performed.

## 2026-08-19 Local-C Capacity Repair Evidence

Recovery check timestamp: 2026-08-19T20:11:55Z.

The watcher remained healthy, but `doctor.mjs` still reported a degraded control plane because idle worker `local-c` had `MASS_TRACKED_DELETION`. Runtime ownership checks showed no live `local-c` worker process and no active `local-c` lease, so the disposable `local-c` worktree state was backed up to `/Users/keeganhall/.openclaw/orchestration-v3-backups/local-c-repair-20260819T201123Z` and rebuilt from `origin/main`.

Post-repair doctor evidence showed `CONTROL_PLANE: HEALTHY`, all worker worktrees healthy, `WORKER_EFFECTIVE_HEALTH` true for `local-a`, `local-b`, `local-c`, and `local-d`, one V3 watcher process, no legacy watcher processes, and Ollama model `qwen3.5:9b` loaded. Liveness evidence showed live workers `local-a`/#654 and `local-d`/#643, with `running_claims_without_live_lease` empty. The remaining ready queue was #653 and #287 for `CORE_INTELLIGENCE` when `local-a` exits, plus unmapped #337; there was no dependency-safe UX or discovery ready lane for idle `local-b` or `local-c` to claim at that moment.
