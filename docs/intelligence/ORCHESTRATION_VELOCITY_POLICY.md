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
