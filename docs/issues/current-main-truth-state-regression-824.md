# Current-Main Truth-State Regression V2

Issue: #824
Generated: 2026-08-25T10:13:00.000Z
Result: PASS

## Scope

This QA pass independently validated current `origin/main` for Executive Home, specialist summaries, Decision Room, Action Workspace, truth-state preservation, mobile/light-mode behavior, worktree integrity, typecheck, build, and diff-check.

This is QA evidence only. No product semantics, production deployment, credentials, schemas, migrations, pricing, outreach, recommendation logic, or production handlers were changed.

## Surfaces Validated

Focused regression command:

`npm exec -- tsx --test test/executive-home/current-main-golden-path-qa.test.tsx test/executive-home/executive-command-center-704.test.tsx test/executive-home/specialist-command-center-cards.test.tsx test/decision-room/decision-room-v1.test.tsx test/action-workspace/action-workspace-v1.test.tsx test/intelligence-ux/responsive-executive-shell.test.tsx`

Result:

- PASS: 36/36 tests.
- Executive Home command center rendered the current recommendation path, specialist summaries, grounded drill-downs, and light shell.
- Specialist cards preserved financial, goals/capacity, and relationship summaries with evidence freshness states.
- Decision Room preserved evidence, assumptions, contradiction, compact option comparison, compact evidence summary, source drill-down, and recommendation revision history.
- Action Workspace rendered approval-ready context in light mode and kept demo controls non-mutating.
- Responsive Executive Shell preserved mobile and desktop layout semantics.

## Truth-State Acceptance

Evidence-backed findings:

- `UNKNOWN` remains visible in Executive Home, Decision Room, specialist cards, and Action Workspace.
- `STALE` maps to the explicit amber truth-state treatment and is not collapsed into `KNOWN`.
- `CONFLICTED` remains visible in Decision Room and command-center evidence.
- Fake-zero coercion checks passed: UNKNOWN economics and attribution were not rendered as `$0`, `0%`, `false`, or equivalent certainty.
- Source drill-down and evidence provenance remained inspectable for Decision Room and specialist freshness badges.

## Mobile And Light Mode

Evidence-backed findings:

- Executive shell and command center rendered light-mode classes such as `bg-[#f8f4ec]`, `bg-[#f7f2ea]`, `bg-white`, and `text-stone-950`.
- Regression checks rejected dark-shell classes such as `bg-zinc-950`, `bg-slate-950`, and dark text treatments.
- Mobile/responsive classes remained present for command-center, specialist, Decision Room, Action Workspace, and shell layouts.

## Local Gate Verification

Commands run from protected `local-f` worktree:

- PASS: `npm exec -- tsx --test test/executive-home/current-main-golden-path-qa.test.tsx test/executive-home/executive-command-center-704.test.tsx test/executive-home/specialist-command-center-cards.test.tsx test/decision-room/decision-room-v1.test.tsx test/action-workspace/action-workspace-v1.test.tsx test/intelligence-ux/responsive-executive-shell.test.tsx` (36/36)
- PASS: `npm exec -- tsc --noEmit`
- PASS: `npm run build`

Additional required issue-execution gates are recorded by the structured task result.

## Unexpected But Non-Blocking Output

- Initial focused tests and typecheck failed because dependencies were absent in `local-f`; `npm ci` completed and reruns passed.
- `npm ci` reported existing audit and install-script warnings.
- React test renderer emitted existing deprecation and `act(...)` environment warnings while tests passed.
- Build reported the existing edge-runtime static-generation warning.
- Required wrappers emitted harmless empty-command line warnings while commands returned success.

## Decision

`PASS`

Current-main truth-state, mobile, and light-mode regression acceptance is evidence-backed for the tested surfaces.

## Keegan Action

KEEGAN_ACTION_REQUIRED=NO

No approval gate, production action, credential change, schema change, migration, pricing change, outreach, or deployment action appeared in this QA pass.
