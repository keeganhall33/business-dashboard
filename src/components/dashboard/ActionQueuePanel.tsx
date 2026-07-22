"use client";

import { useMemo, useState } from "react";
import { buildQuickActions } from "@/lib/action-queue";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { ActionQueueDisplayItem, EnrichedQueueItem, buildActionQueueSections, priorityTone, titleCase } from "@/lib/action-queue-groups";
import type { ActionQueue } from "@/lib/types/dashboard";
import { ActionQueueQuickActions } from "./ActionQueueQuickActions";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  data: ActionQueue;
  suppressQuickActions?: boolean;
};


type ProcessedSection = {
  label: string;
  items: ActionQueueDisplayItem[];
  count: number;
};

type GroupedQueueItem = Extract<ActionQueueDisplayItem, { kind: "group" }>;

export function ActionQueuePanel({ data, suppressQuickActions = false }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const sections = useMemo<ProcessedSection[]>(() => buildActionQueueSections(data), [data]);
  const quickActions = useMemo(() => buildQuickActions(data), [data]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Needs Keegan</div>
          <div className="text-lg font-semibold text-zinc-100">Action Queue</div>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {suppressQuickActions ? null : <ActionQueueQuickActions items={quickActions} />}

        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.label} className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-zinc-100">
                <span>{section.label}</span>
                <span className="text-xs text-zinc-500" data-testid="action-queue-section-count">
                  {section.count}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {section.count === 0 ? (
                  <div className="text-sm text-zinc-500">All clear.</div>
                ) : (
                  section.items.map((item) =>
                    item.kind === "group" ? (
                      <ActionQueueGroupCard
                        key={item.id}
                        item={item}
                        expanded={Boolean(expandedGroups[item.id])}
                        onToggle={() => toggleGroup(item.id)}
                      />
                    ) : (
                      <ActionQueueCard key={item.id} item={item.data} />
                    )
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionQueueCard({ item }: { item: EnrichedQueueItem }) {
  return (
    <div className="rounded-xl border border-[var(--ui-border)] bg-black/30 p-3" data-testid="action-queue-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-50">{item.original.title}</div>
          {item.original.summary && <div className="mt-1 text-sm text-zinc-400">{item.original.summary}</div>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {item.requiresApproval ? <StatusChip label="Approval required" tone="amber" /> : null}
          <StatusChip label={`Priority: ${titleCase(item.priority)}`} tone={priorityTone(item.priority)} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span data-testid="action-queue-owner">{item.ownerLabel}</span>
        <span data-testid="action-queue-updated">{item.timestampLabel}</span>
        {item.dueLabel && <span data-testid="action-queue-due">{item.dueLabel}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
        <span className="capitalize">{item.original.itemType}</span>
        <div className="flex items-center gap-3">
          {item.actorLabel && <span>{item.actorLabel}</span>}
          {item.original.dueAt && formatRelativeTimeFromNow(item.original.dueAt)}
        </div>
      </div>
    </div>
  );
}

function ActionQueueGroupCard({
  item,
  expanded,
  onToggle
}: {
  item: GroupedQueueItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const listId = `${item.id}-items`;

  return (
    <div className="rounded-xl border border-[var(--ui-border)] bg-black/30 p-3" data-testid="action-queue-group">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-50">{item.title}</div>
          {item.summary && <div className="mt-1 text-sm text-zinc-400">{item.summary}</div>}
          <div className="mt-2 text-xs text-zinc-500">
            Latest signal • {item.timestampLabel}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusChip label={`${item.count} signals`} tone="zinc" data-testid="action-queue-group-count" />
          <StatusChip label={item.platformLabel} tone="sky" />
          {item.requiresApproval ? <StatusChip label="Approval required" tone="amber" /> : null}
          <StatusChip label={`Priority: ${titleCase(item.priority)}`} tone={priorityTone(item.priority)} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>{item.ownerLabel}</span>
        <span>{item.timestampLabel}</span>
        {item.dueLabel && <span>{item.dueLabel}</span>}
      </div>
      <div className="mt-3">
        <button
          type="button"
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-200 hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={listId}
          data-testid="action-queue-group-toggle"
        >
          {expanded ? "Hide underlying signals" : "Show underlying signals"}
        </button>
        {expanded ? (
          <ul id={listId} className="mt-3 space-y-2" data-testid="action-queue-group-items">
            {item.items.map((entry) => (
              <li key={entry.original.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-zinc-100">
                  <span>{entry.original.title}</span>
                  <span className="text-xs text-zinc-500">{entry.timestampLabel}</span>
                </div>
                {entry.original.summary && (
                  <div className="mt-1 text-sm text-zinc-400">{entry.original.summary}</div>
                )}
                <div className="mt-1 text-xs text-zinc-500">
                  {entry.ownerLabel} • {entry.actorLabel ?? "Owner unavailable"}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}










