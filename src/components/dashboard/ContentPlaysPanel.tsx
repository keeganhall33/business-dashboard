import type { SocialContentSnapshot, PromotionPlanner } from "@/lib/types/dashboard";
import type { ContentIdea } from "@/lib/dashboard/content-ideas";
import type { RangeMeta } from "./types";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type Props = {
  socialSnapshot?: SocialContentSnapshot | null;
  ideas: ContentIdea[];
  promotionPlanner?: PromotionPlanner | null;
  range: RangeMeta;
  generatedAt?: string | null;
};

type WinningPost = {
  hook: string;
  subject?: string;
  format?: string;
  stats: string;
  nextPlay: string;
};

export function ContentPlaysPanel({ socialSnapshot, ideas, promotionPlanner, range, generatedAt }: Props) {
  if (!socialSnapshot && !ideas.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Content plays</p>
        <p className="mt-2">No social snapshot or content prompts yet. Refresh Marketing Command + Social ingest.</p>
      </section>
    );
  }

  const winningPost = buildWinningPost(socialSnapshot);
  const productTieIn = buildProductTieIn(promotionPlanner);
  const topIdeas = ideas.slice(0, 3);
  const statusCopy = buildStatusCopy({ socialSnapshot, ideas });

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="content-plays-panel">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Content plays</p>
          <p className="text-sm text-zinc-400">Winning post, next play, product tie-in, and top briefs — all short-window social signals.</p>
          <SourceRangeLabel
            source="Instagram insights + Promotion Planner"
            range="Latest 14d snapshot"
            confidence="directional only"
            note="Ignores dashboard range until social archive is backfilled"
          />
        </div>
        <div className="text-right text-xs text-zinc-500">
          <p>Range: {range.label}</p>
          {generatedAt ? <p>Updated {new Date(generatedAt).toLocaleString()}</p> : null}
          {statusCopy ? <p className="text-amber-200">{statusCopy}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {winningPost ? <SummaryCard title="Winning post" body={winningPost.hook} footer={winningPost.stats} /> : null}
        {winningPost ? <SummaryCard title="Next play" body={winningPost.nextPlay} footer={winningPost.subject ? `Subject: ${winningPost.subject}` : undefined} /> : null}
        {productTieIn ? <SummaryCard title="Product tie-in" body={productTieIn.body} footer={productTieIn.footer} /> : null}
      </div>

      {topIdeas.length ? (
        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Top content opportunities</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            {topIdeas.map((idea) => (
              <li key={idea.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">{idea.title}</span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{idea.urgency} priority</span>
                </div>
                <p className="text-zinc-400">{idea.pitch}</p>
                <p className="text-xs text-zinc-500">Why now: {idea.whyNow}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ideas.length ? (
        <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.01]">
          <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.3em] text-zinc-500">View full briefs</summary>
          <div className="divide-y divide-white/5">
            {ideas.map((idea) => (
              <div key={`full-${idea.id}`} className="p-4 text-sm text-zinc-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-white">{idea.title}</p>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{idea.channels.join(" · ")}</span>
                </div>
                <p className="mt-1 text-zinc-300">{idea.pitch}</p>
                <p className="mt-1 text-xs text-zinc-500">Why now: {idea.whyNow}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
                  {idea.formatHints.map((hint) => (
                    <span key={`${idea.id}-${hint}`} className="rounded-full border border-white/10 px-2 py-1">
                      {hint}
                    </span>
                  ))}
                </div>
                {idea.dataLight ? <p className="mt-2 text-xs text-amber-200">Data light — validate before publishing.</p> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function SummaryCard({ title, body, footer }: { title: string; body: string; footer?: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <p className="mt-2 text-sm text-white">{body}</p>
      {footer ? <p className="mt-1 text-xs text-zinc-400">{footer}</p> : null}
    </article>
  );
}

function buildWinningPost(snapshot?: SocialContentSnapshot | null): WinningPost | null {
  const posts = snapshot?.posts ?? [];
  if (!posts.length) return null;
  const scored = [...posts].sort((a, b) => scorePost(b) - scorePost(a));
  const top = scored[0];
  if (!top) return null;
  const hook = top.hook || inferHook(top.caption ?? "");
  const subject = top.subject || inferSubject(top.caption ?? "");
  const stats = `Format: ${top.format ?? "Post"} · Interactions ${numberFormatter.format(scorePost(top))}`;
  const nextPlay = top.format?.toLowerCase().includes("reel")
    ? "Spin this reel into a paid short + email hero."
    : "Reuse the hook in email + collector stories before momentum cools.";
  return { hook, subject, format: top.format, stats, nextPlay };
}

function buildProductTieIn(promotionPlanner?: PromotionPlanner | null) {
  const rec = promotionPlanner?.recommendations?.find((entry) => entry.category === "PROMOTE_NOW") ?? promotionPlanner?.recommendations?.[0];
  if (!rec) return null;
  return {
    body: `${rec.productName}: ${rec.reason}`,
    footer: rec.supportingMetric ? `Signal: ${rec.supportingMetric}` : "Woo-backed recommendation"
  };
}

function buildStatusCopy({ socialSnapshot, ideas }: { socialSnapshot?: SocialContentSnapshot | null; ideas: ContentIdea[] }) {
  const stale = socialSnapshot?.generatedAt ? isOlderThan(socialSnapshot.generatedAt, 48) : true;
  const dataLight = (socialSnapshot?.posts?.length ?? 0) < 3 || ideas.some((idea) => idea.dataLight);
  if (stale) return "Social snapshot stale — treat as directional.";
  if (dataLight) return "Data light — validate before launching.";
  return null;
}

function scorePost(post: SocialContentSnapshot["posts"][number]) {
  return (post.metrics.likes ?? 0) + (post.metrics.comments ?? 0) + (post.metrics.shares ?? 0) + (post.metrics.saves ?? 0);
}

function inferHook(caption: string) {
  if (!caption) return "Best-performing post";
  return caption.split(/[.!?\n]/)[0]?.slice(0, 80) ?? caption.slice(0, 80);
}

function inferSubject(caption: string) {
  if (!caption) return undefined;
  return caption.split(/\s+/).slice(0, 5).join(" ");
}

function isOlderThan(value: string, hours = 24) {
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return true;
  return (Date.now() - ts) / 36e5 > hours;
}
