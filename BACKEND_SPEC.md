# Operator Command System — Backend Blueprint

_All instructions sourced from Keegan’s canonical backend plan. Use this as the literal build checklist._

> Validation/typing specifics now live in `VALIDATION_SPEC.md`. This file focuses on architecture, agents, automation, and scheduling.

## Directory Layout (Next.js App Router + Supabase)

```
src/
  app/
    api/
      dashboard/
        overview/route.ts
      agent/[agentKey]/route.ts
      tasks/route.ts
      tasks/[id]/approve/route.ts
      tasks/[id]/reject/route.ts
      tasks/[id]/status/route.ts
      tasks/[id]/complete/route.ts
      opportunities/route.ts
      opportunities/[id]/route.ts
      opportunities/[id]/status/route.ts
      decisions/route.ts
      agents/run/[agentKey]/route.ts
      agents/run-all/route.ts
      agents/runs/route.ts
      automation/evaluate-rules/route.ts
      automation/weekly-cycle/route.ts
  lib/
    supabase/
      server.ts
      queries.ts
    agents/
      avery.ts
      lyra.ts
      sloan.ts
      noah.ts
      shared.ts
    api/
      responses.ts
    types/
      api.ts
```

## Supabase Server Client (`src/lib/supabase/server.ts`)

```ts
import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

## API Response Helpers (`src/lib/api/responses.ts`)

```ts
import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code: "bad_request", message, details } },
    { status: 400 }
  );
}

export function notFound(message: string) {
  return NextResponse.json(
    { ok: false, error: { code: "not_found", message } },
    { status: 404 }
  );
}

