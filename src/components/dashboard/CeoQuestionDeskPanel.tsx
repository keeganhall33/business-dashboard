"use client";

import { useMemo, useState } from "react";
import type { CeoQuestionDesk } from "@/lib/types/dashboard";
import { EmptyState } from "./ui/EmptyState";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  desk?: CeoQuestionDesk | TabbedDesk;
};

type TabKey = "needsKeegan" | "waitingOnAvery" | "resolved";

type DeskEntry = {
  id: string;
  title: string;
  status: string;
  ownerAgent?: string | null;
  context?: string | null;
  lastUpdatedAt?: string | null;
  comments?: Array<{ id: string; author: string; body: string; createdAt: string }>;
};

type TabDefinition = { label: string; count: number; items: DeskEntry[] };

type TabbedDesk = {
  needsKeegan: TabDefinition;
  waitingOnAvery: TabDefinition;
  resolved: TabDefinition;
};

export function CeoQuestionDeskPanel({ desk }: Props) {
  const [tab, setTab] = useState<TabKey>("needsKeegan");
  const tabs = useMemo(() => {
    if (isTabbedDesk(desk)) {
      return desk;
    }

    return buildTabsFromLegacy(desk);
  }, [desk]);

  const active = tabs[tab];

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">CEO question desk</div>
          <p className="mt-1 text-sm text-zinc-400">Triage queue: what needs your attention vs what’s waiting.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TabButton
          active={tab === "needsKeegan"}
          onClick={() => setTab("needsKeegan")}
          label={tabs.needsKeegan.label}
          count={tabs.needsKeegan.count}
          tone="amber"
        />
        <TabButton
          active={tab === "waitingOnAvery"}
          onClick={() => setTab("waitingOnAvery")}
          label={tabs.waitingOnAvery.label}
          count={tabs.waitingOnAvery.count}
          tone="sky"
        />
        <TabButton
          active={tab === "resolved"}
          onClick={() => setTab("resolved")}
          label={tabs.resolved.label}
          count={tabs.resolved.count}
          tone="emerald"
        />
      </div>

      <div className="mt-5 space-y-3">
        {active.items.length === 0 ? (
          <EmptyState title="Nothing here" detail="No questions in this lane." />
        ) : (
          active.items.map((entry) => <QuestionEntry key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
}

function isTabbedDesk(value: CeoQuestionDesk | TabbedDesk | undefined): value is TabbedDesk {
  if (!value) return false;
  return Boolean(
    (value as Partial<TabbedDesk>).needsKeegan &&
    (value as Partial<TabbedDesk>).waitingOnAvery &&
    (value as Partial<TabbedDesk>).resolved
  );
}

function buildTabsFromLegacy(desk?: CeoQuestionDesk): TabbedDesk {
  const base: TabbedDesk = {
    needsKeegan: { label: "Needs Keegan", count: 0, items: [] },
    waitingOnAvery: { label: "Waiting on Avery", count: 0, items: [] },
    resolved: { label: "Resolved", count: 0, items: [] }
  };
  if (!desk) return base;

  const commentByQuestion = new Map<string, DeskEntry["comments"]>();
  for (const comment of desk.recentComments ?? []) {
    const questionId = comment.questionId;
    const list = commentByQuestion.get(questionId) ?? [];
    list.push({ id: comment.id, author: comment.commenter, body: comment.body, createdAt: comment.createdAt });
    commentByQuestion.set(questionId, list);
  }

  const needsKeeganItems: DeskEntry[] = (desk.escalations ?? []).map((q) => ({
    id: q.id,
    title: q.question,
    status: q.status,
    ownerAgent: null,
    context: null,
    lastUpdatedAt: q.updatedAt,
    comments: commentByQuestion.get(q.id)
  }));

  const waitingItems: DeskEntry[] = (desk.openQuestions ?? []).map((q) => ({
    id: q.id,
    title: q.question,
    status: q.status,
    ownerAgent: q.ownerAgent,
    context: q.context,
    lastUpdatedAt: q.updatedAt,
    comments: commentByQuestion.get(q.id)
  }));

  return {
    needsKeegan: { label: "Needs Keegan", count: needsKeeganItems.length, items: needsKeeganItems },
    waitingOnAvery: { label: "Waiting on Avery", count: waitingItems.length, items: waitingItems },
    resolved: base.resolved
  };
}

function TabButton({
  active,
  onClick,
  label,
  count,
  tone
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "amber" | "sky" | "emerald";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition ${
        active ? "border-zinc-500 bg-zinc-900/60 text-zinc-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
      }`}
    >
      <span>{label}</span>
      <span className="ml-2">
        <StatusChip label={String(count)} tone={tone} className="px-2 py-0.5" />
      </span>
    </button>
  );
}

function QuestionEntry({ entry }: { entry: DeskEntry }) {
  const [open, setOpen] = useState(false);
  const comments = entry.comments ?? [];
  const latest = comments.at(-1) ?? null;
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-50">{entry.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {entry.ownerAgent ? <StatusChip label={entry.ownerAgent} /> : null}
            <StatusChip label={normalizeQuestionStatus(entry.status)} tone={questionTone(entry.status)} />
            {entry.lastUpdatedAt ? <StatusChip label={`updated ${formatDate(entry.lastUpdatedAt)}`} /> : null}
          </div>
          {!open && latest ? (
            <p className="mt-3 line-clamp-2 text-sm text-zinc-400">
              {latest.author}: {latest.body}
            </p>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{open ? "Collapse" : "Expand"}</div>
      </button>

      {open ? (
        <div className="border-t border-zinc-900 p-4">
          {entry.context ? (
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Context</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{entry.context}</p>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Thread</div>
            {comments.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No comments yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                    <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                      {comment.author} · {formatDate(comment.createdAt)}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeQuestionStatus(status: string) {
  return status.replace(/_/g, " ");
}

function questionTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("resolved")) return "emerald" as const;
  if (normalized.includes("waiting")) return "sky" as const;
  if (normalized.includes("needs")) return "amber" as const;
  return "zinc" as const;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
