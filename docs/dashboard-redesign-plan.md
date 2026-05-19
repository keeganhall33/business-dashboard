# Dashboard Redesign Plan

Reference: `docs/dashboard-redesign-spec.md`

## Slice 1 — Section scaffolding
- **Goal:** Introduce a reusable `DashboardSection` wrapper that handles headers, optional meta, and collapse/expand state (ARIA-compliant) for grouping panels.
- **Implementation:**
  - Create `src/components/dashboard/ui/DashboardSection.tsx` exporting a client component with props `{ title, subtitle, meta?, defaultOpen?, children }`.
  - Use `useState` to track open/closed; emit buttons with `aria-expanded` + chevron icon from heroicons already installed.
  - Provide slots for summary meta (e.g., KPI chips) and content area that animates height (simple conditional rendering acceptable).
- **Verification:** unit via Storybook not available; rely on manual check in dev server to ensure toggling hides/shows children without layout shift warnings.
- **Rollback:** revert new component + import statements.

## Slice 2 — Recompose `DashboardShell`
- **Goal:** Apply the new section wrapper to reorganize the layout per spec (Command Center, Agent Domains, Revenue & Brand, Pipeline & Partnerships).
- **Implementation:**
  - Update `DashboardShell.tsx` to import `DashboardSection` and restructure markup.
  - Group existing panels accordingly; remove redundant grid wrappers where sections now control layout.
  - Ensure Command Center keeps Action Queue, TaskBoard, Automation/WarRoom sidebars in a single section with an internal grid.
  - Provide `defaultOpen` states (Command Center + Revenue open by default; others collapsed).
- **Verification:** run `npm run lint` + visual spot-check to confirm sections render and toggles operate.
- **Rollback:** revert `DashboardShell.tsx`.

## Slice 3 — Compact Agent Domains (AgentKpiStrip + AgentAreaBoard)
- **Goal:** Reduce vertical mass by summarizing per-agent KPIs and deferring deep detail until expanded.
- **Implementation:**
  - In `AgentKpiStrip`, add a `dense` prop so we can reuse a condensed summary row (title + top 2 KPIs) for the section header.
  - In `AgentAreaBoard`, default every agent card to collapsed view showing: plan status badge, live task count, blocker summary; add a “Expand thread” button hooking existing `expandedAgent` logic.
  - Hide long lists (deliverables, conversations) unless `expanded` is true.
- **Verification:** confirm initial render shows smaller cards, expanding exposes existing details.
- **Rollback:** revert file edits.

## Slice 4 — Idea Board revamp
- **Goal:** Show only meaningful idea data with agent contribution counts.
- **Implementation:**
  - Enhance IdeaBoardPanel to compute per-agent stats from `board.columns` (map status + agentKey) and render a summary row of chips (use `StatusChip`).
  - Add filters (agent, type, approval, search) to reduce hunting time on dense boards; all filtering is client-side.
  - Filter out statuses with zero cards; order statuses by priority (proposed → in_review → approved → in_progress → shipped).
  - Within each column, render max 3 cards + “Show remaining (n)” button to reveal rest.
  - Each card displays summary preview, linked task ID, impact (if present), comment count (derived from `ideaBoard.recentComments`), and `updatedAt` relative time.
  - Add a small “Recent comments” feed under the columns.
- **Verification:** use existing dataset to ensure cards appear; manual toggle of show more.
- **Rollback:** revert IdeaBoardPanel.

## Slice 5 — Task queue signal filtering
- **Goal:** Deduplicate repetitive Facebook Ads review tasks and collapse identical queue items.
- **Implementation:**
  - In `TaskBoard` (and possibly `TaskCard`), group tasks whose title matches `/Facebook Ads Review/i` by date; render the most recent item with aggregated status (count of pending days) and include latest agent update notes (if available) from `data.agentSla` or `agent.recentUpdates`.
  - Ensure other tasks remain unchanged.
- **Verification:** with current data (multiple entries), confirm UI shows a single aggregated card.
- **Rollback:** revert TaskBoard-related files.

## Slice 6 — Polish & Tests
- Run `npm run lint` and `npm run build` to catch regressions.
- Manual QA: toggle each section, verify idea board cards, ensure grouped tasks behave.
- Document change in PR summary referencing spec.

Any blockers: none anticipated; data already available client-side.
