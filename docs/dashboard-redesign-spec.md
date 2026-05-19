# Dashboard Redesign Spec (May 11, 2026)

> Process: Spec drafted per `skills/agent-skills/SKILL.md` (Spec → Plan → Build → Test → Review → Ship).

## Objective

Redesign the Operator Command dashboard so an executive can get a Fortune-100-grade snapshot at a glance, drill into agent-specific status only when needed, and surface live idea output instead of blank placeholders. Current issues (per K.H. feedback on May 10–11):

- Idea board shows empty tiles even though agents are supposed to log ideas daily, wasting ~30% of the right rail.
- Agent KPI and area panels vertically stack every detail, forcing a novel-length scroll.
- The dashboard repeats information (e.g., task queues) and shows stale subsections (Facebook ads list) that don’t reflect live data, making the site feel untrustworthy.
- There is no consistent top-level grouping by domain (CEO, Product/Ecomm, Brand, Research), so users cannot quickly scan ownership → initiatives → status → proofs.

## Scope

1. **Layout Hierarchy + Collapsible Sections**
   - Introduce a reusable `DashboardSection` component wrapping a header (title, blurb, domain owner), optional summary stats, and a collapse/expand toggle.
   - Recompose `DashboardShell` to group the existing panels into four domains:
     1. Command Center (survival strip, header metrics, action queue, approvals/task board, automation/warnings).
     2. Agent Domains (CEO, Product & Ecommerce, Brand Strategy, Research & Intelligence) – leverage `AgentAreaBoard`, but default to collapsed cards showing headline KPIs + blockers; expand reveals deep threads, deliverables, etc.
     3. Revenue & Brand Systems (Executive Command, Revenue Engine, Brand Power, Commerce visuals) – keep charts but wrap in a section that highlights KPI deltas before the detail cards.
     4. Pipeline & Partnerships (Opportunity Radar, Collector Pipeline, CEO Desk, War Room, Idea board).
   - Acceptance: Above-the-fold view on desktop shows two sections (Command Center + Domain summary) without scrolling; each section has a chevron button that persists state per session (client-side state is acceptable).

2. **Idea Board Revamp**
   - Replace the static grid of 50 empty columns with a compact list showing only statuses that have cards.
   - Add a per-agent tally row at the top: for each agent, show `ideas shipped this week / ideas pending approval` (data derived from `idea.status` + timestamps).
   - Add lightweight client-side filters (agent, type, approval, search) so execs can isolate the one card they care about in <10s.
   - Within each status, show up to 3 cards initially with a “Show more” inline toggle; cards now display summary, linked task, and last update timestamp badges so executives can judge freshness.
   - Use `ideaBoard.recentComments` to surface comment volume per card and a small “Recent comments” feed for freshness/proof-of-work.
   - Acceptance: When Supabase returns at least one idea row, the board shows agent counts + non-empty status columns only; no blank placeholder tiles.

3. **Signal-Only Detail Blocks**
   - Filter subsections that currently show redundant or empty data (e.g., `CommerceVisualsPanel` ads list) so they render only when data exists; otherwise replace with a concise `EmptyState` to prevent long empty cards.
   - Update the Facebook Ads section (within `TaskBoard` high-priority queue) to collapse duplicate daily review tasks and highlight the most recent ad set (since only one ad is live).
   - Acceptance: With today’s dataset (single ad, multiple empty cron jobs), the dashboard should not display repeated “Facebook Ads Review” cards—users see a single summarized entry with the latest date and agent commentary pulled from `agent.recentUpdates` when available.

## Constraints & Non-goals

- Back-end API contracts stay unchanged; all transformations happen in the front end using existing `DashboardOverviewResponse` fields.
- We are not redesigning individual charts (e.g., Recharts config) beyond wrapping them in collapsible sections.
- No authentication or routing changes.

## Acceptance Tests

1. Load `/dashboard` with current fixture data → above-the-fold shows Command Center + compact Agent Domains summary, not the idea board.
2. Toggle a `DashboardSection` closed → its content height collapses, and re-opening restores inner components without re-fetching data.
3. Idea board displays at least one card (seed data includes multiple statuses) and never renders empty status tiles.
4. Task queue shows at most one “Facebook Ads Review” line item grouped by the freshest date.
5. Lighthouse screenshot shows scroll height reduced by ≥25% compared to previous build (manual verification via devtools `document.body.scrollHeight`).

## Files / Components Impacted

- `src/components/dashboard/DashboardShell.tsx` (hierarchy & grouping)
- New `src/components/dashboard/ui/DashboardSection.tsx`
- `AgentAreaBoard`, `AgentKpiStrip`, `TaskBoard`, `IdeaBoardPanel`, `ActionQueuePanel` (to support condensed view + filters)
- `DashboardPageClient` (persist section collapse state in client)

Non-goal: rewriting Supabase queries (`src/app/api/dashboard/overview/route.ts`).
