# Operator Command System — API & UI Specification

_Last updated: 2026-03-28_

## REST API Contracts

### GET `/api/dashboard/overview`
Returns the full command-surface payload used to render the dashboard.

```json
{
  "ok": true,
  "timestamp": "2026-03-28T18:30:00.000Z",
  "headerMetrics": [
    {
      "metricKey": "monthly_revenue",
      "metricName": "Monthly Revenue",
      "category": "financial",
      "currentValue": 28500,
      "targetValue": 83000,
      "deltaPercent": 7.95,
      "status": "critical",
      "unit": "usd",
      "ownerAgent": "sloan",
      "measuredAt": "2026-03-28T18:00:00.000Z"
    },
    {
      "metricKey": "aov",
      "metricName": "Average Order Value",
      "category": "conversion",
      "currentValue": 92,
      "targetValue": 300,
      "deltaPercent": 1.1,
      "status": "critical",
      "unit": "usd",
      "ownerAgent": "sloan",
      "measuredAt": "2026-03-28T18:00:00.000Z"
    },
    {
      "metricKey": "conversion_rate",
      "metricName": "Website Conversion Rate",
      "category": "conversion",
      "currentValue": 1.4,
      "targetValue": 3.0,
      "deltaPercent": 0,
      "status": "critical",
      "unit": "percent",
      "ownerAgent": "sloan",
      "measuredAt": "2026-03-28T18:00:00.000Z"
    },
    {
      "metricKey": "active_brand_conversations",
      "metricName": "Active Brand Conversations",
      "category": "partnerships",
      "currentValue": 3,
      "targetValue": 10,
      "deltaPercent": 0,
      "status": "critical",
      "unit": "count",
      "ownerAgent": "noah",
      "measuredAt": "2026-03-28T18:00:00.000Z"
    }
  ],
  "executiveCommand": {
    "weeklyDirective": "Shift focus to pricing power, conversion lift, and partnership pipeline expansion immediately.",
    "topPriorities": [
      "Increase AOV via premium tiered pricing",
      "Fix homepage and product page conversion bottlenecks",
      "Expand active partnership conversations from 3 to 10"
    ],
    "biggestBottlenecks": [
      "AOV is far below target",
      "Conversion rate is underperforming",
      "Partnership pipeline is too thin"
    ],
    "ceoRecommendation": "Do not chase volume. Increase pricing power, strengthen luxury messaging, and build the partnership machine."
  },
  "revenueEngine": {
    "metrics": [
      { "metricKey": "monthly_revenue", "currentValue": 28500, "targetValue": 83000, "status": "critical", "unit": "usd" },
      { "metricKey": "aov", "currentValue": 92, "targetValue": 300, "status": "critical", "unit": "usd" },
      { "metricKey": "revenue_per_visitor", "currentValue": 1.8, "targetValue": 6.0, "status": "warning", "unit": "usd" },
      { "metricKey": "conversion_rate", "currentValue": 1.4, "targetValue": 3.0, "status": "critical", "unit": "percent" }
    ],
    "moneyLeaks": [
      "Low AOV is the single largest revenue constraint.",
      "High cart abandonment is reducing recovered sales.",
      "Weak conversion rate is suppressing total revenue."
    ],
    "fastestPathToIncreaseRevenue": [
      { "move": "Raise AOV from $92 to $180", "estimatedImpact": "+$15K to +$20K / month" },
      { "move": "Recover 10 percent of abandoned carts", "estimatedImpact": "+$4K to +$7K / month" }
    ]
  },
  "brandPower": {
    "metrics": [
      { "metricKey": "social_growth_monthly", "currentValue": 3, "targetValue": 10, "status": "warning", "unit": "percent" },
      { "metricKey": "engagement_rate", "currentValue": 2.1, "targetValue": 5, "status": "warning", "unit": "percent" },
      { "metricKey": "cultural_relevance_score", "currentValue": 6.2, "targetValue": 8.5, "status": "warning", "unit": "score" }
    ],
    "whatIsWorking": [
      "Authority-based storytelling performs better than generic art promotion.",
      "Collaboration-driven content has stronger prestige impact."
    ],
    "whatToDoNext": [
      "Reposition homepage and campaign copy around Impossible in Pencil.",
      "Create a collector-status narrative series."
    ]
  },
  "opportunityRadar": {
    "activeCount": 3,
    "readyForOutreachCount": 0,
    "topOpportunities": [
      {
        "id": "0ff86e40-c0f0-4ba5-a5a3-79682d5bf111",
        "name": "Topps athlete art collaboration",
        "organization": "Topps",
        "opportunityType": "licensing",
        "status": "researching",
        "valueEstimate": 50000,
        "prestigeScore": 9.2,
        "probabilityScore": 0.35,
        "ownerAgent": "noah",
        "nextStep": "Map the right contact and build target-specific pitch angle",
        "nextStepDueAt": "2026-04-03T17:00:00.000Z"
      }
    ],
    "nextFiveMoves": [
      "Build 25-brand target list",
      "Prioritize 10 high-prestige targets",
      "Prepare pitch angles by category",
      "Draft outreach assets for approval",
      "Track response readiness by opportunity"
    ]
  },
  "tasks": [
    {
      "id": "7b0c6b04-6b7c-46af-b6ce-7266c9917771",
      "title": "Redesign product pricing structure",
      "agentKey": "sloan",
      "priority": "critical",
      "status": "pending",
      "expectedImpact": "Increase AOV by 100 to 200 percent",
      "impactScore": 9.5,
      "requiresApproval": true
    }
  ],
  "systemHealth": {
    "dataFreshnessHours": 6,
    "agentTaskCompletionRate": 62,
    "agents": [
      { "agentKey": "avery", "lastRunAt": "2026-03-28T08:00:00.000Z", "openTaskCount": 3, "completedTaskCount": 7, "health": "healthy" },
      { "agentKey": "lyra", "lastRunAt": "2026-03-28T08:01:00.000Z", "openTaskCount": 4, "completedTaskCount": 5, "health": "healthy" }
    ]
  }
}
```

