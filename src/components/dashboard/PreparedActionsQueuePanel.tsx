"use client";

import { useCallback, useMemo, useState } from "react";
import type { PrioritizedAction } from "@/lib/dashboard/prepared-action-priority";
import type { PreparedAction } from "@/lib/types/dashboard";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { defaultAssetTypeForAction } from "@/lib/prepared-actions/asset-types";
import { StatusChip } from "./ui/StatusChip";
import { actionSnapshotStalenessHours, formatEstimatedImpact, formatRiskIfIgnored, isActionStale, isTestAction } from "@/lib/dashboard/prepared-action-utils";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const STALE_THRESHOLD_HOURS = 72;
const MAX_TOP_PACKETS = 3;

const AGENT_LABELS: Record<string, string> = {
  avery: "Avery",
  sloan: "Sloan",
  lyra: "Lyra",
  noah: "Noah",
  meta_ads: "Meta Ads",
  marketing_command: "Marketing Command",
  system: "System",
  automation: "Automation",
  keegan: "Keegan",
  jeeves: "Jeeves"
};

const DISPLAY_GROUP_ORDER = ["do_now", "review_next", "waiting", "stale", "internal", "archived"] as const;
type DisplayGroup = (typeof DISPLAY_GROUP_ORDER)[number];

type PacketDataState = "fresh" | "stale" | "data_light";

type ActionPacket = {
  key: string;
  title: string;
  summary: string;
  owners: string[];
  nextStep: string;
  actions: PrioritizedAction[];
  packetScore: number;
  statusGroup: DisplayGroup;
  dataState: PacketDataState;
  confidence: "high" | "medium" | "low";
  stale: boolean;
};

type PacketRule = {
  key: string;
  title: string;
  summary: string;
  matcher: (action: PrioritizedAction) => boolean;
};

const PACKET_RULES: PacketRule[] = [
  {
    key: "ronald-acuna-topps",
    title: "Ronald Acuña Jr / Topps campaign",
    summary: "Single SKU is carrying Woo revenue — rotate the hero and capture the story before momentum cools.",
    matcher: (action) => matches(action, ["acuna", "acuña", "topps"])
  },
  {
    key: "checkout-friction",
    title: "Checkout friction + conversion trust",
    summary: "Cart → checkout drop and GA4 gaps block revenue until trust + instrumentation are fixed.",
    matcher: (action) => matches(action, ["checkout", "cart", "conversion", "friction"])
  },
  {
    key: "meta-creative",
    title: "Meta creative refresh",
    summary: "Paid spend has no purchases; refresh the hook before scaling budget again.",
    matcher: (action) => matches(action, ["meta", "creative refresh", "roas"])
  },
  {
    key: "dreambig-content",
    title: "DreamBIG / Obama content push",
    summary: "DreamBIG carousel is the top performer; extend the prestige story while the numbers are hot.",
    matcher: (action) => matches(action, ["dreambig", "obama"])
  },
  {
    key: "naisith-hof",
    title: "Naismith Hall of Fame capsule",
    summary: "Prestige partnership pitch in flight — prep the brief before the inductee calendar locks.",
    matcher: (action) => matches(action, ["hall of fame", "naismith"])
  }
];