export function serverError(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code: "server_error", message, details } },
    { status: 500 }
  );
}
```

## Supabase Query Layer (`src/lib/supabase/queries.ts`)

Centralized helpers for everything: scoreboard metrics, tasks, opportunities, decisions, alert rules, agent profiles, runs. The provided spec includes full implementations for:
- `getLatestScoreboardMetrics`
- `getOpenTasks`
- `getTasks`
- `getTaskById`
- `createTask`
- `updateTaskApproval`
- `updateTaskStatus`
- `completeTask`
- `getAgentProfile`
- `getAgentUpdates`
- `createAgentUpdate`
- `getActiveOpportunities`
- `getOpportunities`
- `createOpportunity`
- `updateOpportunityStatus`
- `createDecision`
- `createSystemRun`
- `finishSystemRun`
- `getAgentHealth`
- `getMetricAlertRules`

### Approval gating for `updateTaskStatus`

```ts
export async function updateTaskStatus(id: string, status: string) {
  const supabase = getSupabaseServerClient();
  const existing = await getTaskById(id);

  const approvalBlocked =
    existing.requires_approval &&
    !existing.approved_by_user &&
    ["in_progress", "completed"].includes(status);

  if (approvalBlocked) {
    throw new Error("Task requires user approval before execution can proceed");
  }

  const { data, error } = await supabase
    .from("task_queue")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
```

## Key Route Handlers

### `/api/dashboard/overview`
Fetches metrics, tasks, opportunities, Avery directives, agent health, and assembles the full dashboard payload. Use the provided `buildStatusMetric` helper pattern and return the JSON shown in `API_SPEC.md`.

### `/api/dashboard/agent/[agentKey]`
Loads profile, owned metrics, recent updates, open/completed tasks, and opportunities for a single agent. Responds with the structure already documented.

### `/api/tasks`
- `GET`: supports `agentKey`, `priority`, `status` filters.
- `POST`: validates required fields and inserts via `createTask`.

### `/api/tasks/:id/(approve|reject|status|complete)`
Separate route files for each action, calling the corresponding query helper.

### `/api/opportunities`
- `GET`: optional `ownerAgent` and `status` filters.
- `POST`: inserts a new opportunity per schema.
- `/api/opportunities/[id]/status`: updates status with whitelist enforcement.

### `/api/decisions`
`POST` endpoint writing to `decision_log` with `expectedOutcome` + `outcomeReviewDate`.

### Agent orchestration
- `POST /api/agents/run/:agentKey`
- `POST /api/agents/run-all`
- `POST /api/automation/evaluate-rules`
- `POST /api/automation/weekly-cycle`

These will call into `src/lib/agents/{avery|lyra|sloan|noah}.ts`. Each agent file should encapsulate the weekly mandate logic: pull latest metrics, create updates, add tasks, etc. Avery always runs last to synthesize.

## Automation Rules

Use `metric_alert_rules` to drive the auto-task creation logic:
- AOV < 150 → Sloan pricing task.
- Conversion < 2% → Sloan + Lyra CRO task.
- Cart abandonment > 70 → Sloan checkout task.
- Engagement < 3% → Lyra repositioning.
- Social growth < 5% → Lyra visibility plan.
- Active brand conversations < 5 → Noah research sprint.

`POST /api/automation/evaluate-rules` evaluates each rule, creates tasks when thresholds fail, and returns the list of fired triggers.

## Agent Execution Layer

Never bury agent logic in route handlers. Use dedicated files plus a shared helper.

### `src/lib/agents/shared.ts`

```ts
import {
  createAgentUpdate,
  createOpportunity,
  createTask,
  getActiveOpportunities,
  getLatestScoreboardMetrics,
  getOpenTasks
} from "@/lib/supabase/queries";

export type AgentRunResult = {
  summary: string;
  updatesCreated: number;
  tasksCreated: number;
  opportunitiesCreated: number;
};

export async function getSharedAgentContext() {
  const metrics = await getLatestScoreboardMetrics();
  const tasks = await getOpenTasks(50);
  const opportunities = await getActiveOpportunities(25);
  return { metrics, tasks, opportunities };
}

export async function writeAgentOutputs(input: {
  agentKey: string;
  insights?: Array<{ title: string; summary: string; detailMd?: string; priority?: "critical" | "high" | "medium" | "low"; relatedMetricKeys?: string[] }>;
  actions?: Array<{ title: string; summary: string; detailMd?: string; priority?: "critical" | "high" | "medium" | "low"; relatedMetricKeys?: string[] }>;
  bigBet?: { title: string; summary: string; detailMd?: string; priority?: "critical" | "high" | "medium" | "low"; relatedMetricKeys?: string[] };
  tasks?: Array<{
    title: string;
    description?: string;
    priority: "critical" | "high" | "medium" | "low";
    expectedImpact?: string;
    impactScore?: number;
    whyThisMatters?: string;
    relatedMetricKeys?: string[];
    requiresApproval?: boolean;
    executionType: "analysis" | "content" | "outreach_prep" | "pricing" | "research" | "design" | "data" | "strategy";
  }>;
  opportunities?: Array<{
    name: string;
    organization?: string;
    opportunityType: "brand_partnership" | "licensing" | "press" | "collector_intro" | "athlete_collab" | "institutional";
    status: "identified" | "researching" | "ready_for_outreach" | "outreach_drafted" | "in_conversation" | "negotiating" | "won" | "lost" | "parked";
    valueEstimate?: number;
    prestigeScore?: number;
    probabilityScore?: number;
    nextStep?: string;
    nextStepDueAt?: string;
    notesMd?: string;
    source?: string;
  }>;
}) {
  let updatesCreated = 0;
  let tasksCreated = 0;
  let opportunitiesCreated = 0;

  for (const insight of input.insights ?? []) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "insight",
      title: insight.title,
      summary: insight.summary,
      detailMd: insight.detailMd,
      priority: insight.priority,
      relatedMetricKeys: insight.relatedMetricKeys
    });
    updatesCreated++;
  }

  for (const action of input.actions ?? []) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "action",
      title: action.title,
      summary: action.summary,
      detailMd: action.detailMd,
      priority: action.priority,
      relatedMetricKeys: action.relatedMetricKeys
    });
    updatesCreated++;
  }

  if (input.bigBet) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "big_bet",
      title: input.bigBet.title,
      summary: input.bigBet.summary,
      detailMd: input.bigBet.detailMd,
      priority: input.bigBet.priority,
      relatedMetricKeys: input.bigBet.relatedMetricKeys
    });
    updatesCreated++;
  }

  for (const task of input.tasks ?? []) {
    await createTask({
      title: task.title,
      description: task.description,
      agentKey: input.agentKey,
      priority: task.priority,
      expectedImpact: task.expectedImpact,
      impactScore: task.impactScore,
      whyThisMatters: task.whyThisMatters,
      relatedMetricKeys: task.relatedMetricKeys,
      requiresApproval: task.requiresApproval,
      executionType: task.executionType,
      createdBy: input.agentKey
    });
    tasksCreated++;
  }

  for (const opp of input.opportunities ?? []) {
    await createOpportunity({
      name: opp.name,
      organization: opp.organization,
      opportunityType: opp.opportunityType,
      status: opp.status,
      valueEstimate: opp.valueEstimate,
      prestigeScore: opp.prestigeScore,
      probabilityScore: opp.probabilityScore,
      ownerAgent: input.agentKey,
      nextStep: opp.nextStep,
      nextStepDueAt: opp.nextStepDueAt,
      notesMd: opp.notesMd,
      source: opp.source
    });
    opportunitiesCreated++;
  }

  return { updatesCreated, tasksCreated, opportunitiesCreated };
}
```

Each agent file (`avery.ts`, `lyra.ts`, `sloan.ts`, `noah.ts`) should:
1. Pull the shared context.
2. Generate 3 insights, 3 actions, and 1 big bet (per-agent mandates).
3. Create tasks/opportunities as needed via `writeAgentOutputs`.
4. Return an `AgentRunResult` summary used by the `/api/agents/run*` endpoints.

Example skeleton for Sloan:

```ts
// src/lib/agents/sloan.ts
import { AgentRunResult, getSharedAgentContext, writeAgentOutputs } from "./shared";

