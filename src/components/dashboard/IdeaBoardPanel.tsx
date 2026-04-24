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

  const flattened = columns.flatMap((column) => column.ideas.map((idea) => ({ idea, column: column.title })));
  const sorted = flattened.sort((a, b) => new Date(b.idea.updatedAt).getTime() - new Date(a.idea.updatedAt).getTime());
  const spotlight = sorted[0];
  const hasFreshIdeas = sorted.some((entry) => isFresh(entry.idea.updatedAt));

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Idea board</div>
          <p className="mt-1 text-sm text-zinc-400">Live pipeline of experiments and launches.</p>
        </div>
        {hasFreshIdeas && <FreshBadge />}
      </div>

      {spotlight && <IdeaSpotlight entry={spotlight} />}

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
                column.ideas.map((idea) => <IdeaCardView key={idea.id} idea={idea} columnTitle={column.title} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IdeaSpotlight({ entry }: { entry: { idea: IdeaCard; column: string } }) {
  const { idea, column } = entry;
  const fresh = isFresh(idea.updatedAt);
  const impact = idea.expectedImpact != null ? `${Number(idea.expectedImpact).toFixed(1)}` : "—";

  return (
    <div className="mt-6 rounded-3xl border border-sky-900/60 bg-sky-950/20 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-sky-200">Spotlight · {column}</div>
          <h3 className="mt-2 text-2xl font-semibold text-sky-50">{idea.title}</h3>
        </div>
        {fresh && <FreshBadge tone="sky" />}
      </div>
      {idea.summary && <p className="mt-3 text-sm text-sky-100">{idea.summary}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SpotlightStat label="Owner" value={idea.agentName} />
        <SpotlightStat label="Expected impact" value={impact} />
        <SpotlightStat label="Status" value={idea.approvedAt ? "Approved" : idea.requiresCeoApproval ? "Needs approval" : "In flight"} />
      </div>
    </div>
  );
}

function IdeaCardView({ idea, columnTitle }: { idea: IdeaCard; columnTitle: string }) {
  const hasApproval = Boolean(idea.requiresCeoApproval);
  const fresh = isFresh(idea.updatedAt, 36);

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
        {fresh && <FreshBadge tone="zinc" />}
      </div>

      {idea.summary ? <p className="mt-3 line-clamp-4 text-sm text-zinc-300">{idea.summary}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>{columnTitle}</span>
        {idea.linkedTaskId && <span>Task #{idea.linkedTaskId}</span>}
        {idea.approver && <span>Approver: {idea.approver}</span>}
      </div>
    </div>
  );
}

function SpotlightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sky-900/40 bg-sky-950/30 p-4">
      <div className="text-xs uppercase tracking-[0.3em] text-sky-200">{label}</div>
      <div className="mt-1 text-lg font-semibold text-sky-50">{value}</div>
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

function isFresh(iso: string | null | undefined, hours = 24) {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < hours * 36e5;
}

function FreshBadge({ tone = "emerald" }: { tone?: "emerald" | "sky" | "zinc" }) {
  const palette = {
    emerald: "bg-emerald-500/20 text-emerald-100",
    sky: "bg-sky-500/20 text-sky-100",
    zinc: "bg-zinc-500/20 text-zinc-50"
  }[tone];
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${palette}`}>New</span>
  );
}