### GET `/api/dashboard/agent/:agentKey`
```json
{
  "ok": true,
  "agent": {
    "agentKey": "sloan",
    "displayName": "Sloan",
    "roleTitle": "Head of Product & Ecommerce",
    "mandate": "Increase revenue, conversion rate, AOV, repeat purchase rate, and monetization efficiency.",
    "decisionScope": "Pricing, conversion, offer structure, checkout optimization, collector monetization."
  },
  "ownedMetrics": [
    { "metricKey": "aov", "metricName": "Average Order Value", "currentValue": 92, "targetValue": 300, "status": "critical", "unit": "usd" },
    { "metricKey": "conversion_rate", "metricName": "Website Conversion Rate", "currentValue": 1.4, "targetValue": 3.0, "status": "critical", "unit": "percent" }
  ],
  "recentUpdates": [
    {
      "id": "62b7e643-547d-4300-b7f2-6d55d8c49001",
      "updateType": "insight",
      "title": "Low AOV is the primary revenue bottleneck",
      "summary": "The current product architecture is suppressing average order value.",
      "detailMd": "Signed premium tiers are underdeveloped and product ladders are weak.",
      "priority": "critical",
      "createdAt": "2026-03-28T08:02:00.000Z"
    }
  ],
  "openTasks": [
    {
      "id": "7b0c6b04-6b7c-46af-b6ce-7266c9917771",
      "title": "Redesign product pricing structure",
      "priority": "critical",
      "status": "pending",
      "expectedImpact": "Increase AOV by 100 to 200 percent",
      "whyThisMatters": "AOV is far below target and is suppressing revenue growth.",
      "relatedMetricKeys": ["aov","monthly_revenue"],
      "requiresApproval": true
    }
  ],
  "completedTasks": [],
  "weeklyOutputRequirements": {
    "weekly": ["3 revenue insights","3 actions","1 pricing recommendation"]
  }
}
```

