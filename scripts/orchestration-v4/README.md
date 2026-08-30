# Orchestration V4

V4 is a clean execution substrate built alongside V3. It does not reuse persistent worker worktrees.

## Core invariants

1. Tasks own disposable workspaces. Worker IDs are capacity/routing slots only.
2. Every execution begins from an explicit immutable base SHA.
3. Task state transitions are explicit and fail closed.
4. One task owns one process group and one workspace.
5. Read-only telemetry never extends semantic-progress deadlines.
6. Cleanup is task-scoped and idempotent.
7. GitHub labels mirror orchestration state but do not determine local process liveness.
8. Integration/release execution may use a specialized executor but still receives a disposable workspace.

## Phase 1

This branch establishes the state machine, immutable execution context, disposable Git workspace lifecycle, semantic progress classifier, slot-only scheduler semantics, and deterministic isolation tests.

V3 remains untouched and active until V4 passes staged acceptance. V4 must not replace the production watcher merely because unit tests pass.

## Activation gate

Before production activation, V4 must prove a live three-lane acceptance run in which CORE_INTELLIGENCE, DISCOVERY_INTELLIGENCE, and INTELLIGENCE_UX tasks:

- resolve the same explicit canonical main SHA;
- execute concurrently in distinct disposable workspaces;
- produce independently validated results;
- clean up their workspaces after completion/failure;
- release their capacity slots; and
- permit automatic backfill without carrying Git state between tasks.

QA and integration/release are added only after that proof is green.