export async function runSloan(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContext();

  const aov = metrics.find((m) => m.metric_key === "aov");
  const conversion = metrics.find((m) => m.metric_key === "conversion_rate");
  const abandonment = metrics.find((m) => m.metric_key === "cart_abandonment_rate");

  const insights = [
    {
      title: "Low AOV is the primary revenue bottleneck",
      summary: `Current AOV is ${aov?.current_value}, well below target.`,
      detailMd: "Premium offer architecture is underdeveloped and suppressing revenue growth.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "monthly_revenue"]
    },
    {
      title: "Conversion remains below acceptable range",
      summary: `Current conversion rate is ${conversion?.current_value}%.`,
      detailMd: "Homepage and product page clarity likely need tightening.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Cart abandonment remains too high",
      summary: `Cart abandonment is ${abandonment?.current_value}%.`,
      detailMd: "The recovery system and checkout flow likely leave money on the table.",
      priority: "high" as const,
      relatedMetricKeys: ["cart_abandonment_rate"]
    }
  ];

  const actions = [
    {
      title: "Redesign pricing ladder",
      summary: "Introduce stronger premium signed tiers and better offer architecture.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov"]
    },
    {
      title: "Audit conversion friction",
      summary: "Review homepage, PDP, and checkout experience for clarity and trust signals.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Deploy cart recovery strategy",
      summary: "Create abandoned-cart recovery logic and post-cart recapture flow.",
      priority: "high" as const,
      relatedMetricKeys: ["cart_abandonment_rate"]
    }
  ];

  const bigBet = {
    title: "Premium collector monetization sprint",
    summary: "Rebuild the offer structure around scarcity, prestige, and premium collector tiers.",
    detailMd: "This is the fastest path to lift AOV materially without diluting the brand.",
    priority: "critical" as const,
    relatedMetricKeys: ["aov", "monthly_revenue", "repeat_purchase_rate"]
  };

  const tasks = [
    {
      title: "Design premium pricing architecture",
      description: "Create a 3-tier premium signed edition structure and revised product positioning.",
      priority: "critical" as const,
      expectedImpact: "Raise AOV materially within 30 to 60 days",
      impactScore: 9.5,
      whyThisMatters: "AOV is suppressing total revenue.",
      relatedMetricKeys: ["aov", "monthly_revenue"],
      requiresApproval: true,
      executionType: "pricing" as const
    },
    {
      title: "Audit checkout and recovery flow",
      description: "Identify friction points in checkout and design recovery improvements.",
      priority: "high" as const,
      expectedImpact: "Recover abandoned revenue and improve conversion",
      impactScore: 8.4,
      whyThisMatters: "High abandonment is leaving recoverable revenue behind.",
      relatedMetricKeys: ["cart_abandonment_rate", "conversion_rate"],
      requiresApproval: true,
      executionType: "analysis" as const
    }
  ];

  const output = await writeAgentOutputs({
    agentKey: "sloan",
    insights,
    actions,
    bigBet,
    tasks
  });

  return {
    summary: "Identified AOV, conversion, and abandonment as the top ecommerce blockers.",
    ...output
  };
}
```

Example skeleton for Lyra:

```ts
// src/lib/agents/lyra.ts
import { AgentRunResult, getSharedAgentContext, writeAgentOutputs } from "./shared";

