import { AgentUpdateFeedItem } from "@/lib/types/dashboard";

type Props = {
  items: AgentUpdateFeedItem[];
};

export function AgentUpdateFeed({ items }: Props) {
  const grouped = groupByAgent(items);

  return (
    <section id="agent-updates" className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Agent Updates</div>
      <p className="mt-1 text-sm text-zinc-400">Live feed from the agents. Most recent 12 entries grouped by agent.</p>
      {grouped.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">No updates logged yet.</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {grouped.map(([agentKey, payload]) => {
            const updates = payload.updates.slice(0, 3);
            const remaining = payload.updates.length - updates.length;
            return (
              <div key={agentKey} className="rounded-2xl border border-zinc-900 bg-zinc-950/85 p-4">
                <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">{payload.agentName}</div>
                <div className="text-sm text-zinc-400">{payload.updates.length} update{payload.updates.length === 1 ? "" : "s"}</div>

                <div className="mt-3 space-y-3">
                  {updates.map((item) => (
                    <div key={item.id} className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-sm text-zinc-100">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="uppercase tracking-[0.2em]">{formatDate(item.createdAt)}</span>
                        <span className="text-amber-400">{item.priority ?? "—"}</span>
                      </div>
                      <div className="mt-1 font-semibold text-zinc-50">{item.title}</div>
                      <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{item.updateType.replace(/_/g, " ")}</div>
                      <p className="mt-1 text-sm text-zinc-300">{item.summary}</p>
                    </div>
                  ))}
                </div>

                {remaining > 0 && (
                  <div className="pt-3 text-xs text-zinc-500">{remaining} more logged in the agent thread.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function groupByAgent(items: AgentUpdateFeedItem[]) {
  const map = new Map<string, { agentName: string; updates: AgentUpdateFeedItem[] }>();
  for (const item of items) {
    if (!map.has(item.agentKey)) {
      map.set(item.agentKey, { agentName: item.agentName, updates: [] });
    }
    map.get(item.agentKey)!.updates.push(item);
  }
  return Array.from(map.entries());
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
