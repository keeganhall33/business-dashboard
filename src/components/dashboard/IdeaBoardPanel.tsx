import type { IdeaBoard, IdeaCard } from "@/lib/types/dashboard";
import { EmptyState } from "./ui/EmptyState";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  board?: IdeaBoard;
};

export function IdeaBoardPanel({ board }: Props) {
  const columns = normalizeColumns(board);
  if (!columns.length) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Idea board</div>
        <p className="mt-2 text-sm text-zinc-400">No ideas in the current range.</p>
        <div className="mt-4">
          <EmptyState title="No cards" detail="When agents propose product/brand moves, they’ll appear here by status." />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Idea board</div>
          <p className="mt-1 text-sm text-zinc-400">Pipeline of initiatives, moving from proposed → live.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column.key} className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{column.title}</div>
              <StatusChip label={String(column.ideas.length)} tone={columnTone(column.key)} />
            </div>

            <div className="mt-4 space-y-3">
              {column.ideas.length === 0 ? (
                <p className="text-sm text-zinc-600">No cards.</p>
              ) : (
                column.ideas.map((idea) => <IdeaCardView key={idea.id} idea={idea} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IdeaCardView({ idea }: { idea: IdeaCard }) {
  const hasApproval = Boolean(idea.requiresCeoApproval);

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-50">{idea.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusChip label={idea.agentName} />
            <StatusChip label={idea.ideaType} tone="sky" />
            {hasApproval ? <StatusChip label={idea.approvedAt ? "approved" : "needs approval"} tone={idea.approvedAt ? "emerald" : "amber"} /> : null}
          </div>
        </div>
      </div>

      {idea.summary ? <p className="mt-3 line-clamp-4 text-sm text-zinc-300">{idea.summary}</p> : null}

      {idea.linkedTaskId ? <div className="mt-3 text-xs text-zinc-500">Linked task: {idea.linkedTaskId}</div> : null}

      {idea.approver ? <div className="mt-1 text-xs text-zinc-500">Approver: {idea.approver}</div> : null}

    </div>
  );
}

function columnTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("live")) return "emerald" as const;
  if (normalized.includes("approved")) return "sky" as const;
  if (normalized.includes("review")) return "amber" as const;
  return "zinc" as const;
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
