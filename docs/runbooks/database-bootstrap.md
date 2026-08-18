# Database Bootstrap

## Canonical Path

Fresh environments should be created by replaying `supabase/migrations` in order.
`supabase/schema.sql` is a reviewed convenience snapshot only; it must mirror the
current migration state and must not become an independent source of runtime
truth.

## Active Architecture Boundary

Fresh bootstrap must reflect the current Career OS + Fusion + Avery operating
model:

- Agent profiles use the Avery/Sloan/Lyra/Noah roles from the canonical operating
  model.
- Metric threshold rows may exist only as inactive audit/history rows.
- Evidence collectors, KPI pulses, and scheduler checks may record facts and
  freshness state, but they must not directly manufacture strategic actions.
- The legacy `agent-idea-pulse` job key is retained for scheduler compatibility;
  it records KPI state and must not create quota-driven ideas.

## Idea Board Status

`agent_ideas` remains a distinct, human-managed product surface for reviewed
ideas and comments. It is not a daily autonomy quota. New agent-generated ideas
must be triggered by material evidence changes, Career OS state, Fusion decisions,
measured outcomes, external patterns, or explicit user direction.

The retired `agent_daily_idea_quota` view and quota enforcement code must not be
reintroduced into fresh bootstrap or scheduled runtime paths.
