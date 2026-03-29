# Operator Command System — Frontend Implementation Notes

_All instructions below derive from Keegan's canonical dashboard blueprint. Follow them exactly._

## Executive Command Panel

```tsx
<div className="mt-4">
  <div className="text-sm text-zinc-400">Weekly Directive</div>
  <div className="mt-2 text-lg font-medium leading-relaxed">
    {data.weeklyDirective}
  </div>
</div>

<div className="mt-6 space-y-6">
  <div>
    <div className="text-sm text-zinc-400">Top Priorities</div>
    <ul className="mt-2 space-y-2 text-sm text-zinc-100">
      {data.topPriorities.map((item) => (
        <li key={item}>• {item}</li>
      ))}
    </ul>
  </div>

  <div>
    <div className="text-sm text-zinc-400">Biggest Bottlenecks</div>
    <ul className="mt-2 space-y-2 text-sm text-zinc-100">
      {data.biggestBottlenecks.map((item) => (
        <li key={item}>• {item}</li>
      ))}
    </ul>
  </div>

  <div>
    <div className="text-sm text-zinc-400">CEO Recommendation</div>
    <p className="mt-2 text-sm leading-relaxed text-zinc-100">
      {data.ceoRecommendation}
    </p>
  </div>
</div>
```

## Revenue Engine Panel (`src/components/dashboard/RevenueEnginePanel.tsx`)

```tsx
import { RevenueEngine } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";

type Props = {
  data: RevenueEngine;
};

export function RevenueEnginePanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Revenue Engine
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.metricKey} metric={metric} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Money Leaks</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-100">
            {data.moneyLeaks.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Fastest Path to Growth</div>
          <div className="mt-3 space-y-3">
            {data.fastestPathToIncreaseRevenue.map((item) => (
              <div key={item.move} className="rounded-xl bg-zinc-900 p-3">
                <div className="text-sm font-medium">{item.move}</div>
                <div className="mt-1 text-sm text-zinc-400">{item.estimatedImpact}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

## Brand Power Panel (`src/components/dashboard/BrandPowerPanel.tsx`)

```tsx
import { BrandPower } from "@/lib/types/dashboard";
import { MetricCard } from "./MetricCard";

type Props = {
  data: BrandPower;
};

export function BrandPowerPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Brand Power
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.metricKey} metric={metric} compact />
        ))}
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <div className="text-sm text-zinc-400">What’s Working</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.whatIsWorking.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm text-zinc-400">What to Do Next</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.whatToDoNext.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

## Opportunity Radar Panel (`src/components/dashboard/OpportunityRadarPanel.tsx`)

```tsx
import { OpportunityRadar } from "@/lib/types/dashboard";

type Props = {
  data: OpportunityRadar;
};

export function OpportunityRadarPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Opportunity Radar
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-2 text-3xl font-semibold">{data.activeCount}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Ready for Outreach</div>
          <div className="mt-2 text-3xl font-semibold">{data.readyForOutreachCount}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Top Opportunities</div>
        <div className="mt-3 space-y-3">
          {data.topOpportunities.map((item) => (
            <div key={item.id} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="mt-1 text-sm text-zinc-400">{item.organization ?? "Independent"}</div>
              <div className="mt-2 text-xs text-zinc-500">
                {item.status} • Prestige {item.prestigeScore ?? "—"} • Value ${item.valueEstimate ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Next Five Moves</div>
        <ul className="mt-2 space-y-2 text-sm text-zinc-100">
          {data.nextFiveMoves.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

## Task Board + Task Card

```tsx
// TaskBoard.tsx
import { TaskSummary } from "@/lib/types/dashboard";
import { TaskCard } from "./TaskCard";

type Props = { tasks: TaskSummary[] };