### Task endpoints
- `GET /api/tasks` with query params `{ agentKey, priority, status }` returns `{ ok, items[], count }`.
- `POST /api/tasks` creates a task and returns `{ ok, task }`.
- `PATCH /api/tasks/:id/approve` marks approved.
- `PATCH /api/tasks/:id/reject` marks rejected with reason.
- `PATCH /api/tasks/:id/status` updates status.
- `PATCH /api/tasks/:id/complete` records completion + result summary.

### Opportunity endpoints
- `GET /api/opportunities` → `{ ok, items[], count }`.
- `POST /api/opportunities` → `{ ok, opportunity }`.

### Decision log
- `POST /api/decisions` records major decisions and follow-up dates.

### Agent orchestration
- `POST /api/agents/run/:agentKey` triggers a single agent.
- `POST /api/agents/run-all` runs the sequence `["sloan","lyra","noah","avery"]`.

### Automation
- `POST /api/automation/evaluate-rules` evaluates metric rules and creates downstream tasks, returning `{ ok, rulesEvaluated, triggersFired[] }`.

## React / Next.js Component Architecture

```
src/
├─ app/
│  └─ dashboard/
│     ├─ page.tsx
│     └─ layout.tsx
├─ components/
│  └─ dashboard/
│     ├─ DashboardShell.tsx
│     ├─ HeaderStatusBar.tsx
│     ├─ ExecutiveCommandPanel.tsx
│     ├─ RevenueEnginePanel.tsx
│     ├─ BrandPowerPanel.tsx
│     ├─ OpportunityRadarPanel.tsx
│     ├─ TaskBoard.tsx
│     ├─ SystemHealthPanel.tsx
│     ├─ DecisionLogPanel.tsx
│     ├─ AgentActivityPanel.tsx
│     ├─ MoneyLeaksCard.tsx
│     ├─ PriorityList.tsx
│     ├─ MetricCard.tsx
│     ├─ MetricGapBar.tsx
│     ├─ RevenueTrendChart.tsx
│     ├─ PipelineFunnel.tsx
│     ├─ TaskCard.tsx
│     ├─ AgentUpdateCard.tsx
│     └─ ApprovalActions.tsx
├─ components/ui/
│  ├─ Card.tsx
│  ├─ SectionHeader.tsx
│  ├─ StatusPill.tsx
│  ├─ EmptyState.tsx
│  ├─ LoadingState.tsx
│  └─ ErrorState.tsx
├─ lib/
│  ├─ api/
│  │  ├─ dashboard.ts
│  │  ├─ tasks.ts
│  │  ├─ opportunities.ts
│  │  ├─ decisions.ts
│  │  └─ agents.ts
│  ├─ types/
│  │  ├─ dashboard.ts
│  │  ├─ tasks.ts
│  │  ├─ opportunities.ts
│  │  ├─ decisions.ts
│  │  └─ agents.ts
│  └─ utils/
│     ├─ format.ts
│     └─ status.ts
```

### Key Types
Defined in `src/lib/types/dashboard.ts`:
- `HeaderMetric`
- `ExecutiveCommand`
- `RevenueEngine`
- `BrandPower`
- `OpportunityRadar`
- `TaskSummary`
- `AgentHealth`
- `SystemHealth`
- `DashboardOverviewResponse`

### Core Components
- `DashboardPage` fetches overview data server-side and renders `DashboardShell`.
- `DashboardShell` arranges the five command panels + task board + system health.
- `HeaderStatusBar` renders the top status tiles via `MetricCard`.
- `ExecutiveCommandPanel`, `RevenueEnginePanel`, `BrandPowerPanel`, `OpportunityRadarPanel`, `TaskBoard`, `SystemHealthPanel` each consume typed subsets of the payload.

This file is the canonical reference for engineering hand-off. Update it whenever payloads, components, or orchestration flows change.
