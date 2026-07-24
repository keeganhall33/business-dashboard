import type { CommerceTelemetry, PreparedAction, SocialContentSnapshot } from "@/lib/types/dashboard";
import { formatRelativeTimeFromNow } from "@/lib/date";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function SignalChartsPanel({
  telemetry,
  actions,
  social
}: {
  telemetry?: CommerceTelemetry | null;
  actions: PreparedAction[];
  social: SocialContentSnapshot | null;
}) {
  const revenueSeries = telemetry?.woo?.timeseries?.map((point) => point.revenue ?? 0) ?? [];
  const ordersSeries = telemetry?.woo?.timeseries?.map((point) => point.orders ?? 0) ?? [];
  const statusBreakdown = buildStatusBreakdown(actions);
  const topSocial = social?.posts?.slice(0, 3) ?? [];
  const hasAnyData = revenueSeries.length || ordersSeries.length || statusBreakdown.total > 0 || topSocial.length;
  if (!hasAnyData) return null;

  const trendCards: TrendTileProps[] = [
    {
      label: "Revenue trend",
      value: telemetry?.woo?.summary?.revenue != null ? currency.format(telemetry.woo.summary.revenue) : "Unavailable",
      series: revenueSeries,
      tone: "emerald"
    },
    {
      label: "Orders trend",
      value: telemetry?.woo?.summary?.orders != null ? integer.format(telemetry.woo.summary.orders) : "Unavailable",
      series: ordersSeries,
      tone: "sky"
    }
  ];

  const windowLabel = telemetry?.range ? `${telemetry.range.startDate} → ${telemetry.range.endDate}` : "Latest snapshot";

  return (
    <section className="rounded-3xl border border-white/10 bg-black/15 p-5 space-y-5" data-testid="signal-charts-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Signal charts</p>
          <p className="text-sm text-zinc-400">Visual view of the selected commerce window.</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Window {windowLabel}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {trendCards.map((card) => (
          <TrendTile key={card.label} label={card.label} value={card.value} series={card.series} tone={card.tone} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PreparedActionBreakdown breakdown={statusBreakdown} />
        {topSocial.length ? <SocialPulseCard posts={topSocial} generatedAt={social?.generatedAt ?? null} /> : <MissingCard label="Social performance" reason="No ranked posts" />}
      </div>
    </section>
  );
}

type TrendTileProps = {
  label: string;
  value: string;
  series?: number[];
  tone: "emerald" | "sky" | "zinc";
};

function TrendTile({ label, value, series, tone }: TrendTileProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-2">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
        <p className="text-2xl font-semibold text-white">{value}</p>
      </div>
      {series && series.length >= 2 ? <Sparkline values={series} tone={tone} /> : <EmptySparkline />}
    </section>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "emerald" | "sky" | "zinc" }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1e-9, max - min);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke = tone === "emerald" ? "#34d399" : tone === "sky" ? "#38bdf8" : "#a1a1aa";
  return (
    <svg viewBox="0 0 100 40" className="h-12 w-full">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function EmptySparkline() {
  return <div className="h-12 w-full rounded-xl border border-dashed border-white/10 bg-black/20" />;
}

function PreparedActionBreakdown({ breakdown }: { breakdown: ReturnType<typeof buildStatusBreakdown> }) {
  if (!breakdown.total) {
    return <MissingCard label="Prepared actions" reason="No actions queued" />;
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Prepared action lifecycle</p>
        <p className="text-xs text-zinc-400">{breakdown.total} total</p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full border border-white/10">
        {breakdown.items.map((item) => (
          <div
            key={item.label}
            className={`h-full ${toneToBg(item.tone)}`}
            style={{ width: `${(item.count / breakdown.total) * 100}%` }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>
      <div className="grid gap-2 text-xs text-zinc-400">
        {breakdown.items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span>{item.label}</span>
            <span className="text-zinc-100">{item.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SocialPulseCard({ posts, generatedAt }: { posts: SocialContentSnapshot["posts"]; generatedAt: string | null }) {
  const maxReach = Math.max(...posts.map((post) => post.metrics.reach ?? 0), 1);
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Social pulse</p>
        <p className="text-xs text-zinc-400">{generatedAt ? `Instagram · ${formatRelativeTimeFromNow(generatedAt)}` : "Instagram"}</p>
      </div>
      {posts.map((post, index) => (
        <div key={post.postId} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl font-semibold text-zinc-500">#{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{post.hook || post.caption.slice(0, 80)}</p>
              <p className="text-xs text-zinc-400">{post.platform ?? "Instagram"}</p>
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs text-zinc-400">
            <MetricRow label="Reach" value={formatInteger(post.metrics.reach)} percent={(post.metrics.reach ?? 0) / maxReach} />
            <MetricRow label="Likes" value={formatInteger(post.metrics.likes)} percent={(post.metrics.likes ?? 0) / Math.max(post.metrics.reach ?? 1, 1)} tone="amber" />
            <MetricRow label="Comments" value={formatInteger(post.metrics.comments)} percent={(post.metrics.comments ?? 0) / Math.max(post.metrics.likes ?? 1, 1)} tone="rose" />
          </div>
        </div>
      ))}
    </section>
  );
}

function MissingCard({ label, reason }: { label: string; reason?: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm text-zinc-400">{reason ?? "Data unavailable or stale."}</p>
    </section>
  );
}

function MetricRow({ label, value, percent, tone = "emerald" }: { label: string; value: string; percent: number; tone?: "emerald" | "amber" | "rose" }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-400/70",
    amber: "bg-amber-400/70",
    rose: "bg-rose-400/70"
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="text-zinc-100">{value}</span>
      </div>
      <div className="relative h-2 rounded-full bg-white/5">
        <div className={`absolute inset-y-0 left-0 rounded-full ${colors[tone] ?? colors.emerald}`} style={{ width: `${Math.min(percent * 100, 100)}%` }} />
      </div>
    </div>
  );
}

function toneToBg(tone: "emerald" | "amber" | "rose" | "sky" | "zinc") {
  switch (tone) {
    case "emerald":
      return "bg-emerald-400/60";
    case "amber":
      return "bg-amber-400/60";
    case "rose":
      return "bg-rose-400/60";
    case "sky":
      return "bg-sky-400/60";
    default:
      return "bg-zinc-400/60";
  }
}

function buildStatusBreakdown(actions: PreparedAction[]) {
  const items = [
    { label: "Pending review", tone: "zinc" as const, count: actions.filter((action) => action.status === "draft").length },
    { label: "Ready", tone: "amber" as const, count: actions.filter((action) => action.status === "ready_for_review").length },
    { label: "In progress", tone: "sky" as const, count: actions.filter((action) => action.status === "approved").length },
    { label: "Completed", tone: "emerald" as const, count: actions.filter((action) => action.status === "manually_executed").length },
    { label: "Dismissed", tone: "rose" as const, count: actions.filter((action) => action.status === "rejected" || action.status === "archived").length }
  ];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return { items, total };
}

function formatInteger(value?: number | null) {
  if (value == null) return "–";
  return integer.format(value);
}
