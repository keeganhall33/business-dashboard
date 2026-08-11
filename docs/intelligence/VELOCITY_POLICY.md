# Intelligence Development Velocity Policy

Goal: maximize reliable progress per unit of time/cost while preserving semantic correctness, review quality, and human approval boundaries.

## Default operating policy

- Keep development moving without Keegan as routine relay.
- Architect/Reviewer owns prioritization, semantic review, integration decisions, and roadmap coherence.
- Jeeves owns local execution/orchestration on the Mac/OpenClaw/Supabase/Fly/1Password environment.
- Sub-agents/workers execute bounded, isolated implementation slices.
- AUTO_CONTINUE for deterministic, reversible work inside settled contracts.
- ARCHITECT_REVIEW_REQUIRED for semantics, schema, persistence, coverage, ranking, valuation, recommendation logic, auth/security, and ambiguous business interpretation.
- KEEGAN_APPROVAL_REQUIRED for credentials/account connection, outreach, purchases/contracts, destructive/material production writes, external publishing, and consequential business decisions.

## Throughput principles

1. Prefer small coherent slices with fast review over large unchecked tasks.
2. Parallelize independent streams; never parallelize overlapping shared semantic/schema changes.
3. Use isolated branch/worktree per worker/task.
4. Use strongest reasoning only for high-ambiguity/high-consequence work; cheaper capable models for deterministic implementation/tests.
5. Persist durable project context in repo docs/contracts and send workers REFERENCE + DELTA instead of replaying full history.
6. Every running task must have bounded execution, failure isolation, and visible terminal/review state.
7. One blocked stream must not halt unrelated work.
8. Limit autonomous review/correction loops to 2 before escalation.
9. Track model/token/API/infrastructure cost where available and optimize cost per correct milestone, not token minimum.
10. Keep roadmap features authoritative; velocity optimizations may change implementation sequence but not silently drop planned capabilities.

## Worker activation gate

Bring the 3-worker pool online once the natural-language OpenClaw agent transport is proven end-to-end and task isolation/review gates are operational.

Initial topology:
- Worker A: CORE_INTELLIGENCE
- Worker B: DISCOVERY_INTELLIGENCE
- Worker C: INTELLIGENCE_UX / PRODUCTION_VALUE
- Optional Worker D: FIRST_PARTY_MEMORY / EMAIL after secret/access controls are ready

## Review loop

Architect task → Jeeves/worker execution → structured result/PR → architect review → approve/request changes/escalate → next independent slice.

Normal chatter stays in GitHub. Keegan is surfaced only for genuine human gates or material milestone/blocker updates.
