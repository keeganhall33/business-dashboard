# Orchestration watcher V1.2 required behavior

This document is a temporary bootstrap contract for Issue #207.

The permanent watcher change must:

1. Preserve current human-approval gating before any agent execution.
2. Preserve explicit `EXECUTE` blocks and strict shell allowlisting for deterministic shell tasks.
3. When an eligible task has no `EXECUTE` block, invoke the verified natural-language adapter instead of parking the task merely because the block is absent.
4. Use verified OpenClaw transport `openclaw agent --agent main`; do not guess targets.
5. Give agent turns a separate bounded timeout (target 15 minutes by default) rather than the 30-second shell-command timeout.
6. Convert agent timeout/failure into a structured BLOCKED result and return to polling.
7. Preserve idempotence so restart/retry cannot silently double-execute a task.
8. For ARCHITECT_REVIEW_REQUIRED work, stop at ArchitectCheckpoint before semantic/schema/security/valuation/recommendation mutation.
9. Never execute KEEGAN_APPROVAL_REQUIRED work automatically.
10. Post structured agent/checkpoint results back to the originating issue.
11. Keep Telegram out of routine orchestration.
12. Add deterministic tests covering no-EXECUTE natural-language handoff, separate timeout classes, human gate, architect checkpoint, failure isolation, and duplicate prevention.
13. After merge, provide a safe self-update/restart path for the persistent launchd watcher so future watcher releases do not require Keegan as a manual relay.