export async function runLyra(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContext();
  const engagement = metrics.find((m) => m.metric_key === "engagement_rate");
  const cultural = metrics.find((m) => m.metric_key === "cultural_relevance_score");

  const insights = [
    {
      title: "Brand engagement is too soft",
      summary: `Engagement rate is ${engagement?.current_value}% versus target.`,
      detailMd: "The brand likely needs sharper authority-based storytelling and stronger emotional positioning.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate"]
    },
    {
      title: "Cultural relevance has room to rise",
      summary: `Current internal relevance score is ${cultural?.current_value}.`,
      detailMd: "The brand ceiling is high, but narrative pressure needs to increase.",
      priority: "high" as const,
      relatedMetricKeys: ["cultural_relevance_score"]
    },
    {
      title: "Message clarity is likely affecting conversion",
      summary: "Brand and ecommerce are linked at the homepage and product-story level.",
      detailMd: "Luxury clarity and authority cues likely need to be more explicit.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    }
  ];

  const actions = [
    {
      title: "Sharpen homepage narrative",
      summary: "Anchor messaging around authority, precision, and cultural significance.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    },
    {
      title: "Build collector-status narrative",
      summary: "Position ownership as identity, taste, and cultural participation.",
      priority: "high" as const,
      relatedMetricKeys: ["repeat_purchase_rate"]
    },
    {
      title: "Prioritize prestige-oriented campaign language",
      summary: "Use more selective, authority-rich framing across brand surfaces.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate", "cultural_relevance_score"]
    }
  ];

  const bigBet = {
    title: "Impossible in Pencil brand campaign",
    summary: "Develop a cohesive storytelling campaign that unifies homepage, product storytelling, and social narrative.",
    detailMd: "This campaign should make the work feel singular, elite, and culturally magnetic.",
    priority: "critical" as const,
    relatedMetricKeys: ["cultural_relevance_score", "engagement_rate", "conversion_rate"]
  };

  const tasks = [
    {
      title: "Rewrite homepage narrative hierarchy",
      description: "Strengthen hero, supporting copy, and authority language for immediate luxury positioning.",
      priority: "critical" as const,
      expectedImpact: "Increase desire and conversion quality",
      impactScore: 8.9,
      whyThisMatters: "The brand message must pull harder at first impression.",
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"],
      requiresApproval: true,
      executionType: "content" as const
    }
  ];

  const output = await writeAgentOutputs({
    agentKey: "lyra",
    insights,
    actions,
    bigBet,
    tasks
  });

  return {
    summary: "Sharpened brand narrative and conversion messaging priorities.",
    ...output
  };
}
```

Example skeleton for Noah:

```ts
// src/lib/agents/noah.ts
import { AgentRunResult, getSharedAgentContextForAgent, writeAgentOutputs } from "./shared";

