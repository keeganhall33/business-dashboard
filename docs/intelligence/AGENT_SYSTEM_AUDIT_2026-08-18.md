# Agent System Deep Audit — 2026-08-18

## Scope

Audited the business-dashboard agent system beyond the four runner files, including:
- agent runtime logic
- agent identity/mandate persistence
- manual and scheduled orchestration
- Career OS integration
- outcome/research memory
- Fusion handoff
- agent dashboard API
- idea/KPI autonomy loop
- opportunity pulse
- CEO digest
- deliverable/result feedback loop
- legacy specifications and parallel intelligence architecture

## Major findings corrected in this change set

### 1. No single source of truth for agent roles

Agent identity was scattered across database seed rows, API responses, UI labels, scheduler assumptions, and runner behavior.

Correction: `src/lib/agents/operating-model.ts` is now the canonical runtime definition for role, mandate, scope, Career OS lanes, required inputs, weekly outputs, responsibilities, and guardrails.

### 2. Persisted production agent profiles could never evolve

The original seed used `ON CONFLICT DO NOTHING`, so existing agent rows retained old mandates indefinitely.

Correction: migration `20260818080000_align_agent_operating_model.sql` explicitly updates existing rows.

### 3. Avery was still a revenue-first boss rather than a binding-constraint executive

Avery continued to default to a “premium revenue sprint” and AOV/conversion/pipeline even after Career OS integration.

Correction: Avery now treats the current Career OS bottleneck as the executive strategic constraint and uses revenue, Fusion, specialist evidence, opportunity state, and measured outcomes as inputs that may change the tactical order.

### 4. Specialists were not consuming canonical external strategy

The specialist context used legacy `research_memory`, while the intelligence constitution requires evidence-gated external context.

Correction: agents now read the latest persisted Fusion decision package. Legacy research memory remains supplemental context and may not independently become an external operating recommendation.

### 5. Agent orchestration order was inconsistent

Scheduled cycles had been corrected to Avery-first, but the manual run-all API still used the original Sloan -> Lyra -> Noah -> Avery ordering.

Correction: every multi-agent path uses the canonical `Avery -> Sloan -> Lyra -> Noah` sequence from the operating model.

### 6. Morning decisions ran before morning intelligence

The daily agent cycle ran at 06:05 PT while scoreboard, internal intelligence, and Fusion ran after 07:00.

Correction: migration `20260818080500_align_intelligence_decision_cadence.sql` makes the intended morning order:
1. 07:05 scoreboard refresh
2. 07:10 internal traffic-quality intelligence
3. 07:25 Fusion
4. 07:35 daily agent cycle
5. Monday 08:00 Avery weekly executive second pass
6. 08:15 CEO digest

### 7. Weekly cycle duplicated all specialist work

The Monday weekly command reran all four agents shortly after the normal daily cycle.

Correction: weekly command is now an Avery-only second pass that synthesizes the specialists' fresh Monday work.

### 8. Daily autonomy manufactured canned ideas

The system created one idea per agent per day to satisfy an activity quota, even when no new evidence existed.

Correction: the legacy scheduler name remains for compatibility, but the job now captures KPI state only. Ideas/recommendations are evidence-triggered.

### 9. Agent dashboard API contained Sloan-centric assumptions

All agents displayed the same weekly requirement (“3 revenue insights, 3 actions, 1 pricing recommendation”), and “open tasks” only included pending tasks.

Correction: weekly requirements now come from each agent's operating model and open task state includes pending, in-review, approved, in-progress, and blocked work.

### 10. Midweek opportunity pulse ignored intentional waiting and fake-escalated

An opportunity could be called stalled after 10 days even when its planned next-step date was in the future. The code also returned `escalatedToAvery=true` without creating an Avery signal.

Correction: stall logic respects next-step due dates and executive escalation now creates a real Avery insight.

### 11. Completed task results were not entering agent learning memory

Deliverables were harvested for display but result summaries did not become `outcome_memory`, so later agent cycles could miss what actually happened.

Correction: completed tasks with a result summary are promoted into outcome memory exactly once per task.

### 12. Noah's remit was too narrow for the long-term intelligence system

The old role was primarily partnership pipeline filling.

Correction: Noah now owns the external-intelligence operating surface including Opportunity Radar, Cultural Power Map/access paths, event/planning intelligence, competitive/success-pattern monitoring, emerging models, licensing reconnaissance, and qualified opportunity timing.

## Important remaining architecture gaps

### A. Full external-intelligence -> Fusion integration is not complete

The current production Fusion candidate loader consumes a limited set of sources (dashboard snapshots, opportunity pipeline, and an intelligence-v1 traffic-quality chain). The newer external-intelligence roadmap includes company intelligence, event intelligence, relationship/planning-cycle intelligence, competitive patterns, and other durable knowledge that are not yet all represented in the production Fusion candidate set.

Required future work:
- define the canonical adapter from synthesized/versioned external knowledge into Fusion candidates/context
- preserve provenance, confidence, contradictions, freshness, and policy references
- ensure raw articles/signals never bypass the evidence gates
- expose the resulting canonical context to Avery/Noah and the dashboard

### B. Legacy specs still contain historical agent language

`BACKEND_SPEC.md`, `API_SPEC.md`, scheduler/reference documents, and some older UI configuration still contain original titles, requirements, or orchestration descriptions.

The canonical runtime operating model and `docs/intelligence/AGENT_OPERATING_MODEL.md` supersede conflicting agent-role/orchestration language. These older specs should be cleaned during their next focused documentation pass rather than treated as runtime truth.

### C. Separate Jeeves/OpenClaw agent MD files were not found in this GitHub repository

No standalone Avery/Sloan/Lyra/Noah prompt/directive MD files were found in the connected `business-dashboard` repository. If those files exist in the local Jeeves/OpenClaw workspace, they are outside this repository and should be reconciled against the canonical operating model so ChatGPT, Dashboard, and Jeeves do not carry different definitions of the same agent.

### D. Parallel prototype recommendation surfaces remain

Some older/prototype strategy components (for example fixture-driven executive action queue code) exist alongside the newer Career OS/Fusion/agent path. They should not become competing production sources of “what Keegan should do next.”

## Long-term agent utilization model

The intended system is:

`Ingestion -> Evidence/Knowledge -> Fusion -> Avery -> Specialists -> Prioritized Action -> Keegan/Execution -> Outcome -> Learning -> Next Cycle`

Avery is the allocator and conflict resolver.
Sloan is the revenue/commerce specialist.
Lyra is the brand/audience/cultural specialist.
Noah is the external-intelligence/relationship/opportunity specialist.

The agents should become stronger as shared intelligence improves, not more isolated. Their value is applying domain expertise to the same canonical evidence and strategic state, then closing the loop on results.
