# Milestone 11 — Action System Audit (reuse vs extend)

This audit maps the existing “action substrate” in the Supabase schema and Next.js routes, and identifies what can be reused vs what must be extended for the governed lifecycle:

Evidence → Explanation → Opportunity → Recommendation → Prepared Draft → Approval → Execution Plan → Measurement → Learning

## Existing production-backed substrate (Supabase schema)

Source: `supabase/schema.sql`

### task_queue (production-backed)
- Table: `task_queue`
- Purpose: agent-generated operational tasks (approval yes/no, statuses like pending/in_review/approved/rejected/in_progress/blocked/completed).
- Strengths:
  - already has approval fields + timestamps + deliverable links
  - already indexed by status/priority
- Gaps for Milestone 11:
  - not keyed to recommendation/opportunity identity
  - no evidence snapshot immutability
  - no approval preview requirements per channel
  - no action level (L0–L5) / strict transition matrix
  - no deduplication fingerprint semantics
  - no measurement plan contract
  - no learning/outcome record model

Conclusion: **do not overload `task_queue`** for governed BI actions. Keep it for agent tasking; add a dedicated action lifecycle surface.

### opportunity_pipeline (production-backed)
- Table: `opportunity_pipeline`
- Purpose: partnerships/licensing/press/institutional opportunities.
- Gaps:
  - not tied to BI evidence windows
  - not the same as “opportunities” detected from telemetry

Conclusion: keep for partnership pipeline; **do not reuse** for BI opportunity detection.

### decision_log (production-backed)
- Table: `decision_log`
- Purpose: human decisions (strategic/pricing/partnership/operational).
- Useful for later: attach action approvals/outcomes to decision log entries.
- Not sufficient as an approval system by itself.

### agent_threads / agent_messages / agent_plans / system_runs
- Useful for narrative and war-room context.
- Not a governed action lifecycle store.

## Existing Next.js routes and UI

### Approvals / task mutation routes
- Existing task approval endpoints exist under `/api/tasks/...` (status transitions for tasks).
- These are oriented around `task_queue` semantics, not the L0–L5 action lifecycle.

### Opportunity + recommendation centers
- Milestone 10 introduced read-only:
  - `/api/intelligence/opportunities`
  - `/api/intelligence/recommendations`
  - UI panels in Recommend view

These are the correct upstream inputs to an action system.

## What can be reused

- Authentication enforcement: `enforceDashboardAuth` (dev bypass only; production locked)
- Existing L0–L5 architecture (Milestone 6 artifacts): approval levels, side-effect boundaries
- Existing telemetry sources + evidence models (Milestones 3–9)
- Existing UI shell and navigation

## What must be extended / added

A dedicated action lifecycle subsystem that:
- persists L0–L3 actions safely (staging/local only in this milestone)
- models approval requirements, measurement plans, and immutable evidence snapshots
- enforces status transitions + audit events
- deduplicates recommendations into actions (fingerprint)
- supports rejection reasons and preference learning
- supports revalidation when evidence changes
- supports synthetic outcomes without external execution

## Production safety note

Milestone 11 will not write to production business systems.

Persistence work should be:
- implemented with additive schema + constraints
- verified against local/staging Supabase only
- guarded by a server-side “writes enabled” gate