export async function runNoah(): Promise<AgentRunResult> {
  const { metrics, opportunities } = await getSharedAgentContextForAgent("noah");
  const activeOpportunities = (opportunities ?? []).filter((opp) => !["won", "lost", "parked"].includes(opp.status));

  const insights = [
    {
      title: "Partnership pipeline is too thin",
      summary: `Only ${activeOpportunities.length} live opportunities are on deck; we need double that to stay healthy.`,
      detailMd: "The opportunity engine needs more top-of-funnel prestige targets.",
      priority: "critical" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Build next prestige target list",
      summary: "Identify 25 high-fit institutions, brands, and figures.",
      priority: "critical" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: "Prestige partnership sprint",
    summary: "Concentrate on a narrow set of high-upside targets with tailored pitch angles.",
    detailMd: "This should improve both deal quality and future brand leverage.",
    priority: "critical" as const,
    relatedMetricKeys: []
  };

  const output = await writeAgentOutputs({
    agentKey: "noah",
    insights,
    actions,
    bigBet,
    opportunities: activeOpportunities.slice(0, 5)
  });

  return {
    summary: "Expanded the research pipeline and created the next opportunity sprint.",
    ...output
  };
}
```

Example skeleton for Avery (runs last and issues directives):

```ts
// src/lib/agents/avery.ts
import { AgentRunResult, getSharedAgentContext, writeAgentOutputs } from "./shared";
import { createAgentUpdate, getAgentUpdates } from "@/lib/supabase/queries";

export async function runAvery(): Promise<AgentRunResult> {
  const { metrics, opportunities } = await getSharedAgentContext();
  const [sloanUpdates, lyraUpdates, noahUpdates] = await Promise.all([
    getAgentUpdates("sloan", 5),
    getAgentUpdates("lyra", 5),
    getAgentUpdates("noah", 5)
  ]);

  const aov = metrics.find((m) => m.metric_key === "aov");
  const conversion = metrics.find((m) => m.metric_key === "conversion_rate");
  const activeOpportunityCount = (opportunities ?? []).length;
  const directiveSummary = "Shift the system toward pricing power, conversion clarity, and rapid partnership pipeline expansion.";

  const insights = [
    {
      title: "Revenue gap is still primarily structural",
      summary: `AOV (${aov?.current_value}) and conversion (${conversion?.current_value}%) remain below target.`,
      detailMd: "The strongest path is not more noise. It is better offer structure and sharper brand presentation.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "Pipeline expansion must accelerate",
      summary: `Only ${activeOpportunityCount} high-priority opportunities are active right now.`,
      detailMd: "The system needs more high-status opportunities entering the funnel.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Cross-agent work must stay coordinated",
      summary: "Brand, ecommerce, and research outputs need to converge on the same 2 to 3 priorities.",
      detailMd: `Recent output counts: Sloan ${sloanUpdates.length}, Lyra ${lyraUpdates.length}, Noah ${noahUpdates.length}.`,
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Reprioritize all agents around AOV, conversion, and pipeline",
      summary: "Kill low-leverage drift and force concentration on the highest-value bottlenecks.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate"]
    },
    {
      title: "Sequence work into one clear operating week",
      summary: "Pricing first, messaging second, opportunity prep third.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Enforce approval discipline",
      summary: "Require approval for any external action or irreversible change.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: "Prestige revenue sprint",
    summary: "Coordinate product, brand, and partnership systems around one premium growth push.",
    detailMd: "The business should behave like a focused luxury operator, not a generalist content machine.",
    priority: "critical" as const,
    relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
  };

  const tasks = [
    {
      title: "Define weekly command priorities",
      description: "Publish the top 3 system priorities and suppress low-value work for the week.",
      priority: "high" as const,
      expectedImpact: "Better strategic alignment and faster execution",
      impactScore: 8.0,
      whyThisMatters: "Focus drift kills performance.",
      relatedMetricKeys: ["agent_task_completion_rate"],
      requiresApproval: false,
      executionType: "strategy" as const
    }
  ];

  const output = await writeAgentOutputs({
    agentKey: "avery",
    insights,
    actions,
    bigBet,
    tasks
  });

  await createAgentUpdate({
    agentKey: "avery",
    updateType: "directive",
    title: "Weekly Executive Directive",
    summary: directiveSummary,
    detailMd: "Top priorities: premium pricing, conversion clarity, and partnership pipeline expansion.",
    priority: "critical",
    relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
  });

  return {
    summary: directiveSummary,
    ...output
  };
}
```

Agent ordering is always Sloan → Lyra → Noah → Avery. Avery consumes outputs from the others and issues the directive update.

## Agent Run Routes

Implement:
- `POST /api/agents/run/:agentKey` → maps `{sloan, lyra, noah, avery}` to their runners, creates a `system_runs` record, executes the agent, and records outputs `{updatesCreated, tasksCreated, opportunitiesCreated}`. Return 404 for unknown agent keys. On failure, mark the run `failed` with `errors_md`.
- `POST /api/agents/run-all` → executes the fixed sequence Sloan → Lyra → Noah → Avery, creating a run record for each. If any agent fails, stop and surface the partial result.

## Automation Routes

> Detailed scheduler/autopilot requirements live in `SCHEDULER_SPEC.md`. This section summarizes the API surface.

- `POST /api/automation/evaluate-rules` → runs under Avery’s name as `rule_evaluation`. Pulls `metric_alert_rules`, compares against `vw_latest_scoreboard`, and for each trigger creates a task via `createTask(buildRuleTask(...))`. Returns `{rulesEvaluated, triggersFired[]}`.
- `POST /api/automation/weekly-cycle` → orchestrates the weekly cadence. Creates a `system_runs` record (agentKey `avery`, runType `weekly`), calls the rule evaluator, then runs Sloan → Lyra → Noah → Avery and returns their summaries.

### Shared rule evaluator (`src/lib/automation/evaluateRules.ts`)

```ts
import {
  createTask,
  getLatestScoreboardMetrics,
  getMetricAlertRules
} from "@/lib/supabase/queries";

function compare(operator: string, left: number, right: number) {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

export async function evaluateRules() {
  const [rules, metrics] = await Promise.all([
    getMetricAlertRules(),
    getLatestScoreboardMetrics()
  ]);

  const triggersFired = [] as Array<{
    metricKey: string;
    condition: string;
    assignedAgent: string;
    taskCreated: boolean;
    taskId: string;
  }>;

  for (const rule of rules) {
    const metric = metrics.find((m) => m.metric_key === rule.metric_key);
    if (!metric || metric.current_value == null) continue;

    const fired = compare(
      rule.condition_operator,
      Number(metric.current_value),
      Number(rule.threshold_value)
    );
    if (!fired) continue;

    const task = await createTask({
      title: `Respond to ${metric.metric_name} threshold breach`,
      description: `${rule.trigger_action}. Current value ${metric.current_value}, threshold ${rule.threshold_value}.`,
      agentKey: rule.assigned_agent,
      priority: rule.severity,
      expectedImpact: "Return metric toward target range",
      impactScore: rule.severity === "critical" ? 9 : 7,
      whyThisMatters: `${metric.metric_name} breached the configured threshold.`,
      relatedMetricKeys: [rule.metric_key],
      requiresApproval: true,
      executionType: "strategy",
      createdBy: "system"
    });

    triggersFired.push({
      metricKey: rule.metric_key,
      condition: `${rule.condition_operator} ${rule.threshold_value}`,
      assignedAgent: rule.assigned_agent,
      taskCreated: true,
      taskId: task.id
    });
  }

  return {
    rulesEvaluated: rules.length,
    triggersFired
  };
}
```

Call this helper directly from both the API route and the weekly cycle runner; do not invoke your own HTTP endpoint.

## Build Sequence (non‑negotiable)

1. Apply `schema.sql` (001–003) to Supabase.
2. Implement the read endpoints (`overview`, `agent`, `tasks`, `opportunities`).
3. Build the dashboard UI panels (per `FRONTEND_SPEC.md`).
4. Implement write endpoints (task approvals, status changes, decisions, opportunities).
5. Wire automation + agent run endpoints (Sloan → Lyra → Noah → Avery order).
6. Polish: real-time refresh, animations, war-room mode, filters by agent/priority/status.

## Operational Guardrails

- All external-facing tasks stay approval-gated.
- Avery’s directives must reference live data (use `agent_updates`).
- Agents persist updates/tasks/decisions so nothing is lost between runs.
- Return errors using `badRequest`, `notFound`, `serverError` helpers for consistency.
- No freelancing the structure—this file, `API_SPEC.md`, and `FRONTEND_SPEC.md` are the authoritative sources.

## Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENCLAW_API_KEY=...
OPENCLAW_WORKSPACE_PATH=/Users/keeganhall/.openclaw/workspace
```

## Implementation Hand-off

Instruction for OpenClaw (use verbatim):

> Implement the backend for the executive dashboard using Next.js App Router and Supabase.

This references everything in `API_SPEC.md`, `FRONTEND_SPEC.md`, and this backend file. Follow them exactly.