export function TaskBoard({ tasks }: Props) {
  const columns = {
    critical: tasks.filter((t) => t.priority === "critical" && t.status !== "completed"),
    high: tasks.filter((t) => t.priority === "high" && t.status !== "completed"),
    medium: tasks.filter((t) => t.priority === "medium" && t.status !== "completed"),
    completed: tasks.filter((t) => t.status === "completed")
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task Queue</div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
        {Object.entries(columns).map(([column, items]) => (
          <div key={column} className="rounded-2xl bg-zinc-900/60 p-4">
            <div className="text-sm font-medium capitalize">{column}</div>
            <div className="mt-4 space-y-3">
              {items.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// TaskCard.tsx
"use client";

import { TaskSummary } from "@/lib/types/dashboard";

type Props = { task: TaskSummary };

export function TaskCard({ task }: Props) {
  async function approveTask() {
    await fetch(`/api/tasks/${task.id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "user" })
    });
  }

  async function rejectTask() {
    await fetch(`/api/tasks/${task.id}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectedBy: "user", reason: "Rejected from dashboard" })
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-800 p-4">
      <div className="text-sm font-medium">{task.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
        {task.agentKey} • {task.priority} • {task.status}
      </div>

      {task.expectedImpact && (
        <div className="mt-3 text-sm text-zinc-300">{task.expectedImpact}</div>
      )}

      {task.requiresApproval && task.status !== "approved" && task.status !== "completed" && (
        <div className="mt-4 flex gap-2">
          <button onClick={approveTask} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
            Approve
          </button>
          <button onClick={rejectTask} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
```

## System Health Panel

```tsx
import { SystemHealth } from "@/lib/types/dashboard";

type Props = {
  data: SystemHealth;
};

export function SystemHealthPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">System Health</div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Data Freshness</div>
          <div className="mt-2 text-3xl font-semibold">{data.dataFreshnessHours}h</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Task Completion Rate</div>
          <div className="mt-2 text-3xl font-semibold">{data.agentTaskCompletionRate}%</div>
        </div>

        <div className="space-y-3">
          {data.agents.map((agent) => (
            <div key={agent.agentKey} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm font-medium">{agent.agentKey}</div>
              <div className="mt-1 text-sm text-zinc-400">
                Open {agent.openTaskCount} • Completed {agent.completedTaskCount}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                {agent.health}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

## API Client Helper

```ts
// src/lib/api/dashboard.ts
import { DashboardOverviewResponse } from "@/lib/types/dashboard";

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/overview`, {
    method: "GET",
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error("Failed to load dashboard overview");
  }

  return res.json();
}
```

## Formatting Utilities

```ts
// src/lib/utils/format.ts
export function formatMetricValue(value: number, unit: string): string {
  switch (unit) {
    case "usd":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    case "percent":
      return `${value}%`;
    case "hours":
      return `${value}h`;
    default:
      return `${value}`;
  }
}
```

```ts
// src/lib/utils/status.ts
export function statusClasses(status: "on_track" | "warning" | "critical"): string {
  if (status === "on_track") return "border-emerald-700 bg-emerald-950/20";
  if (status === "warning") return "border-amber-700 bg-amber-950/20";
  return "border-red-700 bg-red-950/20";
}
```

## Build Order (Do Not Deviate)

1. Build database schema (`schema.sql`).
2. Implement read endpoints: `/api/dashboard/overview`, `/api/dashboard/agent/:agentKey`, `/api/tasks`, `/api/opportunities`.
3. Ship core UI panels listed above.
4. Implement write endpoints: task approvals, task CRUD, opportunity + decision creation.
5. Implement automation: evaluate rules, run agent, run-all sequence (Sloan → Lyra → Noah → Avery).
6. Polish: live refresh, animations, War Room mode, filters.

## Operator Instruction Block (hand to OpenClaw as-is)

> Build an executive dashboard for the Keegan Hall business system using the provided SQL schema, API contracts, and React component structure.
>
> Requirements:
> 1. Use the SQL schema exactly as provided.
> 2. Build the API routes exactly as specified.
> 3. Build the dashboard UI exactly around these panels: Header Status Bar, Executive Command, Revenue Engine, Brand Power, Opportunity Radar, Task Queue, System Health.
> 4. Use a premium dark luxury style (black/charcoal, white type, muted gold accents, large typography, minimal borders, zero clutter).
> 5. Tasks requiring external action must remain approval-gated.
> 6. Agents must run in this order: Sloan → Lyra → Noah → Avery.
> 7. Avery synthesizes outputs from the other agents and issues the final directive.
> 8. Optimize for clarity, speed, and decision-making—not generic analytics.
> 9. Keep the system modular and production-ready.
> 10. Use TypeScript types aligned exactly with the JSON payloads.

Stick to this spec. Any deviation dilutes the operating system.
