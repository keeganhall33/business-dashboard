import { formatRelativeTimeFromNow } from "@/lib/date";
import type {
  ChangeInsight,
  DashboardOverviewResponse,
  MarketingCommandMetricDelta,
  MarketingCommandSnapshot,
  SocialContentSnapshot,
  WebsiteConversionSnapshot
} from "@/lib/types/dashboard";
import { RangeBadge } from "./ui/RangeBadge";
import type { RangeMeta } from "./types";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  changeInsights?: ChangeInsight[];
  website?: WebsiteConversionSnapshot | null;
  marketing?: MarketingCommandSnapshot | null;
  social?: SocialContentSnapshot | null;
  preparedActions: DashboardOverviewResponse["preparedActions"];
  ranges: {
    website: RangeMeta;
    marketing: RangeMeta;
    social: RangeMeta;
  };
};

export function WhatChangedPanel({ changeInsights, website, marketing, social, preparedActions, ranges }: Props) {
  if (changeInsights && changeInsights.length) {
    return (
      <section className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm text-zinc-200" data-testid="what-changed-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">What changed</p>
            <p className="text-sm text-zinc-400">Largest swings since the previous snapshot.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <RangeBadge label={ranges.website.label} description={ranges.website.detail ?? "Website"} />
            <RangeBadge label={ranges.marketing.label} description={ranges.marketing.detail ?? "Marketing"} />
            <RangeBadge label={ranges.social.label} description={ranges.social.detail ?? "Social"} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {changeInsights.slice(0, 6).map((insight) => (
            <article key={insight.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between text-xs uppercase tracking-[0.3em] text-zinc-500">
                <span>{insight.source}</span>
                <span className={toneClass(insight.tone)}>{insight.deltaLabel}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-white">{insight.title}</h3>
              <p className="mt-1 text-sm text-zinc-300">{insight.detail}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{insight.comparisonLabel}</p>
              {insight.badges?.length ? (
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                  {insight.badges.map((badge) => (
                    <span key={`${insight.id}-${badge}`} className="rounded-full border border-white/10 px-2 py-0.5">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    );
  }

  const woo = website?.wooCommerce;
  const ga4 = website?.ga4;
  const deltaMap = new Map<string, MarketingCommandMetricDelta>();
  marketing?.metricDeltas?.forEach((delta) => deltaMap.set(delta.metric.toLowerCase(), delta));

  const cards = [
    buildCard("Revenue", woo?.totalRevenue, deltaMap.get("revenue")),
    buildCard("Orders", woo?.orderCount, deltaMap.get("orders")),
    buildCard("Avg. order value", woo?.averageOrderValue, deltaMap.get("aov")),
    buildCard("Sessions", ga4?.sessions, deltaMap.get("sessions"))
  ].filter(Boolean) as Card[];

  const socialHighlight = buildSocialHighlight(social);
  const newActions = preparedActions.filter((action) => {
    if (!action.createdAt) return false;
    const created = new Date(action.createdAt).getTime();
    return Date.now() - created < 1000 * 60 * 60 * 24 * 7;
  });

  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm text-zinc-200" data-testid="what-changed-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">What changed since last review</p>
          <p className="text-sm text-zinc-400">Primary shifts from the latest Woo, Marketing Command, and Social snapshots.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <RangeBadge label={ranges.website.label} description={ranges.website.detail ?? "Woo data"} />
          <RangeBadge label={ranges.marketing.label} description={ranges.marketing.detail ?? "Marketing deltas"} />
          <RangeBadge label={ranges.social.label} description={ranges.social.detail ?? "Social signal"} />
          {marketing?.generatedAt ? <span>Updated {formatRelativeTimeFromNow(marketing.generatedAt)}</span> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {cards.length
          ? cards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{card.title}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{card.current}</p>
                <p className={`text-xs ${card.direction === "up" ? "text-emerald-300" : card.direction === "down" ? "text-rose-300" : "text-zinc-400"}`}>
                  {card.changeLabel}
                </p>
              </article>
            ))
          : (
              <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-400">
                Comparison data unavailable yet.
              </article>
            )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {socialHighlight ? (
          <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Social signal</p>
            <p className="mt-2 text-base font-semibold text-white">{socialHighlight.title}</p>
            <p className="text-sm text-zinc-300">{socialHighlight.detail}</p>
          </article>
        ) : null}

        <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">New prepared actions</p>
          {newActions.length ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-200">
              {newActions.slice(0, 3).map((action) => (
                <li key={action.id}>
                  <span className="font-semibold text-white">{action.title}</span>
                  <span className="text-zinc-400"> · {action.createdByAgent}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No new actions staged in the last 7 days.</p>
          )}
        </article>
      </div>
    </section>
  );
}

type Card = {
  title: string;
  current: string;
  changeLabel: string;
  direction?: "up" | "down";
};

function toneClass(tone: ChangeInsight["tone"]) {
  if (tone === "positive") return "text-emerald-300";
  if (tone === "negative") return "text-rose-300";
  return "text-zinc-400";
}

function buildCard(title: string, value?: number | null, delta?: MarketingCommandMetricDelta | undefined): Card | null {
  if (value == null && !delta) return null;
  const current = value != null ? formatMetric(value, title) : delta?.currentValue != null ? formatMetric(delta.currentValue, title) : "—";
  if (!delta || delta.absoluteChange == null) {
    return { title, current, changeLabel: "Comparison pending" };
  }
  const direction = delta.absoluteChange > 0 ? "up" : delta.absoluteChange < 0 ? "down" : undefined;
  const changeLabel = `${direction === "up" ? "▲" : direction === "down" ? "▼" : ""} ${formatMetric(
    Math.abs(delta.absoluteChange),
    title
  )} vs. prior`;
  return { title, current, changeLabel, direction };
}

function formatMetric(value: number, title: string) {
  if (/(revenue|value|spend|aov|purchase)/i.test(title)) return currencyFormatter.format(value);
  if (/(orders|sessions|users|clicks)/i.test(title)) return numberFormatter.format(value);
  return numberFormatter.format(value);
}

function buildSocialHighlight(snapshot?: SocialContentSnapshot | null) {
  const posts = snapshot?.posts ?? [];
  if (!posts.length) return null;
  const ranked = [...posts].sort((a, b) => {
    const aScore = (a.metrics.likes ?? 0) + (a.metrics.comments ?? 0) + (a.metrics.shares ?? 0) + (a.metrics.saves ?? 0);
    const bScore = (b.metrics.likes ?? 0) + (b.metrics.comments ?? 0) + (b.metrics.shares ?? 0) + (b.metrics.saves ?? 0);
    return bScore - aScore;
  });
  const top = ranked[0];
  const hook = top.hook || inferHook(top.caption);
  return {
    title: hook ? `Extend momentum on "${hook}"` : `Repurpose top ${top.format}`,
    detail: `Last post reached ${numberFormatter.format(top.metrics.reach ?? 0)} people with ${numberFormatter.format(
      top.metrics.engagementRate ? top.metrics.engagementRate * 100 : 0
    )}% engagement. Repurpose into an email or short-form ad before interest cools.`
  };
}

function inferHook(caption: string) {
  if (!caption) return "";
  return caption.split(/[.!?\n]/)[0]?.slice(0, 60);
}
