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

## Rolling feature launches

V1, V1.1, V1.5, and later versions are certification milestones, not deployment batches. A feature must not wait for every feature in its target version when it is independently safe and useful.

- Every vertical slice names a user-facing feature, release target, launch policy, and observable rollback condition.
- `IMMEDIATE_AFTER_VERIFICATION` is the default. Once the latest production-verification task completes, the feature is `AVAILABLE` even when its broader release is not yet certified.
- `BUNDLED_ONLY` is an exception for an explicit atomic dependency such as an inseparable schema cutover. It requires a written bundle reason and remains `VERIFIED_HELD` after verification.
- Pull requests continue to receive Vercel previews. Merged `main` remains the sole production deployment path; do not create a second deployment pipeline or introduce deployment credentials into V4.
- Version certification is ready only when every registered feature for that version is available. Certification does not retroactively delay an already available feature.
- Failed production verification prevents launch. A later successful, independently reviewed verification attempt supersedes an older failed attempt without deleting its history.
- Delivery Health reports feature launch state, release progress, seven-day throughput, and median production cycle time so speed claims are based on delivered outcomes rather than PR count.

Launch states are `PLANNED`, `BUILDING`, `AWAITING_PRODUCTION_VERIFICATION`, `VERIFYING`, `AVAILABLE`, `VERIFIED_HELD`, and `BLOCKED`.

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
