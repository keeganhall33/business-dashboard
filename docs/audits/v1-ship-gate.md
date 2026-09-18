# Useful V1 ship gate

Updated against canonical `main` on 2026-09-18.

This gate distinguishes mechanical release readiness from live-data proof. A green build or rendered route is not allowed to substitute for evidence that a production source is actually operating.

| Capability | State | Evidence / remaining proof |
| --- | --- | --- |
| Integrated code | PASS | Current main has passed TypeScript, the focused/unit suite, production build, and diff hygiene in Validated Main. |
| Production propagation | PASS | The production smoke now requires `/api/health` `ok:true`, the exact expected Vercel commit SHA, a valid private-login boundary for `/dashboard`, a healthy `/login`, and the protected overview API posture. |
| Executive Home truth | PASS | Authoritative metric truth correction is merged; current release validation must continue to preserve UNKNOWN/partial/stale semantics rather than manufacture confirmation. |
| Primary workspace routes | PASS | `test/v1-acceptance/release-gate-v1.test.tsx` fails if a canonical V1 workspace, CRM directory/activity route, or release-smoke contract disappears. Existing detail-route integrity tests keep unimplemented controls fail-closed. |
| CRM directory reads | PASS | Canonical People and Companies reads were recovered through the `entities_v1` production path; empty/unavailable stores remain honestly empty. |
| IONOS three-mailbox historical proof | BLOCKED | #1740 still requires one bounded read-only proof on Keegan's authorized Mac/runtime with governed 1Password references. GitHub CI cannot truthfully substitute for that environment. Required result: 3/3 mailbox roles, `failedMailboxCount=0`, body policy NONE, no attachments, no mailbox/cursor/database/repository mutation, no SMTP, and privacy-safe aggregate evidence. |
| Continuous IONOS activation | BLOCKED | #1290 remains dependent on the live runtime proof/backfill path. Do not call email-driven CRM/opportunity intelligence production-live until this proof is complete. |
| Checkout diagnostics expansion | DEFERRED FROM THIS LANE | Revenue/behavior work is proceeding independently. It must not destabilize the V1 release gate or be represented as production data before its own checks pass. |
| Advanced autonomous/social intelligence | DEFERRED FROM V1 RELEASE | Valuable parallel work, but not a reason to hold Useful V1 once the remaining production proof is satisfied. |

## Mechanical release command

Run the focused acceptance gate from an exact current-main checkout:

```bash
node --import tsx --test test/v1-acceptance/release-gate-v1.test.tsx test/executive-workspace/route-integrity-v1.test.tsx
```

Then require the normal Validated Main workflow to pass. On a push to `main`, the configured production proof must also pass against the exact commit SHA.

## Final release rule

Useful V1 is not mechanically releasable while the live IONOS proof is BLOCKED. Do not weaken or replace that proof with fixtures, mocked mailbox output, local sample records, seed CRM data, or an unrelated green CI run.

No Keegan action is required unless the authorized Mac/1Password runtime presents an unavoidable interactive authorization prompt.
