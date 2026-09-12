# Agent Execution Control

This document defines the execution-control layer used by the canonical agent operating model. It does not create a new recommendation engine, scheduler, or agent hierarchy.

## Architectural rule

The system uses three complementary layers:

```text
GRAPH
  routes work through canonical decision and approval paths

HARNESS
  constrains each worker with a task contract, minimal context, tools, permissions, and budgets

LOOP
  verifies an attempt and chooses accept, bounded retry, reroute, or escalation
```

The canonical business decision flow in `docs/ARCHITECTURE.md` remains authoritative. External evidence still enters normalized knowledge and Fusion before it can become an operating recommendation. Avery and specialist ownership does not change.

## Task contracts

Every autonomous or semi-autonomous task that can affect a recommendation or business state should have a `TaskContractV1` before execution. A contract defines:

- objective
- allowed tools, sources, and scopes
- evidence requirements
- measurable success criteria
- inherited agent guardrails plus task-specific constraints
- actions requiring approval
- output requirements
- attempts, tool-call, runtime, and optional cost budgets
- stop conditions
- escalation conditions

Use `createAgentTaskContract()` so the task inherits the guardrails in `src/lib/agents/operating-model.ts` instead of duplicating them in prompts.

## Independent verification

Worker output is not proof of completion. `verifyTask()` evaluates structured evidence, success criteria, execution budgets, approval state, and failure history.

A successful worker attempt is accepted only when all required verification gates pass.

A verifier may return:

- `accept`: required gates passed
- `retry`: required gates failed but a bounded evidence-driven retry remains justified
- `reroute`: the current strategy is no longer productive and an alternate route exists
- `escalate`: human attention, exhausted budget, destructive action, or unresolved repeated failure prevents safe autonomous continuation
- `reject`: reserved for workflows that conclusively fail a policy or qualification gate

The worker should not be treated as the independent verifier when the workflow has a meaningful business, safety, financial, publishing, outreach, or irreversible consequence.

## Progress-aware retry policy

Retries are not automatic repetitions.

A retry is allowed only while the task remains within budget and there is a plausible path to new evidence or measurable progress. If the same failure signature repeats with no meaningful progress:

1. reroute when an alternate strategy exists;
2. otherwise escalate or stop;
3. never continue merely because unused retry capacity remains.

The default agent budget is three attempts, twenty tool calls, and ten minutes. Individual task contracts may tighten or deliberately expand these limits.

## Minimal context packets

Use `buildContextPacket()` to provide only domains relevant to the current objective. The system should prefer a small evidence-rich packet over broad access to unrelated CRM, telemetry, research, website, and project history.

The packet records included and excluded domains so context selection itself is inspectable.

Example: a university sponsorship task may need sports, sponsorship, relationship, prior-project, and timing context. It should not receive unrelated website-performance or manufacturing context.

## Decision provenance

Important decisions must record why the system accepted, rerouted, rejected, or escalated them. `DecisionProvenanceV1` records:

- decision and disposition
- confidence when applicable
- evidence references
- passed and failed gates
- missing evidence
- verifier reason
- next action
- timestamp

Confidence is supplemental. It is not a substitute for passed evidence gates.

## Inspectable durable state

`WorkflowStateV1` provides a common state shape for task execution and dashboard inspection. It includes:

- task and current node
- status and attempt count
- tool calls, runtime, and optional cost
- evidence and sources checked
- approvals
- blocked reason and next action
- confidence, business value, and urgency
- relationship path
- last meaningful progress
- last failure signature
- decision provenance
- whether human attention is required

Persistence remains the responsibility of the canonical workflow that owns the task. This module supplies the state contract, not a second database or scheduler.

## Integration guidance

### Fusion and executive decisions

Use explicit evidence and success gates before a candidate finding becomes an accepted recommendation. Preserve provenance with the decision package.

### Noah / external intelligence

Require source provenance, entity resolution, access-path evidence, timing evidence, deduplication, and missing-information state before labeling a named target a qualified opportunity.

### Sloan / revenue

Require current commerce evidence and measurable test criteria. Price or spend changes that are consequential should route through approval rather than self-certification.

### Lyra / brand

Require factual claims and cultural proof to be traceable to evidence. Unsupported prestige or reach claims fail verification.

### Avery / executive allocation

Use verified specialist evidence and provenance to resolve tradeoffs. Escalate consequential or irreversible choices to Keegan as already required by the operating model.

## Anti-patterns

Do not:

- add a new agent when a stronger contract or verifier solves the problem;
- give every worker every tool or every piece of context;
- let workers certify their own consequential outputs;
- retry the same failure without new evidence or measurable progress;
- let telemetry bypass Fusion and become strategy;
- create a parallel workflow-state database solely for these controls.
