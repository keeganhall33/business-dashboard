"use client";

import { useMemo, useState } from "react";
import type {
  AgentUpdateFeedItem,
  MarketingCommandSnapshot,
  OpportunityRadar,
  PreparedAction,
  PartnershipOpportunity,
  PartnershipOpportunitySnapshot,
  SocialContentSnapshot,
  WebsiteConversionSnapshot,
  PromotionPlanner,
  CollectorRadar
} from "@/lib/types/dashboard";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { StatusChip } from "./ui/StatusChip";
import type { DataFreshnessSource } from "./DataFreshnessPanel";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";
import { formatEstimatedImpact, formatRiskIfIgnored, isActionStale, isTestAction } from "@/lib/dashboard/prepared-action-utils";
import { formatRelativeTimeFromNow } from "@/lib/date";

type Props = {
  preparedActions: PreparedAction[];
  agentUpdates: AgentUpdateFeedItem[];
  marketingSnapshot?: MarketingCommandSnapshot | null;
  websiteSnapshot?: WebsiteConversionSnapshot | null;
  opportunityRadar?: OpportunityRadar | null;
  socialSnapshot?: SocialContentSnapshot | null;
  partnershipSnapshot?: PartnershipOpportunitySnapshot | null;
  dataFreshness?: Record<string, DataFreshnessSource>;
};

type AgentMetadata = {
  key: "avery" | "sloan" | "lyra" | "noah";
  name: string;
  title: string;
  domain: string;
  status: "live" | "partial" | "blocked";
  dataSources: string[];
  missingData?: string[];
  safeActions?: Array<{
    label: string;
    kind: "button" | "note";
    onClick?: () => void;
    pending?: boolean;
  }>;
  summary: string;
  recommendation?: Recommendation | null;
};

type Recommendation = {
  summary: string;
  evidence: string[];
  whyNow: string;
  nextAction: string;
  confidence: "high" | "medium" | "low";
  dataGaps?: string[];
  blocked?: boolean;
  audience?: string;
  businessGoal?: string;
  preparedActionHint?: string;
  expectedUpside?: string;
  riskIfIgnored?: string;
  dataWarning?: string;
};

