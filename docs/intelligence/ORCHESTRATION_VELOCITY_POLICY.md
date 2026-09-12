# Orchestration Velocity Policy

Status: active operating policy.

Goal: maximize reliable development throughput while preserving roadmap scope, review quality, safety, and cost discipline.

## Default behavior

- Keep routine implementation moving without Keegan as a relay.
- Use GitHub as the durable task/result/control surface.
- Jeeves/OpenClaw handles local execution.
- Architect review is required at semantic, schema, security, valuation, recommendation, auth/integration, and other ambiguous interpretation boundaries.
- Keegan approval is required only for credentials/account connections, external outreach/publishing, destructive or material production actions, purchases/contracts, and consequential business decisions.
- Independent safe work continues while another stream is blocked.
- Prefer REFERENCE + DELTA context over replaying full history.
- Use the cheapest capable model for deterministic work and stronger reasoning for architecture/review-sensitive work.
- Track model/session/cost metadata where available.

## Production vertical-slice delivery

The primary unit of progress is a production-verified user or business workflow, not an isolated issue, file, or pull request.

- Keep at most three vertical slices active at once.
- Each slice moves through `DISCOVERY → CONTRACT → IMPLEMENTATION → INTEGRATION → PRODUCTION_VERIFICATION`.
- A slice is not operational until its production-verification task is complete with real evidence.
- Platform primitives enter active work only when they unlock an active slice. Defects that block an active slice receive priority.
- Dependencies are task IDs and must be `COMPLETE` before dependent work is scheduled.
- Permit up to three independent tasks inside one slice and up to five executable tasks per poll; file ownership and schema/semantic serialization rules still apply.
- New vertical-slice tasks must name the outcome, end-to-end user flow, definition of done, dependencies, and machine-run quality gates.
- `DIFF_CHECK`, `TYPECHECK`, and `TEST` are mandatory. Integration tasks also require `BUILD`. Add `LINT` when the owned surface is lintable.
- Coded, integrated, and production verified are separate statuses. Only production verified counts as delivered capability.
- V4 heartbeat and `npm run delivery:status` expose slice progress, WIP, blocked slices, ready work, and dependency deferrals.

Initial outcome lanes should stay concentrated on relationship/opportunity follow-up, high-value opportunity discovery/qualification, and the executive brief/decision inbox until those flows are operational.

## Worker activation

Once the natural-language task adapter is proven, activate a controlled 3-worker pool:

1. CORE_INTELLIGENCE
2. DISCOVERY_INTELLIGENCE
3. INTELLIGENCE_UX / PRODUCTION_VALUE

Each worker uses an isolated branch/worktree. Shared semantic/schema surfaces remain serialized under CORE_INTELLIGENCE ownership. Do not run overlapping migrations concurrently.

## Review loop

Worker -> structured result/checkpoint -> architect review -> APPROVE / REQUEST_CHANGES / ESCALATE_TO_KEEGAN -> worker correction/continuation.

Maximum autonomous review iterations: 2 before escalation.

## Reliability requirements

- no silent indefinite RUNNING state;
- separate bounded timeouts for shell tasks vs agent tasks;
- child failure cannot kill the watcher;
- stale-running recovery and duplicate prevention;
- persistent watcher survives terminal close/reboot;
- watcher upgrades have a safe self-update/restart path that does not require Keegan as routine relay.
