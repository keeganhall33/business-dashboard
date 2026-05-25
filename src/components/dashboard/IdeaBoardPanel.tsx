"use client";

import { useMemo, useState } from "react";
import type { IdeaBoard, IdeaCard } from "@/lib/types/dashboard";
import { EmptyState } from "./ui/EmptyState";
import { StatusChip } from "./ui/StatusChip";
import { ViewWorkModal } from "./ViewWorkModal";
import { InsightCard, type InsightObject } from "./ui/InsightCard";

type Props = {
  board?: IdeaBoard;
};

type IdeaFilters = {
  agentKey: string;
  ideaType: string;
  approval: "all" | "needs" | "approved" | "none";
  search: string;
};

type IdeaWithStatus = IdeaCard & { statusKey: string };

const DEFAULT_FILTERS: IdeaFilters = {
  agentKey: "all",
  ideaType: "all",
  approval: "all",
  search: ""
};

export function IdeaBoardPanel({ board }: Props) {
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<IdeaFilters>(DEFAULT_FILTERS);
  const [taskLinks, setTaskLinks] = useState<Record<string, string>>({});
  const [syncingIdeaId, setSyncingIdeaId] = useState<string | null>(null);

  const linkedTasks = board?.linkedTasks ?? {};

  const rawColumns = normalizeColumns(board).filter((column) => column.ideas.length > 0);

  const allIdeas = useMemo<IdeaWithStatus[]>(
    () => rawColumns.flatMap((col) => col.ideas.map((idea) => ({ ...idea, statusKey: col.key }))),
    [rawColumns]
  );
  const commentCountByIdeaId = useMemo(() => {
    const map = new Map<string, number>();
    (board?.recentComments ?? []).forEach((comment) => {
      map.set(comment.ideaId, (map.get(comment.ideaId) ?? 0) + 1);
    });
    return map;
  }, [board?.recentComments]);

  const agentOptions = useMemo(() => {
    const entries = new Map<string, string>();
    allIdeas.forEach((idea) => entries.set(idea.agentKey, idea.agentName));
    return Array.from(entries.entries())
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [allIdeas]);

  const ideaTypeOptions = useMemo(() => {
    const set = new Set<string>();
    allIdeas.forEach((idea) => set.add(idea.ideaType));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allIdeas]);

  const filteredColumns = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = rawColumns
      .map((column) => {
        const ideas = column.ideas.filter((idea) => {
          if (filters.agentKey !== "all" && idea.agentKey !== filters.agentKey) return false;
          if (filters.ideaType !== "all" && String(idea.ideaType) !== filters.ideaType) return false;

          if (filters.approval === "needs" && !(idea.requiresCeoApproval && !idea.approvedAt)) return false;
          if (filters.approval === "approved" && !(idea.requiresCeoApproval && Boolean(idea.approvedAt))) return false;
          if (filters.approval === "none" && idea.requiresCeoApproval) return false;

          if (search) {
            const haystack = `${idea.title} ${idea.summary ?? ""} ${idea.agentName} ${idea.agentKey}`.toLowerCase();
            if (!haystack.includes(search)) return false;
          }

          return true;
        });

        return { ...column, ideas };
      })
      .filter((column) => column.ideas.length > 0);

    return sortColumns(filtered);
  }, [filters, rawColumns]);

  const overviewStats = useMemo(() => buildOverviewStats(allIdeas), [allIdeas]);
  const agentStats = useMemo(() => buildAgentStatsByIdeaList(allIdeas), [allIdeas]);

  if (!rawColumns.length) {
    return (
      <section className="ui-glass ui-glass-hover rounded-3xl p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Idea board</div>
        <p className="mt-2 text-sm text-zinc-400">No ideas in the current range.</p>
        <div className="mt-4">
          <EmptyState title="No cards" detail="When agents propose product/brand moves, they’ll appear here by status." />
        </div>
      </section>
    );
  }

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Idea board</div>
          <p className="mt-1 text-sm text-zinc-400">Supabase-backed pipeline: proposed → shipped, with approvals + commentary.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusChip label={`${overviewStats.total} total`} tone="zinc" />
          <StatusChip label={`${overviewStats.needsApproval} needs approval`} tone={overviewStats.needsApproval > 0 ? "amber" : "zinc"} />
          <StatusChip label={`${overviewStats.shipped7d} shipped (7d)`} tone={overviewStats.shipped7d > 0 ? "emerald" : "zinc"} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label="Agent"
          value={filters.agentKey}
          onChange={(value) => setFilters((current) => ({ ...current, agentKey: value }))}
          options={[{ label: "All agents", value: "all" }, ...agentOptions.map((a) => ({ label: a.agentName, value: a.agentKey }))]}
        />
        <FilterSelect
          label="Type"
          value={filters.ideaType}
          onChange={(value) => setFilters((current) => ({ ...current, ideaType: value }))}
          options={[{ label: "All types", value: "all" }, ...ideaTypeOptions.map((type) => ({ label: type, value: type }))]}
        />
        <FilterSelect
          label="Approval"
          value={filters.approval}
          onChange={(value) => setFilters((current) => ({ ...current, approval: value as IdeaFilters["approval"] }))}
          options={[
            { label: "All", value: "all" },
            { label: "Needs CEO approval", value: "needs" },
            { label: "Approved", value: "approved" },
            { label: "No approval required", value: "none" }
          ]}
        />
        <FilterInput
          label="Search"
          value={filters.search}
          onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
          placeholder="title, summary, agent…"
        />

        <div className="md:col-span-2 xl:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {agentStats.map((stat) => (
                <div key={stat.agentKey} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-xs font-semibold text-zinc-100">{stat.agentName}</div>
                  <div className="flex flex-wrap gap-2">
                    <StatusChip label={`${stat.shipped7d} shipped (7d)`} tone={stat.shipped7d > 0 ? "emerald" : "zinc"} />
                    <StatusChip label={`${stat.needsApproval} needs approval`} tone={stat.needsApproval > 0 ? "amber" : "zinc"} />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-200 hover:border-white/20 hover:bg-white/[0.04]"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Reset filters
            </button>
          </div>
        </div>
      </div>

      {!filteredColumns.length ? (
        <div className="mt-6">
          <EmptyState title="No matching cards" detail="Your filters are hiding everything. Reset filters or widen search." />
        </div>
      ) : (
        <div className="ui-scroll-snap-x mt-6 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
          {filteredColumns.map((column) => {
            const isExpanded = expandedColumns[column.key];
            const visibleIdeas = isExpanded ? column.ideas : column.ideas.slice(0, 3);
            const hiddenCount = column.ideas.length - visibleIdeas.length;

            return (
              <div
                key={column.key}
                className="ui-snap-item w-[86vw] min-w-[300px] max-w-[520px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:w-auto md:min-w-0 md:max-w-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{column.title}</div>
                  <StatusChip label={String(column.ideas.length)} tone={columnTone(column.key)} />
                </div>

                <div className="mt-4 space-y-3">
                  {visibleIdeas.map((idea) => (
                    <IdeaCardView
                      key={idea.id}
                      idea={idea}
                      statusKey={column.key}
                      commentCount={commentCountByIdeaId.get(idea.id) ?? 0}
                      linkedTaskIdOverride={taskLinks[idea.id] ?? null}
                      linkedTask={idea.linkedTaskId ? linkedTasks[idea.linkedTaskId] ?? null : null}
                      syncing={syncingIdeaId === idea.id}
                      onEnsureReviewTask={async (ideaId) => {
                        try {
                          setSyncingIdeaId(ideaId);
                          const response = await fetch("/api/automation/idea-board/sync-review-tasks", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ ideaId })
                          });
                          if (!response.ok) return;
                          const data = (await response.json()) as {
                            ensured?: Array<{ ideaId: string; linkedTaskId: string }>;
                          };
                          const match = data.ensured?.find((row) => row.ideaId === ideaId);
                          if (match?.linkedTaskId) {
                            setTaskLinks((current) => ({ ...current, [ideaId]: match.linkedTaskId }));
                          }
                        } finally {
                          setSyncingIdeaId((current) => (current === ideaId ? null : current));
                        }
                      }}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-200 hover:border-white/20 hover:bg-white/[0.04]"
                      onClick={() =>
                        setExpandedColumns((current) => ({
                          ...current,
                          [column.key]: !isExpanded
                        }))
                      }
                    >
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {board?.recentComments?.length ? (
        <div className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Recent comments</div>
            <StatusChip label={String(board.recentComments.length)} tone="zinc" />
          </div>
          <div className="mt-4 space-y-3">
            {board.recentComments.slice(0, 8).map((comment) => (
              <div key={comment.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <div>
                    <span className="font-semibold text-zinc-200">{comment.commenter}</span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-500">Idea {comment.ideaId.slice(0, 8)}</span>
                  </div>
                  <div className="text-zinc-600">{formatRelativeDate(comment.createdAt)}</div>
                </div>
                <div className="mt-2 text-sm text-zinc-300">{comment.comment}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function IdeaCardView({
  idea,
  statusKey,
  commentCount,
  linkedTaskIdOverride,
  linkedTask,
  syncing,
  onEnsureReviewTask
}: {
  idea: IdeaCard;
  statusKey: string;
  commentCount: number;
  linkedTaskIdOverride: string | null;
  linkedTask: {
    id: string;
    title: string;
    status: string;
    priority: string;
    requiresApproval: boolean;
    approvedByUser?: boolean | null;
    dueAt?: string | null;
    expectedDurationDays?: number | null;
    description?: string | null;
    deliverableLinks?: Array<{ label: string; url: string }> | null;
    updatedAt?: string | null;
  } | null;
  syncing: boolean;
  onEnsureReviewTask: (ideaId: string) => Promise<void>;
}) {
  const hasApproval = Boolean(idea.requiresCeoApproval);
  const approvalLabel = hasApproval ? (idea.approvedAt ? "approved" : "needs approval") : "no approval";
  const linkedTaskId = linkedTaskIdOverride ?? idea.linkedTaskId;
  const needsReviewTask = hasApproval && !idea.approvedAt && !linkedTaskId;
  const showImplementation = Boolean(idea.approvedAt);

  const createdAtMs = safeMs(idea.createdAt);
  const updatedAtMs = safeMs(idea.updatedAt);
  const ageBadge = createdAtMs ? `Age ${formatAgeShort(createdAtMs)}` : null;
  const touchedBadge = updatedAtMs ? `Touched ${formatAgeShort(updatedAtMs)}` : null;
  const dueBadge = linkedTask?.dueAt ? `Due ${formatDueShort(linkedTask.dueAt)}` : null;
  const nextLinks = (linkedTask?.deliverableLinks ?? []).slice(0, 2);
  const hasWork = Boolean(idea.summary || linkedTask?.description || (linkedTask?.deliverableLinks ?? []).length);
  const [openWork, setOpenWork] = useState(false);

  const insight: InsightObject = {
    id: `idea:${idea.id}`,
    title: "Idea insight",
    claim: needsReviewTask
      ? "This idea requires CEO approval, but no review task is linked yet."
      : showImplementation
      ? "Idea approved — implementation should be tracked in the linked task and shipped with proof."
      : "Idea logged — awaiting next state transition.",
    state: needsReviewTask ? "action_needed" : showImplementation ? "supported" : "pending",
    ownerLabel: idea.agentName,
    confidenceLabel: "supabase record",
    updatedAtLabel: idea.updatedAt ? `Touched ${formatRelativeDate(idea.updatedAt)}` : null,
    definition:
      "Ideas move through statuses with an explicit claim (the proposed move), evidence (links + work), and an action (approve, implement, ship).",
    evidence: [
      { label: "Status", value: statusKey.replace(/_/g, " ") },
      { label: "Approval", value: approvalLabel },
      { label: "Linked task", value: linkedTaskId ?? "—" },
      { label: "Work attached", value: hasWork ? "yes" : "no" },
      { label: "Deliverables", value: String((linkedTask?.deliverableLinks ?? []).length) }
    ],
    actions: needsReviewTask
      ? [{ label: "Queue CEO review task", detail: "So approvals show up in Action Queue.", onClick: () => void onEnsureReviewTask(idea.id) }]
      : showImplementation
      ? [{ label: "Open View work", detail: "Review implementation plan + deliverables.", onClick: () => setOpenWork(true) }]
      : [{ label: "Add evidence links", detail: "Attach up to 3 deliverable links to the linked task." }]
  };

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={idea.agentName} />
            <StatusChip label={String(idea.ideaType)} tone="sky" />
            <StatusChip label={statusKey.replace(/_/g, " ")} tone={columnTone(statusKey)} />
            <StatusChip
              label={approvalLabel}
              tone={!hasApproval ? "zinc" : idea.approvedAt ? "emerald" : "amber"}
            />
            {commentCount > 0 ? <StatusChip label={`${commentCount} comments`} tone="zinc" /> : null}
          </div>

          <div className="mt-2 truncate text-sm font-semibold text-zinc-50">{idea.title}</div>
        </div>

        {idea.expectedImpact != null ? (
          <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Impact</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{formatImpact(idea.expectedImpact)}</div>
          </div>
        ) : null}
      </div>

      {idea.summary ? <p className="mt-3 line-clamp-4 text-sm text-zinc-300">{idea.summary}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {ageBadge ? <StatusChip label={ageBadge} tone="zinc" /> : null}
        {touchedBadge ? <StatusChip label={touchedBadge} tone="zinc" /> : null}
        {dueBadge ? <StatusChip label={dueBadge} tone="amber" /> : null}
        {linkedTask ? <StatusChip label={`Task: ${linkedTask.status.replace(/_/g, " ")}`} tone="sky" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {linkedTaskId ? <span className="rounded-full border border-zinc-800 px-2 py-0.5">Task {linkedTaskId}</span> : null}
        {idea.approver ? <span>Approver: {idea.approver}</span> : null}
        {idea.updatedAt ? <span>Updated {formatRelativeDate(idea.updatedAt)}</span> : null}
      </div>

      {nextLinks.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {nextLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200 hover:border-zinc-700"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}

      {hasWork ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpenWork(true)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-200 hover:border-zinc-700"
          >
            View work
          </button>
        </div>
      ) : null}

      <div className="mt-3">
        <InsightCard insight={insight} />
      </div>

      <ViewWorkModal
        open={openWork}
        onClose={() => setOpenWork(false)}
        title={idea.title}
        subtitle={`${idea.agentName} • ${statusKey.replace(/_/g, " ")}`}
        body={linkedTask?.description ?? idea.summary ?? null}
        attachments={linkedTask?.deliverableLinks ?? null}
        metaChips={[
          { label: String(idea.ideaType), tone: "sky" },
          { label: hasApproval ? (idea.approvedAt ? "approved" : "needs approval") : "no approval", tone: !hasApproval ? "zinc" : idea.approvedAt ? "emerald" : "amber" }
        ]}
      />

      {needsReviewTask ? (
        <div className="mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">CEO review required</div>
          <p className="mt-2 text-sm text-zinc-300">No review task is linked yet. Queue one so approvals show up in the Action Queue.</p>
          <div className="mt-3">
            <button
              type="button"
              className="rounded-xl border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-100 hover:border-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={syncing}
              onClick={() => onEnsureReviewTask(idea.id)}
            >
              {syncing ? "Queuing…" : "Queue CEO review task"}
            </button>
          </div>
        </div>
      ) : null}

      {showImplementation ? (
        <div className="mt-4 rounded-2xl border border-zinc-900 bg-zinc-950/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Implementation</div>
          {linkedTask ? (
            <div className="mt-2 space-y-2">
              <div className="text-sm font-semibold text-zinc-100">{linkedTask.title}</div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">{linkedTask.priority}</span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">{linkedTask.status.replace(/_/g, " ")}</span>
                {linkedTask.dueAt ? <span className="rounded-full border border-zinc-800 px-2 py-0.5">Due {formatRelativeDate(linkedTask.dueAt)}</span> : null}
              </div>
              {linkedTask.description ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-900 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
                  {linkedTask.description.trim()}
                </pre>
              ) : (
                <p className="text-sm text-zinc-300">No implementation plan text yet. Add steps + milestones to the linked task.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-300">
              {linkedTaskId
                ? "This idea is approved, but the linked task is outside the current range."
                : "Approved, but no implementation task is linked yet. Create one and attach milestones."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function safeMs(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatAgeShort(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 0) return "0d";
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "<1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function formatDueShort(iso: string) {
  const ms = safeMs(iso);
  if (!ms) return iso;
  const diff = ms - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (Math.abs(days) < 14) return days > 0 ? `${days}d` : `${Math.abs(days)}d late`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function columnTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("live")) return "emerald" as const;
  if (normalized.includes("approved")) return "sky" as const;
  if (normalized.includes("review")) return "amber" as const;
  return "zinc" as const;
}

function sortColumns(columns: Array<{ key: string; title: string; ideas: IdeaCard[] }>) {
  const order = ["proposed", "in_review", "approved", "rejected", "in_progress", "shipped", "archived"];
  return columns
    .slice()
    .sort((a, b) => {
      const aIndex = order.indexOf(a.key);
      const bIndex = order.indexOf(b.key);
      if (aIndex === -1 && bIndex === -1) return a.key.localeCompare(b.key);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
}

function buildOverviewStats(ideas: IdeaWithStatus[]) {
  const shipped7d = ideas.filter((idea) => isShippedInLastDays(idea, 7)).length;
  const needsApproval = ideas.filter((idea) => idea.requiresCeoApproval && !idea.approvedAt).length;
  return {
    total: ideas.length,
    needsApproval,
    shipped7d
  };
}

function buildAgentStatsByIdeaList(ideas: IdeaWithStatus[]) {
  const map = new Map<string, { agentKey: string; agentName: string; shipped7d: number; needsApproval: number }>();
  ideas.forEach((idea) => {
    if (!map.has(idea.agentKey)) {
      map.set(idea.agentKey, {
        agentKey: idea.agentKey,
        agentName: idea.agentName,
        shipped7d: 0,
        needsApproval: 0
      });
    }
    const bucket = map.get(idea.agentKey)!;
    if (isShippedInLastDays(idea, 7)) bucket.shipped7d += 1;
    if (idea.requiresCeoApproval && !idea.approvedAt) bucket.needsApproval += 1;
  });

  return Array.from(map.values()).sort((a, b) => {
    const shippedDelta = b.shipped7d - a.shipped7d;
    if (shippedDelta !== 0) return shippedDelta;
    const approvalDelta = b.needsApproval - a.needsApproval;
    if (approvalDelta !== 0) return approvalDelta;
    return a.agentName.localeCompare(b.agentName);
  });
}

function isShippedInLastDays(idea: IdeaWithStatus, days: number) {
  if (idea.statusKey !== "shipped") return false;
  const date = new Date(idea.updatedAt || idea.createdAt);
  if (Number.isNaN(date.getTime())) return false;
  const threshold = Date.now() - days * 86400000;
  return date.getTime() >= threshold;
}

function formatImpact(value: number) {
  if (Number.isNaN(value)) return "–";
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">{label}</div>
      <select
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-zinc-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-zinc-950">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">{label}</div>
      <input
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function formatRelativeDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 14) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizeColumns(board?: IdeaBoard): Array<{ key: string; title: string; ideas: IdeaCard[] }> {
  if (!board) return [];
  const { columns } = board;
  if (Array.isArray(columns)) {
    return columns.map((col) => ({
      key: String(col.status ?? col.key ?? "unknown"),
      title: String(col.title ?? col.status ?? col.key ?? "Column"),
      ideas: col.ideas ?? []
    }));
  }
  if (columns && typeof columns === "object") {
    return Object.entries(columns).map(([key, ideas]) => ({
      key,
      title: key.replace(/_/g, " "),
      ideas: ideas ?? []
    }));
  }
  return [];
}
