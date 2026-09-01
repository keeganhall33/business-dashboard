# Issue 774 reboot/login recovery check

This check is the documented runtime proof expected after a real host reboot or login. It is intentionally read-only except for the existing watcher writing its normal orchestration V3 state files.

## Expected proof

1. The V3 launchd watcher is loaded and has a live PID.
2. No legacy orchestration services or processes are active.
3. `scripts/orchestration-v3/doctor.mjs` reports:
   - `QUEUE.ACTIVE_COUNT`
   - `QUEUE.READY_RESERVE_COUNT`
   - `QUEUE.LOW_WATERMARK_STATE`
   - `QUEUE.LAST_REPLENISH_AT`
   - `QUEUE.LAST_RECOVERY_RESULT`
4. `QUEUE.LAST_RECOVERY_RESULT` is `STARTUP_RECONCILIATION_COMPLETE` after the first post-login watcher poll.
5. `QUEUE.LOW_WATERMARK_STATE` is not inferred from labels alone. It is computed from live lease evidence plus dependency-safe ready reserve candidates.
6. If fewer than six safe file-isolated active/reserve tasks exist, the state is `FAIL_CLOSED_INSUFFICIENT_SAFE_WORK`; the watcher must not invent duplicate or colliding work to hit utilization.

## Read-only commands

```bash
node scripts/orchestration-v3/liveness-report.mjs --github --pretty
node scripts/orchestration-v3/doctor.mjs
```

## Acceptance interpretation

- `HEALTHY`: active and reserve work can safely target six workers while maintaining at least three ready reserve tasks.
- `REPLENISHMENT_REQUIRED`: reserve has fallen below the replenish threshold and the queue needs more dependency-safe work before normal churn consumes it.
- `FAIL_CLOSED_INSUFFICIENT_SAFE_WORK`: fewer than six safe file-isolated tasks exist across active leases and reserve candidates, so the control plane must stop short instead of fabricating utilization.
- `UNKNOWN`: startup recovery proof has not been produced yet or the queue watermark state file is unavailable.
