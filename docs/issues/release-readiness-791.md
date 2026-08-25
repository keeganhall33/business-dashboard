# Issue 791 current-main specialist release readiness

## Result

`BLOCKED_WITH_REASON`

Current `main` is buildable and the recently merged specialist/UX slices remain isolated and validated, but the next release train is not ready to merge because the live integration dry-run found zero eligible PRs. The queue is blocked by pending checks, merge conflicts, or missing validation evidence on open PRs rather than by current-main specialist regressions.

## Architecture grounding

Canonical grounding was read from `docs/ARCHITECTURE.md`. This readiness pass treated `main` as the integration target, preserved Vercel Git integration as the only production deployment path, and did not create a recommendation engine, scheduler, memory store, deployment path, source-of-truth boundary, schema, migration, credential change, or production action.

## Recent current-main merges inspected

| Merge | Scope | Isolation finding |
| --- | --- | --- |
| `#760` Add Phase C specialist command-center cards | `src/app/(app)/specialists/*`, `src/components/executive-home/ExecutiveCommandCenter.tsx`, `src/lib/executive-home/specialist-command-center.ts`, focused Executive Home tests | Specialist/Executive UX only. |
| `#777` Add Approval-ready Action Workspace V1 | action workspace route/component/fixture, Executive Command Center link, focused action-workspace test | Executive UX/action workspace only; no production handlers. |
| `#787` Record issue 784 orchestration recovery evidence | orchestration recovery documentation | Evidence/documentation only. |

The merged PRs inspected have no stale queue labels visible on GitHub at the time of this pass.

## Live integration dry-run

Command:

```text
npm exec -- node scripts/orchestration-v3/integration-queue.mjs --dry-run
```

Observed result:

- `event`: `INTEGRATION_QUEUE_RESULT`
- `dryRun`: `true`
- `merged`: `[]`
- `releaseTrain.releaseTrainState`: `RECONCILIATION_REQUIRED`
- `releaseTrain.mergeQueue`: `[]`
- `releaseTrain.metrics.currentPrCount`: `9`
- `releaseTrain.metrics.eligiblePrCount`: `0`

Current blockers surfaced by the dry-run:

| PR | State |
| --- | --- |
| `#798` | `CHECKS_PENDING` |
| `#705` | `NOT_MERGEABLE:CONFLICTING`, `MISSING_VALIDATION_EVIDENCE` |
| `#702` | `MISSING_VALIDATION_EVIDENCE` |
| `#695` | `NOT_MERGEABLE:CONFLICTING` |
| `#638` | `NOT_MERGEABLE:CONFLICTING`, `CHECKS_FAILED` |

The dry-run also excluded stale historical or unverified branches according to the existing release-train rules.

## Validation

Passed:

```text
npm exec -- node --test test/orchestration-v3-integration-queue.test.mjs test/orchestration-v3-release-train.test.mjs
npm exec -- tsx --test test/executive-home/executive-command-center-704.test.tsx test/executive-home/specialist-command-center-cards.test.tsx test/intelligence-ux/responsive-executive-shell.test.tsx test/action-workspace/action-workspace-v1.test.tsx
```

The specialist/UX run covered command-center rendering, specialist summary cards, Financial and Goals/Capacity read-only routes, Decision Room IA, Action Workspace read-only context, UNKNOWN preservation, and light-mode/mobile layout classes.

## Readiness decision

Current main is acceptable as the release base, but the next release train is `BLOCKED_WITH_REASON` until the queue has at least one dependency-safe PR with green checks, validation evidence, and no merge conflict. `KEEGAN_ACTION_REQUIRED=NO`.
