# Full System Audit — 2026-08-18

## Objective

Audit the previously built business-dashboard as a complete system, not feature-by-feature, and reconcile it with the current Career OS + intelligence architecture.

The audit classifies artifacts as:

- **canonical** — actively governs the current architecture
- **retain** — still useful, but subordinate to canonical architecture
- **retire** — obsolete/conflicting and safe to remove from the working tree
- **historical** — not active, but must remain for audit/reproducibility (especially migrations)
- **follow-up** — still active but requires a deliberate refactor rather than deletion inside the cleanup PR

## Primary findings

### 1. Deployment had two competing production architectures

The repository still contained Fly-first deployment even after Vercel migration work:
- `fly.toml`
- `Dockerfile`
- `.dockerignore`
- `scripts/deploy.sh`
- Fly-first `validated-main-deploy.yml`
- Fly-oriented README instructions

**Disposition:** retire. Vercel Git integration is the sole production application runtime.

### 2. Scheduling had duplicate control planes

The old Autopilot workflow directly scheduled individual app jobs and defaulted to a Fly host while the application also had a central `scheduled_jobs` + `/api/scheduler/tick` control plane.

**Disposition:** consolidate. GitHub wakes `/api/scheduler/tick`; Supabase `scheduled_jobs` owns internal timing. Evidence collection remains in GitHub Actions only when the job itself must execute there.

### 3. Evidence collection had a parallel executive brain

`run-executive-refresh.mjs` generated recommended actions independently of Career OS, Fusion, and Avery.

**Disposition:** retire. Evidence collectors collect/persist evidence. Operating recommendations use the canonical decision flow.

### 4. Legacy metric rules could prescribe strategy before Avery reasoned

The original metric threshold automation could directly create tasks such as pricing/CRO/pipeline responses.

**Disposition:** disable, preserve history. Production migration disables active rules; table/rows remain auditable.

### 5. Agent and product architecture had multiple apparent sources of truth

Old root API/backend/frontend/scheduler/validation specs remained beside newer intelligence architecture and could be mistaken as current.

**Disposition:** remove from working tree; Git history is the archive. `docs/ARCHITECTURE.md` is the current entry point.

### 6. Environment configuration used misleading committed `.env.*.ci` names

Current values were 1Password references, not plaintext secrets, but root naming and `.gitignore` exceptions made future mistakes easier.

**Disposition:** move to `config/env/*.op.env`, enforce reference-only policy, ignore all local/resolved `.env*` files.

### 7. One-off proof artifacts accumulated as permanent repository configuration

Milestone-specific Playwright configs, `test-results/.last-run.json`, and `tmp/prA-body.md` remained committed.

**Disposition:** retire; ignore transient result/scratch directories.

## Retained intentionally

### Historical Supabase migrations

Do **not** delete migrations just because the feature they introduced was superseded. They are database history and may be required for reproducibility.

### Controlled external-intelligence operator workflows

The controlled heartbeat and recurring orchestration manager remain valid because they are guarded, auditable production control surfaces for the current external-intelligence subsystem.

### Orchestration V3 coding-agent controls

`AGENTS.md` and Orchestration V3 CI/workflows remain distinct from the four business agents. They govern code-development workers, not product strategy.

### Standard local/E2E test infrastructure

Generic Playwright/test configuration remains. Only milestone-specific one-off configs were retired.

## Follow-up work

Tracked in GitHub Issue #606:

1. Refactor dashboard overview so missing evidence never produces a canned strategic recommendation.
2. Remove Fly-specific staging fixture logic and replace it with explicit Vercel/test environment semantics.
3. Make agent UI consume the canonical operating model instead of duplicating role metadata.
4. Make fresh database bootstrap produce the same active architecture as current production.
5. Remove dead daily idea-quota machinery and decide whether the legacy idea-board product surface still has a distinct purpose.
6. Complete versioned external-knowledge → production Fusion integration.

## Canonical architecture after this cleanup

```text
External + internal evidence
        ↓
normalized knowledge / internal facts
        ↓
findings, hypotheses, risks, opportunities
        ↓
Fusion
        ↓
Avery
        ↓
Sloan / Lyra / Noah
        ↓
prioritized approved execution
        ↓
measured outcome
        ↓
outcome memory + learning
```

## Regression policy

Repository tests now guard against reintroducing:
- Fly/container production deployment
- duplicated direct GitHub application schedules
- parallel executive recommendation engines
- unsafe committed resolved environment values
- superseded root architecture specs

The long-term cleanup rule is simple: before adding a new scheduler, recommendation engine, memory system, agent definition, deployment runtime, or source-of-truth document, identify the canonical owner first and extend it rather than creating a parallel system.