export function AgentConsolePanel({
  preparedActions,
  agentUpdates,
  marketingSnapshot,
  websiteSnapshot,
  opportunityRadar,
  socialSnapshot,
  partnershipSnapshot,
  dataFreshness
}: Props) {
  const [sloanPending, setSloanPending] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<AgentMetadata["key"] | null>(null);

  const lastUpdateByAgent = useMemo(() => {
    const map = new Map<string, AgentUpdateFeedItem>();
    for (const update of agentUpdates) {
      if (!map.has(update.agentKey)) {
        map.set(update.agentKey, update);
      }
    }
    return map;
  }, [agentUpdates]);

  const lastPreparedActionByAgent = useMemo(() => {
    const map = new Map<string, PreparedAction | null>();
    const sorted = [...preparedActions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    for (const action of sorted) {
      if (action.createdByAgent && !map.has(action.createdByAgent)) {
        map.set(action.createdByAgent, action);
      }
    }
    return map;
  }, [preparedActions]);

  async function runSloanAnalysis() {
    setSloanPending(true);
    try {
      const res = await fetch("/api/agents/sloan/generate-actions", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      const body = (await res.json()) as {
        actions_created: number;
        actions_skipped_duplicate: number;
      };
      publishDashboardToast({
        tone: "success",
        title: "Sloan analysis complete",
        description: `${body.actions_created} new action${body.actions_created === 1 ? "" : "s"}, ${body.actions_skipped_duplicate} skipped.`
      });
      requestDashboardRefresh({ reason: "sloan-analysis" });
    } catch (error) {
      publishDashboardToast({
        tone: "error",
        title: "Sloan analysis failed",
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSloanPending(false);
    }
  }

  const promotionPlanner = marketingSnapshot?.promotionPlanner ?? null;
  const collectorRadar = marketingSnapshot?.collectorRadar ?? null;

  const sloanRecommendation = buildSloanRecommendation(preparedActions, promotionPlanner);
  const averyRecommendation = buildAveryRecommendation(preparedActions);
  const noahRecommendation = buildNoahRecommendation(opportunityRadar, partnershipSnapshot, collectorRadar);
  const lyraRecommendation = buildLyraRecommendation(socialSnapshot);

  const agentCards: AgentMetadata[] = [
    {
      key: "avery",
      name: "Avery",
      title: "Executive Operator",
      domain: "Directives & prioritization",
      status: "live",
      dataSources: ["Scoreboard metrics", "Commerce telemetry", "Agent updates"],
      summary: averyRecommendation?.summary ??
        lastUpdateByAgent.get("avery")?.summary ??
        "No recent directive logged. Use executive refresh to publish the next summary.",
      safeActions: [
        {
          label: "Observes metrics + publishes directives",
          kind: "note"
        }
      ],
      recommendation: averyRecommendation
    },
    {
      key: "sloan",
      name: "Sloan",
      title: "Head of Product & Ecommerce",
      domain: "Revenue growth & funnel health",
      status: "live",
      dataSources: ["WooCommerce revenue", "GA4 funnel", "Marketing command"],
      summary:
        sloanRecommendation?.summary ??
        lastPreparedActionByAgent.get("sloan")?.title ?? "No prepared actions yet — run analysis to stage work.",
      safeActions: [
        {
          label: sloanPending ? "Running…" : "Run Sloan analysis",
          kind: "button",
          onClick: runSloanAnalysis,
          pending: sloanPending
        }
      ],
      recommendation: sloanRecommendation
    },
    {
      key: "lyra",
      name: "Lyra",
      title: "Head of Brand & Narrative",
      domain: "Brand authority & storytelling",
      status: "blocked",
      dataSources: ["Engagement rate (missing)", "Cultural relevance (missing)", "Narrative telemetry"],
      missingData: ["ingest engagement_rate", "ingest cultural_relevance_score"],
      summary: lyraRecommendation?.summary ?? "Blocked until engagement + cultural metrics are live.",
      safeActions: [
        {
          label: "Awaiting data ingest before activation",
          kind: "note"
        }
      ],
      recommendation: lyraRecommendation
    },
    {
      key: "noah",
      name: "Noah",
      title: "Head of Partnerships",
      domain: "Prestige deals & research",
      status: partnershipSnapshot?.items?.some((item) => item.status !== "sample") ? "live" : "partial",
      dataSources: ["Internal partnership feed", "Research memory", "Industry pulse"],
      summary:
        noahRecommendation?.summary ??
        lastUpdateByAgent.get("noah")?.summary ?? "Internal feed populated; External Radar awaiting curated sources.",
      safeActions: [
        {
          label: "Read-only pipeline insights",
          kind: "note"
        },
        {
          label: "External radar feed pending",
          kind: "note"
        }
      ],
      recommendation: noahRecommendation
    }
  ];

  const marketingFresh = Boolean(marketingSnapshot?.generatedAt);
  const websiteFresh = Boolean(websiteSnapshot?.generatedAt);

  const agentSourceMap: Record<AgentMetadata["key"], string[]> = {
    avery: ["website", "marketing", "meta", "preparedActions"],
    sloan: ["website"],
    lyra: ["social"],
    noah: ["partnership"]
  };

  function getDataChip(agentKey: AgentMetadata["key"]) {
    const ids = agentSourceMap[agentKey] ?? [];
    const sources = ids
      .map((id) => dataFreshness?.[id])
      .filter((source): source is DataFreshnessSource => Boolean(source));

    if (!sources.length) {
      return { label: "Manual data", tone: "zinc" as const, warning: "Manual data only" };
    }

    const severity = { rose: 3, amber: 2, zinc: 1, emerald: 0 } as const;
    const worst = sources.reduce((prev, current) => (severity[current.tone] > severity[prev.tone] ? current : prev));
    const labelMap: Record<DataFreshnessSource["tone"], string> = {
      emerald: "Fresh data",
      amber: "Stale data",
      rose: "Data missing",
      zinc: "Manual data"
    };
    const warning = worst.tone === "emerald" ? undefined : `${labelMap[worst.tone]} (${worst.relativeLabel})`;
    return { label: labelMap[worst.tone], tone: worst.tone, warning };
  }

  const expandedAgentData = expandedAgent ? agentCards.find((agent) => agent.key === expandedAgent) ?? null : null;

  return (
    <section className="space-y-4" data-testid="agent-console-panel">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Agent workbench</p>
          <p className="text-sm text-zinc-400">Concise view of live agent assignments — independent of the dashboard date range.</p>
          <SourceRangeLabel source="Agent task queue" range="Range not applicable" confidence="manual oversight" note="Always read latest update before approving" />
        </div>
        <p className="text-xs text-zinc-500">Marketing data {marketingFresh ? "fresh" : "stale"} · Website data {websiteFresh ? "fresh" : "stale"}</p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.01]">
        <table className="min-w-full divide-y divide-white/10 text-sm text-zinc-200">
          <thead>
            <tr className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              <th className="px-3 py-2 text-left">Agent</th>
              <th className="px-3 py-2 text-left">Focus</th>
              <th className="px-3 py-2 text-left">Next step</th>
              <th className="px-3 py-2 text-left">Confidence</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {agentCards.map((agent) => {
              const recommendation = agent.recommendation;
              const bestMove = recommendation?.summary ?? agent.summary;
              const manualStep = recommendation?.nextAction ?? agent.safeActions?.[0]?.label ?? "Awaiting manual action";
              const confidence = recommendation?.confidence ?? "low";
              const statusChip = statusChipMap[agent.status];
              const dataChip = getDataChip(agent.key);

              return (
                <tr key={agent.key}>
                  <td className="px-3 py-3 text-white">
                    <div className="flex flex-col">
                      <span className="font-semibold leading-tight">{agent.name}</span>
                      <span className={`text-[11px] uppercase tracking-[0.3em] ${toneToText(statusChip.tone)}`}>{statusChip.label}</span>
                      <span className="text-xs text-zinc-500">{agent.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-2 text-sm text-zinc-100">{bestMove}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-2 text-sm text-zinc-300">{manualStep}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">
                    <span className={toneToText(confidenceTone(confidence))}>{confidence.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">
                    <span className={toneToText(dataChip.tone)}>
                      {dataChip.label}
                      {dataChip.warning ? ` · ${dataChip.warning}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400 hover:text-zinc-100"
                      onClick={() => setExpandedAgent(expandedAgent === agent.key ? null : agent.key)}
                    >
                      {expandedAgent === agent.key ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedAgentData ? <AgentDetailCard agent={expandedAgentData} /> : null}

      <AgentReviewQueue preparedActions={preparedActions} />
    </section>
  );
}

const agentNameMap: Record<string, string> = {
  avery: "Avery",
  sloan: "Sloan",
  lyra: "Lyra",
  noah: "Noah",
  marketing_command: "Marketing Command",
  collector: "Collector Ops",
  system: "System"
};

const statusChipMap: Record<AgentMetadata["status"], { label: string; tone: "emerald" | "amber" | "rose" | "zinc" }> = {
  live: { label: "Live", tone: "emerald" },
  partial: { label: "Paused", tone: "amber" },
  blocked: { label: "Manual only", tone: "rose" }
};

const REVIEW_GROUPS = [
  {
    key: "needsReview",
    label: "Needs review",
    description: "Agent outputs that are ready for approval now."
  },
  {
    key: "reviewNext",
    label: "Review next",
    description: "Draft work the agent just staged — skim before moving on."
  },
  {
    key: "waiting",
    label: "Waiting / Watch",
    description: "Approved items waiting on manual execution or external timing."
  },
  {
    key: "stale",
    label: "Stale / Reassess",
    description: "Recommendations that are outdated or were rejected previously."
  },
  {
    key: "recent",
    label: "Recently reviewed",
    description: "Items you already acted on."
  },
  {
    key: "internal",
    label: "Internal / Test",
    description: "System/test entries that do not require executive action."
  }
] as const;

function confidenceTone(confidence: string) {
  if (confidence === "high") return "emerald" as const;
  if (confidence === "medium") return "amber" as const;
  return "zinc" as const;
}

function toneToText(tone: "emerald" | "amber" | "rose" | "zinc") {
  if (tone === "emerald") return "text-emerald-300";
  if (tone === "amber") return "text-amber-200";
  if (tone === "rose") return "text-rose-300";
  return "text-zinc-400";
}

function InfoTile({
  label,
  value,
  tone = "zinc"
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "rose" | "zinc";
}) {
  const toneClasses: Record<"emerald" | "amber" | "rose" | "zinc", string> = {
    emerald: "text-emerald-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
    zinc: "text-zinc-100"
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-sm leading-relaxed ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

function AgentDetailCard({ agent }: { agent: AgentMetadata }) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-zinc-200">
      <p>{agent.summary}</p>

      <DetailList title="Data sources" items={agent.dataSources} empty="No sources listed." />

      {agent.missingData?.length ? <DetailList title="Missing data" items={agent.missingData} tone="rose" /> : null}

      {agent.recommendation?.whyNow ? <DetailList title="Why now" items={[agent.recommendation.whyNow]} /> : null}

      {agent.recommendation?.expectedUpside ? (
        <DetailList title="Expected upside" items={[agent.recommendation.expectedUpside]} tone="emerald" />
      ) : null}

      {agent.recommendation?.riskIfIgnored ? (
        <DetailList title="Risk if ignored" items={[agent.recommendation.riskIfIgnored]} tone="rose" />
      ) : null}

      {agent.recommendation?.dataWarning ? (
        <DetailList title="Data caveat" items={[agent.recommendation.dataWarning]} tone="amber" />
      ) : null}

      {agent.recommendation?.dataGaps?.length ? (
        <DetailList title="Data gaps" items={agent.recommendation.dataGaps} tone="amber" />
      ) : null}

      {agent.safeActions?.length ? (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Manual actions</p>
          <div className="flex flex-wrap gap-2">
            {agent.safeActions.map((action) =>
              action.kind === "button" ? (
                <button
                  key={action.label}
                  className={`rounded-xl border border-white/20 px-3 py-2 text-sm text-white transition hover:border-white/40 hover:bg-white/10 ${
                    action.pending ? "opacity-60" : ""
                  }`}
                  onClick={action.onClick}
                  disabled={action.pending}
                >
                  {action.label}
                </button>
              ) : (
                <span
                  key={action.label}
                  className="rounded-xl border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-zinc-400"
                >
                  {action.label}
                </span>
              )
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AgentReviewQueue({ preparedActions }: { preparedActions: PreparedAction[] }) {
  const queues = useMemo(() => buildReviewQueues(preparedActions), [preparedActions]);
  const hasActions = queues.some((queue) => queue.actions.length);

  if (!hasActions) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-zinc-300" data-testid="agent-review-queue">
        <header>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Agent review queue (preview)</p>
          <p className="mt-2">Agents haven’t staged reviewable work yet.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/10 p-4" data-testid="agent-review-queue">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Agent review queue (preview)</p>
        <p className="text-sm text-zinc-400">Display-only mock of the future approval workflow. Buttons are disabled intentionally.</p>
      </header>

      {queues.map((queue) =>
        queue.actions.length ? (
          <details key={queue.key} className="rounded-xl border border-white/10 bg-white/[0.02]" open={queue.key === "needsReview"}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
              <div>
                <p className="text-sm font-semibold text-white">{queue.label}</p>
                <p className="text-xs text-zinc-400">{queue.description}</p>
              </div>
              <span className="text-xs text-zinc-500">{queue.actions.length}</span>
            </summary>
            <div className="space-y-3 border-t border-white/5 p-4">
              {queue.actions.map((action) => (
                <ReviewCard key={action.id} action={action} />
              ))}
            </div>
          </details>
        ) : null
      )}
    </section>
  );
}

function ReviewCard({ action }: { action: PreparedAction }) {
  const agentLabel = agentNameMap[action.createdByAgent ?? ""] ?? "Agent output";
  const updatedLabel = action.updatedAt && action.updatedAt !== action.createdAt ? formatRelativeTimeFromNow(action.updatedAt) : null;
  const dataCaveat = action.dataLight ? "Evidence flagged as data light" : undefined;
  const statusLabel = action.status?.replace(/_/g, " ") ?? "draft";
  const confidence = action.confidence ?? "low";
  const buttons = ["Approve", "Revise", "Reject", "Combine", "Mark stale", "Not now", "Needs better data"];
  const quickTags = ["Less salesy", "More specific", "Focus on Meta", "Focus on email", "Focus on collector follow-up", "Focus on product/content"];

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-200" data-testid="agent-review-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{agentLabel}</p>
          <h3 className="text-base font-semibold text-white">{action.title}</h3>
          <p className="text-xs text-zinc-500">Status: {statusLabel}</p>
        </div>
        <div className="text-right text-xs text-zinc-400">
          <p>Confidence: {confidence.toUpperCase()}</p>
          <p>{updatedLabel ? `Last updated ${updatedLabel}` : "No prior version"}</p>
        </div>
      </header>

      <p className="text-sm text-zinc-100">{action.whyItMatters || "No summary provided."}</p>
      <p className="text-xs text-zinc-400">Next step: {action.requiredApprovalAction || "Specify the manual action"}</p>
      <p className="text-xs text-zinc-500">What changed: real diff coming soon (preview state).</p>

      <SourceRangeLabel
        source={action.sourcePanel ? action.sourcePanel.replace(/_/g, " ") : "Prepared action"}
        range="Range not attached"
        confidence="manual review required"
      />

      {dataCaveat ? <p className="text-xs text-amber-300">Data caveat: {dataCaveat}</p> : null}

      {action.evidence?.length ? (
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Evidence</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-300">
            {action.evidence.map((item, index) => (
              <li key={`${action.id}-evidence-${index}`}>{item.value || item.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Evidence: not attached.</p>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
        {buttons.map((label) => (
          <button key={`${action.id}-${label}`} className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1" disabled>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
        {quickTags.map((tag) => (
          <span key={`${action.id}-tag-${tag}`} className="cursor-not-allowed rounded-full border border-white/5 bg-white/[0.02] px-2 py-1">
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function buildReviewQueues(actions: PreparedAction[]) {
  const map: Record<(typeof REVIEW_GROUPS)[number]["key"], PreparedAction[]> = {
    needsReview: [],
    reviewNext: [],
    waiting: [],
    stale: [],
    recent: [],
    internal: []
  };

  actions.forEach((action) => {
    const internal = isTestAction(action) || action.createdByAgent === "system";
    const stale = isActionStale(action, 72) || action.status === "rejected";
    let target: keyof typeof map = "waiting";

    if (internal) target = "internal";
    else if (action.status === "ready_for_review") target = "needsReview";
    else if (action.status === "draft") target = "reviewNext";
    else if (stale) target = "stale";
    else if (action.status === "approved") target = "waiting";
    else if (action.status === "manually_executed" || action.status === "archived") target = "recent";

    map[target].push(action);
  });

  return REVIEW_GROUPS.map((group) => ({ ...group, actions: map[group.key] ?? [] }));
}

function DetailList({
  title,
  items,
  empty,
  tone = "zinc"
}: {
  title: string;
  items: string[] | undefined;
  empty?: string;
  tone?: "zinc" | "rose" | "amber" | "emerald";
}) {
  if (!items?.length) {
    return empty ? (
      <section>
        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
        <p className="text-xs text-zinc-400">{empty}</p>
      </section>
    ) : null;
  }

  const toneClass =
    tone === "rose"
      ? "text-rose-200"
      : tone === "amber"
        ? "text-amber-200"
        : tone === "emerald"
          ? "text-emerald-200"
          : "text-zinc-200";

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      <ul className={`mt-1 list-disc space-y-1 pl-4 text-sm ${toneClass}`}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

const AGENT_FEEDBACK_OPTIONS = ["Useful", "Wrong priority", "Needs more evidence", "Too generic", "Ignore today", "Ask for alternate"];

function AgentFeedbackControls({ agentName }: { agentName: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-zinc-400">
      {AGENT_FEEDBACK_OPTIONS.map((option) => (
        <button
          key={`${agentName}-${option}`}
          type="button"
          className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-200 hover:border-white/30"
          onClick={() => publishDashboardToast({ tone: "info", title: `${agentName} feedback`, description: `${option} (UI-only)` })}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function buildAveryRecommendation(preparedActions: PreparedAction[]): Recommendation | null {
  const candidates = preparedActions
    .filter((action) => action.status === "ready_for_review")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const fallback = preparedActions
    .slice()
    .sort((a, b) => {
      const riskScore = (value: PreparedAction["riskLevel"]) => (value === "high" ? 2 : value === "medium" ? 1 : 0);
      return riskScore(b.riskLevel) - riskScore(a.riskLevel);
    });
  const target = candidates[0] ?? fallback[0] ?? null;
  if (!target) return null;
  const stale = isActionStale(target, 72);
  const dataWarning = stale ? "Source snapshot stale" : target.dataLight ? "Needs deeper evidence" : undefined;
  const confidence = stale && target.confidence === "high" ? "medium" : target.confidence;
  return {
    summary: `Review: ${target.title}`,
    evidence: formatEvidence(target),
    whyNow: target.whyItMatters,
    nextAction: target.requiredApprovalAction,
    confidence,
    dataGaps: target.dataLight ? ["Needs deeper evidence before execution"] : undefined,
    expectedUpside: formatEstimatedImpact(target),
    riskIfIgnored: formatRiskIfIgnored(target),
    dataWarning
  };
}

function buildSloanRecommendation(preparedActions: PreparedAction[], promotionPlanner?: PromotionPlanner | null): Recommendation | null {
  const plannerRec = promotionPlanner?.recommendations?.find((rec) => rec.category === "PROMOTE_NOW") ?? promotionPlanner?.recommendations?.[0];
  if (plannerRec) {
    const lastSold = plannerRec.lastSoldDate ? formatRelativeTimeFromNow(plannerRec.lastSoldDate) : null;
    return {
      summary: `Feature ${plannerRec.productName}`,
      evidence: [plannerRec.supportingMetric ?? "", lastSold ? `Last sold ${lastSold}` : ""].filter(Boolean) as string[],
      whyNow: plannerRec.reason,
      nextAction: plannerRec.suggestedAction,
      confidence: plannerRec.confidence,
      dataWarning: plannerRec.directional === false ? "Traffic insight locked until GA4 item IDs exist" : undefined,
      expectedUpside: plannerRec.revenue7d ? `${formatCurrency(plannerRec.revenue7d)} current window` : undefined
    };
  }
  const sloanActions = preparedActions
    .filter((action) => action.createdByAgent === "sloan")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const target = sloanActions[0] ?? null;
  if (!target) {
    return {
      summary: "Awaiting Sloan prepared action",
      evidence: [],
      whyNow: "Run Sloan analysis to stage the next product/funnel fix.",
      nextAction: "Click 'Run Sloan analysis'",
      confidence: "low",
      dataGaps: ["Need fresh Woo + GA4 snapshot"],
      blocked: true,
      expectedUpside: "Pending new funnel snapshot",
      riskIfIgnored: "Revenue leaks stay unaddressed",
      dataWarning: "No recent Sloan run"
    };
  }
  const stale = isActionStale(target, 48);
  const dataWarning = stale ? "Woo/GA4 snapshot stale" : target.dataLight ? "Evidence flagged as data-light" : undefined;
  const confidence = stale && target.confidence === "high" ? "medium" : target.confidence;
  return {
    summary: target.title,
    evidence: formatEvidence(target),
    whyNow: target.whyItMatters,
    nextAction: target.requiredApprovalAction,
    confidence,
    dataGaps: target.dataLight ? ["Evidence flagged as data-light"] : undefined,
    expectedUpside: formatEstimatedImpact(target),
    riskIfIgnored: formatRiskIfIgnored(target),
    dataWarning
  };
}

function buildNoahRecommendation(
  opportunityRadar?: OpportunityRadar | null,
  partnershipSnapshot?: PartnershipOpportunitySnapshot | null,
  collectorRadar?: CollectorRadar | null
): Recommendation | null {
  const top = opportunityRadar?.topOpportunities?.[0];
  const partnershipItems = (partnershipSnapshot?.items ?? []).filter((item) => (item.status ?? "live") === "live");

  const collectorLead = collectorRadar?.segments?.[0];
  if (collectorLead) {
    return {
      summary: `Follow up with ${collectorLead.displayName}`,
      evidence: [
        `${collectorLead.orderCount} orders · ${formatCurrency(collectorLead.totalSpend)}`,
        collectorLead.products?.length ? `Prefers: ${collectorLead.products.slice(0, 2).join(", ")}` : ""
      ].filter(Boolean) as string[],
      whyNow: collectorLead.reason,
      nextAction: collectorLead.suggestedAction,
      confidence: collectorLead.confidence,
      audience: "Collector outreach",
      businessGoal: "Repeat revenue",
      dataWarning: collectorLead.maskedEmail ? "Contact: Customer record on file" : undefined
    };
  }

  if (!top && !partnershipItems.length) {
    return {
      summary: "Partnership scout blocked",
      evidence: [],
      whyNow: "Opportunity pipeline is thin.",
      nextAction: "Feed partnership/news snapshots via dashboard/data/opportunities/latest.json",
      confidence: "low",
      dataGaps: ["Need live partnership/news ingestion"],
      blocked: true
    };
  }
  if (!top && partnershipItems.length) {
    const best = selectBestOpportunity(partnershipItems);
    return buildPartnershipRecommendation(best);
  }
  if (!top) return null;
  const valueEstimate = "valueEstimate" in (top ?? {}) ? (top as { valueEstimate?: number | null }).valueEstimate ?? undefined : undefined;
  return {
    summary: `Advance ${top.name}`,
    evidence: [
      top.organization ? `Org: ${top.organization}` : "",
      valueEstimate ? `Value ≈ $${valueEstimate.toLocaleString()}` : "",
      top.status ? `Status: ${top.status}` : ""
    ].filter((item): item is string => Boolean(item)),
    whyNow: top.nextStep ? `Next step overdue: ${top.nextStep}` : "High-prestige opportunity ready for motion",
    nextAction: top.nextStep ?? "Define next outreach prep",
    confidence: "medium",
    expectedUpside: valueEstimate ? `Potential ${formatCurrency(valueEstimate)}` : "Elevates prestige and collector demand",
    riskIfIgnored: "Another artist may secure the collaboration first"
  };
}

function selectBestOpportunity(items: PartnershipOpportunity[]) {
  const urgencyScore = (value?: PartnershipOpportunity["urgency"]) =>
    value === "high" ? 2 : value === "medium" ? 1 : 0;
  const confidenceScore = (value: PartnershipOpportunity["confidence"]) =>
    value === "high" ? 2 : value === "medium" ? 1 : 0;
  return [...items].sort((a, b) => {
    const scoreA = urgencyScore(a.urgency) * 10 + confidenceScore(a.confidence);
    const scoreB = urgencyScore(b.urgency) * 10 + confidenceScore(b.confidence);
    if (scoreA === scoreB) {
      return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
    }
    return scoreB - scoreA;
  })[0];
}

function buildPartnershipRecommendation(item: PartnershipOpportunity): Recommendation {
  const evidence = [
    item.whyNow,
    item.whyItMatters,
    item.sourceUrl ? `Source: ${item.sourceUrl}` : item.sourceName ? `Source: ${item.sourceName}` : ""
  ].filter(Boolean) as string[];
  const stale = isOlderThan(item.observedAt, 24 * 14);
  const potentialValue = "valueEstimate" in item ? (item as { valueEstimate?: number | null }).valueEstimate ?? undefined : undefined;
  return {
    summary: item.headline,
    evidence,
    whyNow: item.whyNow,
    nextAction: item.nextManualAction,
    confidence: item.confidence,
    audience: "Partnership / bizdev",
    businessGoal: "Prestige collaboration pipeline",
    preparedActionHint: item.shouldBecomePreparedAction ? "Consider staging a Prepared Action draft for this opportunity." : undefined,
    dataGaps: item.recommendedArtworkOrConcept ? undefined : ["Add recommended artwork/concept"],
    blocked: false,
    expectedUpside: potentialValue ? `Potential ${formatCurrency(potentialValue)}` : "Strengthens cultural positioning",
    riskIfIgnored: item.urgency === "high" ? "Window may close quickly" : "Could slip behind other artists",
    dataWarning: stale ? "Lead observed over 2 weeks ago" : undefined
  };
}

function buildLyraRecommendation(socialSnapshot?: SocialContentSnapshot | null): Recommendation | null {
  if (!socialSnapshot) {
    return {
      summary: "Blocked until Instagram analytics connector runs",
      evidence: [],
      whyNow: "Lyra needs real post performance data from Meta Graph.",
      nextAction: "Set META_* env vars in 1Password and run pnpm social:run",
      confidence: "low",
      dataGaps: [
        "Set META_APP_ID, META_APP_SECRET, META_PAGE_ACCESS_TOKEN, META_IG_BUSINESS_ID",
        "Run pnpm social:run to capture fresh posts"
      ],
      blocked: true,
      expectedUpside: "Cannot recommend content without data",
      riskIfIgnored: "Brand momentum stalls",
      dataWarning: "No Instagram snapshot"
    };
  }
  const posts = socialSnapshot.posts ?? [];
  if (!posts.length) {
    return {
      summary: "No social posts returned",
      evidence: [],
      whyNow: "Snapshot exists but contains zero posts for the selected range.",
      nextAction: "Re-run pnpm social:run after new posts publish",
      confidence: "low",
      dataGaps: ["Need at least one Instagram post in the snapshot"],
      blocked: true,
      expectedUpside: "Need live posts before suggesting content",
      riskIfIgnored: "Audience momentum unknown",
      dataWarning: "Instagram snapshot empty"
    };
  }
  const scored = posts
    .map((post) => ({
      post,
      engagement:
        (post.metrics.likes ?? 0) +
        (post.metrics.comments ?? 0) +
        (post.metrics.shares ?? 0) +
        (post.metrics.saves ?? 0)
    }))
    .sort((a, b) => b.engagement - a.engagement);

  const { post: top, engagement: topEngagement } = scored[0];
  const totalReach = top.metrics.reach ?? top.metrics.impressions ?? top.metrics.views ?? 0;
  const hook = top.hook || top.caption.split(/\.|!|\n/)[0] || top.caption;
  const whyNow = `Latest ${top.format} reached ${formatNumber(totalReach)} users on ${formatDateLabel(top.publishedAt)}.`;
  const nextAction = `Draft a ${top.format} brief reusing the hook "${hook}" and stage it as a Prepared Action for approval.`;
  const evidence: string[] = [
    `Hook: ${hook || "(missing)"}`,
    `Metrics: ${formatNumber(top.metrics.likes)} likes · ${formatNumber(top.metrics.comments)} comments · ${formatNumber(
      top.metrics.shares
    )} shares · ${formatNumber(top.metrics.saves)} saves`,
    top.permalink ? `Permalink: ${top.permalink}` : ""
  ].filter(Boolean) as string[];
  const confidence = (top.metrics.engagementRate ?? 0) >= 0.05 ? "high" : (top.metrics.engagementRate ?? 0) >= 0.02 ? "medium" : "low";
  const snapshotStale = isOlderThan(socialSnapshot.generatedAt, 48);
  return {
    summary: `Create follow-up content on ${top.subject ?? "the latest hero"}`,
    evidence,
    whyNow,
    nextAction,
    confidence: snapshotStale && confidence === "high" ? "medium" : confidence,
    audience: "Instagram followers / collectors",
    businessGoal: top.subject ? "Sales + momentum" : "Awareness + engagement",
    preparedActionHint: "If approved, add this concept to Prepared Actions via manual Lyra workflow.",
    expectedUpside: `Reinforce ${top.subject ?? "the latest hero"} momentum with ${formatNumber(topEngagement)} interactions worth of proof`,
    riskIfIgnored: "Conversation may cool off on social",
    dataWarning: snapshotStale ? "Instagram snapshot >48h old" : undefined
  };
}

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "$0";
  return currencyFormatter.format(value);
}

function isOlderThan(timestamp?: string | null, hours = 24) {
  if (!timestamp) return true;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return true;
  return (Date.now() - ts) / 36e5 > hours;
}

function formatEvidence(action: PreparedAction) {
  const pieces = action.evidence?.length
    ? action.evidence.map((item) => `${item.label}${item.value ? ` — ${item.value}` : ""}`)
    : [];
  if (action.preparedAsset?.length) {
    pieces.push(`Draft asset: ${action.preparedAsset[0].label}`);
  }
  return pieces;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "0";
  return value.toLocaleString("en-US");
}

function formatDateLabel(value: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}