export function PreparedActionsQueuePanel({ actions }: { actions: PrioritizedAction[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [assetPendingId, setAssetPendingId] = useState<string | null>(null);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  const prioritized = useMemo(() => actions, [actions]);
  const packets = useMemo(() => buildActionPackets(prioritized), [prioritized]);
  const topPackets = packets.slice(0, MAX_TOP_PACKETS);
  const remainingPackets = packets.slice(MAX_TOP_PACKETS);
  const groupedPackets = groupPackets(remainingPackets);

  const mutateStatus = useCallback(async (action: PreparedAction, status: string, extra?: Record<string, unknown>) => {
    setPendingId(action.id);
    try {
      const res = await fetch(`/api/prepared-actions/${action.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(extra ?? {}) })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      publishDashboardToast({ tone: "success", title: statusLabel(status as PreparedAction["status"]) });
      requestDashboardRefresh({ reason: "prepared-actions" });
    } catch (error) {
      publishDashboardToast({
        tone: "error",
        title: "Prepared action update failed",
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setPendingId(null);
    }
  }, []);

  const handleGenerateAsset = useCallback(async (action: PreparedAction) => {
    const assetType = defaultAssetTypeForAction(action);
    setAssetPendingId(action.id);
    try {
      const res = await fetch(`/api/prepared-actions/${action.id}/generate-asset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetType })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      publishDashboardToast({ tone: "success", title: "Draft asset ready" });
      requestDashboardRefresh({ reason: "prepared-assets" });
    } catch (error) {
      publishDashboardToast({
        tone: "error",
        title: "Asset generation failed",
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setAssetPendingId(null);
    }
  }, []);

  if (!actions.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Prepared actions queue</p>
        <p className="mt-2">No prepared actions logged. Approved work will surface here once agents stage it.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="prepared-actions-queue">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Prepared actions queue</p>
          <p className="text-sm text-zinc-400">Top packets stay visible; everything else collapses into lifecycle groups. Date range has no effect here.</p>
          <SourceRangeLabel source="Agent queue" range="Range not applicable" confidence="manual execution required" note="Always validate context before running" />
        </div>
        <p className="text-xs text-zinc-500">{actions.length} total actions</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3" data-testid="prepared-actions-top">
        {topPackets.map((packet) => (
          <PacketCard
            key={packet.key}
            packet={packet}
            pendingId={pendingId}
            assetPendingId={assetPendingId}
            mutate={mutateStatus}
            onGenerateAsset={handleGenerateAsset}
            expandedActionId={expandedActionId}
            setExpandedActionId={setExpandedActionId}
          />
        ))}
        {!topPackets.length ? <p className="text-sm text-zinc-400">No high-priority packets yet.</p> : null}
      </div>

      {groupedPackets.map(({ group, packets: groupPackets }) => (
        <details key={group} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.01]">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm text-white">
            <div>
              <p className="font-semibold">{displayGroupLabel(group)}</p>
              <p className="text-xs text-zinc-400">{displayGroupDescription(group)}</p>
            </div>
            <span className="text-xs text-zinc-500">{groupPackets.length} packet{groupPackets.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="space-y-3 border-t border-white/5 p-4">
            {groupPackets.map((packet) => (
              <PacketRow
                key={packet.key}
                packet={packet}
                pendingId={pendingId}
                assetPendingId={assetPendingId}
                mutate={mutateStatus}
                onGenerateAsset={handleGenerateAsset}
                expandedActionId={expandedActionId}
                setExpandedActionId={setExpandedActionId}
              />
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function PacketCard({
  packet,
  pendingId,
  assetPendingId,
  mutate,
  onGenerateAsset,
  expandedActionId,
  setExpandedActionId
}: PacketRowProps) {
  const badge = packetBadge(packet);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{badge}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{packet.title}</h3>
        </div>
        <PacketChips packet={packet} />
      </div>
      <p className="mt-2 text-sm text-zinc-300">{packet.summary}</p>
      <p className="mt-2 text-xs text-zinc-400">Next manual step: {packet.nextStep || "Add a real next step before executing."}</p>
      <p className="mt-1 text-xs text-zinc-500">Owners: {packet.owners.join(", ")}</p>
      <div className="mt-3 space-y-2">
        {packet.actions.map((action) => (
          <ActionSummary
            key={action.id}
            action={action}
            pendingId={pendingId}
            assetPendingId={assetPendingId}
            mutate={mutate}
            onGenerateAsset={onGenerateAsset}
            expandedActionId={expandedActionId}
            setExpandedActionId={setExpandedActionId}
          />
        ))}
      </div>
    </article>
  );
}

function PacketRow(props: PacketRowProps) {
  const { packet } = props;
  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-4" data-testid="action-packet">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{packetBadge(packet)}</p>
          <h4 className="text-base font-semibold text-white">{packet.title}</h4>
          <p className="text-xs text-zinc-400">{packet.summary}</p>
        </div>
        <PacketChips packet={packet} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">Owners: {packet.owners.join(", ")}</p>
      <p className="mt-1 text-xs text-zinc-400">Next manual step: {packet.nextStep || "Add a real next step before executing."}</p>
      <div className="mt-3 space-y-2">
        {packet.actions.map((action) => (
          <ActionSummary
            key={action.id}
            action={action}
            pendingId={props.pendingId}
            assetPendingId={props.assetPendingId}
            mutate={props.mutate}
            onGenerateAsset={props.onGenerateAsset}
            expandedActionId={props.expandedActionId}
            setExpandedActionId={props.setExpandedActionId}
          />
        ))}
      </div>
    </article>
  );
}

type PacketRowProps = {
  packet: ActionPacket;
  pendingId: string | null;
  assetPendingId: string | null;
  mutate: (action: PreparedAction, status: string, extra?: Record<string, unknown>) => Promise<void>;
  onGenerateAsset: (action: PreparedAction) => void;
  expandedActionId: string | null;
  setExpandedActionId: (id: string | null) => void;
};

function PacketChips({ packet }: { packet: ActionPacket }) {
  const chips = [] as { label: string; tone: "emerald" | "amber" | "rose" | "zinc" }[];
  chips.push({ label: packet.statusGroup === "do_now" ? "Do now" : displayGroupLabel(packet.statusGroup), tone: chipTone(packet.statusGroup) });
  chips.push({ label: packet.dataState === "stale" ? "Stale" : packet.dataState === "data_light" ? "Data light" : "Fresh", tone: packet.dataState === "stale" ? "rose" : packet.dataState === "data_light" ? "amber" : "emerald" });
  chips.push({ label: `Confidence ${packet.confidence}`, tone: packet.confidence === "high" ? "emerald" : packet.confidence === "medium" ? "amber" : "zinc" });
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <StatusChip key={`${packet.key}-${chip.label}`} label={chip.label} tone={chip.tone} />
      ))}
    </div>
  );
}

function ActionSummary({
  action,
  pendingId,
  assetPendingId,
  mutate,
  onGenerateAsset,
  expandedActionId,
  setExpandedActionId
}: {
  action: PrioritizedAction;
  pendingId: string | null;
  assetPendingId: string | null;
  mutate: (action: PreparedAction, status: string, extra?: Record<string, unknown>) => Promise<void>;
  onGenerateAsset: (action: PreparedAction) => void;
  expandedActionId: string | null;
  setExpandedActionId: (id: string | null) => void;
}) {
  const expanded = expandedActionId === action.id;
  const manualStep = action.requiredApprovalAction || "Specify the manual step";
  const source = `${formatSourcePanel(action.sourcePanel)} · ${formatSnapshotAge(action.sourceSnapshotAt)}`;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{action.title}</p>
          <p className="text-xs text-zinc-500">{source}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusChip {...formatPriorityChip(action)} />
          <StatusChip {...formatDataChip(action)} />
        </div>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div>
          <dt className="text-zinc-500">Why now</dt>
          <dd className="text-zinc-200">{action.whyItMatters || "Add context"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Manual step</dt>
          <dd className="text-zinc-200">{manualStep}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Confidence</dt>
          <dd className="text-zinc-200">{action.confidence}</dd>
        </div>
      </dl>
      <button className="mt-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500" onClick={() => setExpandedActionId(expanded ? null : action.id)}>
        {expanded ? "Hide details" : "Open details"}
      </button>
      {expanded ? (
        <ActionDetail
          action={action}
          pending={pendingId === action.id}
          mutate={mutate}
          assetPending={assetPendingId === action.id}
          onGenerateAsset={() => onGenerateAsset(action)}
        />
      ) : null}
    </div>
  );
}

function ActionDetail({
  action,
  pending,
  mutate,
  assetPending,
  onGenerateAsset
}: {
  action: PrioritizedAction;
  pending: boolean;
  mutate: (action: PreparedAction, status: string, extra?: Record<string, unknown>) => Promise<void>;
  assetPending: boolean;
  onGenerateAsset: () => void;
}) {
  const hasAsset = hasPreparedAsset(action);
  const evidenceSnippet = getEvidenceSnippet(action);
  const dataWarning = action.dataWarning ?? (isActionStale(action, STALE_THRESHOLD_HOURS) ? "Source snapshot stale" : undefined);
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
      <p className="text-xs text-zinc-400">Data signal: {evidenceSnippet || "Add evidence before approval."}</p>
      <p className="text-xs text-zinc-400">Upside: {formatEstimatedImpact(action)} · Risk: {formatRiskIfIgnored(action)}</p>
      <p className="text-xs text-zinc-400">Freshness: {dataWarning ?? "Fresh"}</p>
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
        <button className={buttonClass(pending)} disabled={pending} onClick={() => mutate(action, "ready_for_review")}>
          Mark ready
        </button>
        <button className={buttonClass(pending)} disabled={pending} onClick={() => mutate(action, "approved")}>
          Start manually
        </button>
        <button className={buttonClass(pending)} disabled={pending} onClick={() => mutate(action, "rejected", { rejectionReason: "Needs more evidence" })}>
          Needs evidence
        </button>
      </div>
      <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
        <summary className="cursor-pointer text-[11px] uppercase tracking-[0.2em] text-zinc-500">Feedback & assets</summary>
        <FeedbackControls context={action.title} />
        <div className="mt-3 space-y-2">
          <p className="font-semibold text-white">Prepared asset</p>
          {hasAsset ? <p className="text-zinc-200">{action.preparedAsset?.[0]?.value}</p> : <p className="text-zinc-400">No asset yet.</p>}
          <button className={buttonClass(assetPending)} disabled={assetPending} onClick={onGenerateAsset}>
            {hasAsset ? "Regenerate" : "Generate"} draft asset
          </button>
        </div>
      </details>
    </div>
  );
}

function buildActionPackets(actions: PrioritizedAction[]): ActionPacket[] {
  const map = new Map<string, { packet: ActionPacket; rule?: PacketRule }>();

  actions.forEach((action) => {
    const rule = PACKET_RULES.find((candidate) => candidate.matcher(action));
    const baseKey = rule?.key ?? action.dedupeKey ?? action.id;
    const entry = map.get(baseKey);
    if (entry) {
      entry.packet.actions.push(action);
      entry.packet.packetScore = Math.max(entry.packet.packetScore, action.priorityScore);
      entry.packet.owners = Array.from(new Set([...entry.packet.owners, formatAgent(action.createdByAgent)]));
      if (confidenceWeight(action.confidence) > confidenceWeight(entry.packet.confidence)) {
        entry.packet.confidence = action.confidence;
      }
      if (isActionStale(action, STALE_THRESHOLD_HOURS)) entry.packet.dataState = "stale";
      else if (entry.packet.dataState !== "stale" && action.dataLight) entry.packet.dataState = "data_light";
      if (!entry.packet.nextStep && action.requiredApprovalAction) {
        entry.packet.nextStep = action.requiredApprovalAction;
      }
    } else {
      const initialPacket: ActionPacket = {
        key: baseKey,
        title: rule?.title ?? action.title,
        summary: rule?.summary ?? action.whyItMatters ?? "Add context",
        owners: [formatAgent(action.createdByAgent)],
        nextStep: action.requiredApprovalAction ?? "Specify the manual step",
        actions: [action],
        packetScore: action.priorityScore,
        statusGroup: "waiting",
        dataState: action.dataLight ? "data_light" : "fresh",
        confidence: action.confidence,
        stale: isActionStale(action, STALE_THRESHOLD_HOURS)
      };
      if (initialPacket.stale) initialPacket.dataState = "stale";
      map.set(baseKey, { packet: initialPacket, rule });
    }
  });

  const packets = Array.from(map.values()).map(({ packet }) => {
    const sortedActions = [...packet.actions].sort((a, b) => b.priorityScore - a.priorityScore);
    const topAction = sortedActions[0];
    const statusGroup = deriveDisplayGroup(topAction, packet);
    return {
      ...packet,
      actions: sortedActions,
      statusGroup,
      summary: packet.summary || topAction.whyItMatters || "Add context",
      stale: packet.dataState === "stale"
    } satisfies ActionPacket;
  });

  return packets.sort((a, b) => b.packetScore - a.packetScore);
}

function groupPackets(packets: ActionPacket[]) {
  return DISPLAY_GROUP_ORDER.map((group) => ({ group, packets: packets.filter((packet) => packet.statusGroup === group) })).filter((item) => item.packets.length);
}

function deriveDisplayGroup(action: PrioritizedAction, packet: ActionPacket): DisplayGroup {
  if (action.status === "manually_executed" || action.status === "archived") return "archived";
  if (isTestAction(action) || action.createdByAgent === "system") return "internal";
  if (packet.dataState === "stale") return "stale";
  if (action.priorityLabel === "do_next") return "do_now";
  if (action.priorityLabel === "review_soon") return "review_next";
  return "waiting";
}

function matches(action: PreparedAction, needles: string[]) {
  const haystack = [action.title, action.whyItMatters, action.dedupeKey, action.requiredApprovalAction, JSON.stringify(action.evidence ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function formatAgent(agent?: string | null) {
  if (!agent) return "Unknown";
  return AGENT_LABELS[agent] ?? agent.charAt(0).toUpperCase() + agent.slice(1);
}

function formatSourcePanel(panel?: string | null) {
  if (!panel) return "Unknown source";
  return panel.replace(/_/g, " ");
}

function formatSnapshotAge(snapshot?: string | null) {
  if (!snapshot) return "no snapshot";
  const hours = actionSnapshotStalenessHours({ sourceSnapshotAt: snapshot } as PreparedAction);
  if (!Number.isFinite(hours)) return "no snapshot";
  if (hours < 1) return "<1h ago";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function confidenceWeight(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function packetBadge(packet: ActionPacket) {
  if (packet.statusGroup === "do_now") return "Primary packet";
  if (packet.statusGroup === "review_next") return "In review";
  if (packet.statusGroup === "stale") return "Stale";
  if (packet.statusGroup === "internal") return "Internal / Test";
  if (packet.statusGroup === "archived") return "Completed";
  return "Watch";
}

function displayGroupLabel(group: DisplayGroup) {
  switch (group) {
    case "do_now":
      return "Do now";
    case "review_next":
      return "Review next";
    case "waiting":
      return "Waiting / Watch";
    case "stale":
      return "Stale / Reassess";
    case "internal":
      return "Internal / Test";
    case "archived":
      return "Archived / Hidden";
    default:
      return group;
  }
}

function displayGroupDescription(group: DisplayGroup) {
  switch (group) {
    case "do_now":
      return "High-leverage packets that should move immediately.";
    case "review_next":
      return "Needs a quick manual review before running.";
    case "waiting":
      return "Tracked but not urgent.";
    case "stale":
      return "Data is old — refresh or archive.";
    case "internal":
      return "QA and system smoke items.";
    case "archived":
      return "Already executed or archived.";
    default:
      return "";
  }
}

function chipTone(group: DisplayGroup): "emerald" | "amber" | "rose" | "zinc" {
  switch (group) {
    case "do_now":
      return "emerald";
    case "review_next":
      return "amber";
    case "stale":
      return "rose";
    case "internal":
    case "archived":
      return "zinc";
    default:
      return "zinc";
  }
}

function formatPriorityChip(action: PrioritizedAction) {
  if (action.status === "ready_for_review") return { label: "Ready for review", tone: "amber" as const };
  if (action.priorityLabel === "do_next") return { label: "Do now", tone: "emerald" as const };
  if (action.priorityLabel === "review_soon") return { label: "Review next", tone: "amber" as const };
  if (isTestAction(action)) return { label: "Manual", tone: "zinc" as const };
  return { label: "Watch", tone: "zinc" as const };
}

function formatDataChip(action: PrioritizedAction) {
  if (action.dataWarning === "Source snapshot stale" || isActionStale(action, STALE_THRESHOLD_HOURS)) return { label: "Stale", tone: "rose" as const };
  if (action.dataLight) return { label: "Data light", tone: "amber" as const };
  return { label: "Fresh", tone: "emerald" as const };
}

function hasPreparedAsset(action: PreparedAction) {
  return Boolean(action.preparedAsset?.some((asset) => asset.value && asset.value.trim().length));
}

function getEvidenceSnippet(action: PreparedAction) {
  return action.evidence?.find((entry) => entry.value)?.value ?? action.evidence?.[0]?.label ?? "";
}

function statusLabel(status: PreparedAction["status"]) {
  switch (status) {
    case "ready_for_review":
      return "Marked ready";
    case "approved":
      return "Marked in progress";
    case "rejected":
      return "Dismissed";
    case "manually_executed":
      return "Completed";
    case "archived":
      return "Archived";
    default:
      return "Updated";
  }
}

function buttonClass(disabled: boolean) {
  return `rounded-xl border border-white/15 px-3 py-2 text-xs text-white transition hover:border-white/30 hover:bg-white/5 ${disabled ? "opacity-60" : ""}`;
}

const FEEDBACK_OPTIONS = ["Useful", "Wrong priority", "Needs more evidence", "Too generic", "Ignore today", "Ask for alternate"];

function FeedbackControls({ context }: { context: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
      {FEEDBACK_OPTIONS.map((option) => (
        <button
          key={`${context}-${option}`}
          type="button"
          className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-200 hover:border-white/30"
          onClick={() => publishDashboardToast({ tone: "info", title: `Feedback: ${option}`, description: `${context} noted (UI-only)` })}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
