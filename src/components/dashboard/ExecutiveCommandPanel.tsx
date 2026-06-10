import { ExecutiveCommand } from "@/lib/types/dashboard";
import { EmptyState } from "./ui/EmptyState";

type Props = {
  data: ExecutiveCommand;
};

export function ExecutiveCommandPanel({ data }: Props) {
  const hasDirective = Boolean(data.weeklyDirective?.trim());
  const hasPriorities = data.topPriorities.length > 0;
  const hasBottlenecks = data.biggestBottlenecks.length > 0;
  const hasRecommendation = Boolean(data.ceoRecommendation?.trim());
  const hasContent = hasDirective || hasPriorities || hasBottlenecks || hasRecommendation;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Executive Command</div>

      {hasContent ? (
        <>
          <div className="mt-4">
            <div className="text-sm text-zinc-400">Weekly Directive</div>
            <div className="mt-2 text-lg font-medium leading-relaxed text-zinc-100">{data.weeklyDirective || "—"}</div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="text-sm text-zinc-400">Top Priorities</div>
              {hasPriorities ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-100">
                  {data.topPriorities.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Data unavailable" detail="No approved priorities yet." />
              )}
            </div>

            <div>
              <div className="text-sm text-zinc-400">Biggest Bottlenecks</div>
              {hasBottlenecks ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-100">
                  {data.biggestBottlenecks.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Data unavailable" detail="No bottlenecks logged yet." />
              )}
            </div>

            <div>
              <div className="text-sm text-zinc-400">CEO Recommendation</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-100">{data.ceoRecommendation || "—"}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState title="Data unavailable" detail="Executive directives will appear once Supabase returns live entries." />
        </div>
      )}
    </section>
  );
}
