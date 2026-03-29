import { ExecutiveCommand } from "@/lib/types/dashboard";

type Props = {
  data: ExecutiveCommand;
};

export function ExecutiveCommandPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Executive Command</div>

      <div className="mt-4">
        <div className="text-sm text-zinc-400">Weekly Directive</div>
        <div className="mt-2 text-lg font-medium leading-relaxed text-zinc-100">{data.weeklyDirective}</div>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <div className="text-sm text-zinc-400">Top Priorities</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.topPriorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm text-zinc-400">Biggest Bottlenecks</div>
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.biggestBottlenecks.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm text-zinc-400">CEO Recommendation</div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-100">{data.ceoRecommendation}</p>
        </div>
      </div>
    </section>
  );
}

