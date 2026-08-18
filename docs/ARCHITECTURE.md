# Business Dashboard Architecture

This document is the entry point for the current system. When older documentation conflicts with this file or the canonical intelligence documents below, the newer canonical source wins.

## Product objective

The dashboard is a decision and intelligence system, not a collection of independent reports. Its primary job is to answer:

> What should Keegan do next?

The system should reduce a large amount of business, career, relationship, market, and cultural information into a small number of evidence-backed priorities.

## Canonical decision flow

```text
Business + external evidence
        ↓
Normalized facts / knowledge
        ↓
Findings, hypotheses, risks, opportunities
        ↓
Fusion
        ↓
Avery executive allocation
        ↓
Sloan / Lyra / Noah specialist reasoning
        ↓
Prioritized moves and approval gates
        ↓
Execution
        ↓
Measured outcomes
        ↓
Outcome memory / learning
        ↺
```

External research does not bypass Fusion to become an operating recommendation. Telemetry collectors collect evidence; they do not create parallel executive strategy.

## Canonical sources of truth

### Decision governance
- `docs/intelligence/AI_DECISION_CONSTITUTION.md`
- `config/strategic_constraints_v1.json`

### Career operating system
- `src/lib/career/career-operating-system.ts`
- `docs/intelligence/ROADMAP.md`

### Agent model
- `src/lib/agents/operating-model.ts`
- `docs/intelligence/AGENT_OPERATING_MODEL.md`

### Internal and external intelligence
- `docs/intelligence/EXTERNAL_KNOWLEDGE_MODEL.md`
- `docs/intelligence/EXTERNAL_INTELLIGENCE_ARCHITECTURE.md`
- `docs/intelligence/KNOWLEDGE_SYNTHESIS_ENGINE_V1_ARCHITECTURE.md`
- `src/lib/intelligence-v1/**`
- `src/lib/external-intelligence/**`

### Decision fusion
- `src/lib/fusion-v1/**`
- `src/lib/scheduler/fusionDailyDecisionV1.ts`

### Scheduler
- `src/app/api/scheduler/tick/route.ts`
- `src/lib/scheduler/**`
- `scheduled_jobs` in Supabase
- `.github/workflows/autopilot.yml` only wakes the central application scheduler

### Evidence refresh
- `.github/workflows/dashboard-scheduler.yml`
- `scripts/run-website-conversion.mjs`
- `scripts/run-woo-telemetry.mjs`
- `scripts/run-meta-reporting.mjs`
- `scripts/run-cloudflare-telemetry.mjs`
- `scripts/run-lead-intelligence.mjs`
- `scripts/run-social-intelligence.mjs`
- `scripts/run-industry-pulse.mjs`

Evidence refresh jobs may normalize/persist observations. They must not invent executive recommendations outside the canonical decision flow.

### Deployment
- Vercel Git integration is the only production application deployment path.
- `.github/workflows/validated-main-deploy.yml` validates `main`; it does not deploy to a second runtime.
- Fly/container deployment is retired.

## Data and memory responsibilities

- Raw telemetry is evidence, not strategy.
- `research_memory` is supplemental research context and should not outrank versioned evidence/Fusion.
- `outcome_memory` records real-world results and is part of the learning loop.
- Historical migrations are retained even when the feature they introduced is later retired.
- Seed/E2E/staging fixture data must be explicitly labeled and must never silently masquerade as production evidence.

## Documentation policy

Root-level implementation specs from the early dashboard build are historical snapshots, not normative architecture. They should be removed from the working tree once superseded; Git history remains the archive.

New architectural decisions belong under `docs/`, preferably `docs/intelligence/` for intelligence-system contracts. Avoid creating another top-level `*_SPEC.md` unless it is explicitly designated canonical here.

## Change rule

Before adding a new recommendation engine, scheduler, memory store, deployment path, agent role, or source-of-truth document, first determine whether an existing canonical component owns that responsibility. Extend the existing component unless there is a documented reason to create a new boundary.
