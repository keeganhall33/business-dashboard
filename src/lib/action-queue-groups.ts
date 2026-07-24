import { formatRelativeTimeFromNow } from "@/lib/date";

import type { ActionQueue, ActionQueueItem } from "@/lib/types/dashboard";

export type PriorityLabel = "critical" | "high" | "medium" | "low" | "unknown";

type FacebookGroupingKey = {
  key: string;
  platformLabel: string;
  actionLabel: string;
};

export type EnrichedQueueItem = {
  original: ActionQueueItem;
  originalIndex: number;
  requiresApproval: boolean;
  priority: PriorityLabel;
  priorityRank: number;
  ownerLabel: string;
  actorLabel: string | null;
  timestampLabel: string;
  timestampMs: number | null;
  dueLabel: string | null;
  facebookKey?: FacebookGroupingKey | null;
};

export type ActionQueueDisplayItem =
  | { kind: "single"; id: string; data: EnrichedQueueItem }
  | {
      kind: "group";
      id: string;
      title: string;
      summary: string | null;
      count: number;
      platformLabel: string;
      actionLabel: string;
      priority: PriorityLabel;
      priorityRank: number;
      requiresApproval: boolean;
      timestampLabel: string;
      timestampMs: number | null;
      ownerLabel: string;
      dueLabel: string | null;
      originalIndex: number;
      items: EnrichedQueueItem[];
    };

type ProcessedSection = {
  label: string;
  items: ActionQueueDisplayItem[];
  count: number;
};

type BuildOptions = {
  requiresApprovalSection: boolean;
};

type BuildResult = {
  displayItems: ActionQueueDisplayItem[];
  totalCount: number;
};

export function buildActionQueueSections(data: ActionQueue): ProcessedSection[] {
  const baseSections: Array<{ label: string; items: ActionQueueItem[]; requiresApproval: boolean }> = [
    { label: data.needsApprovalTasks.label, items: data.needsApprovalTasks.items, requiresApproval: true },
    { label: data.pendingPlans.label, items: data.pendingPlans.items, requiresApproval: false },
    { label: data.decisionsDue.label, items: data.decisionsDue.items, requiresApproval: false },
    { label: data.invoicesToSend.label, items: data.invoicesToSend.items, requiresApproval: false }
  ];

  return baseSections
    .map((section) => {
      const processed = buildDisplayItems(section.items, {
        requiresApprovalSection: section.requiresApproval
      });
      return {
        label: section.label,
        items: processed.displayItems,
        count: processed.totalCount
      };
    })
    .filter((section) => section.label.trim().length > 0);
}

function buildDisplayItems(items: ActionQueueItem[], options: BuildOptions): BuildResult {
  const enriched = items.map<EnrichedQueueItem>((item, index) => enrichItem(item, index, options.requiresApprovalSection));

  const facebookGroups = new Map<string, { key: FacebookGroupingKey; entries: EnrichedQueueItem[] }>();
  for (const entry of enriched) {
    if (entry.facebookKey) {
      const key = entry.facebookKey.key;
      if (!facebookGroups.has(key)) {
        facebookGroups.set(key, { key: entry.facebookKey, entries: [] });
      }
      facebookGroups.get(key)!.entries.push(entry);
    }
  }

  const consumedIndices = new Set<number>();
  const displayItems: ActionQueueDisplayItem[] = [];

  for (const entry of enriched) {
    if (entry.facebookKey) {
      const group = facebookGroups.get(entry.facebookKey.key);
      if (group && group.entries.length > 1) {
        if (consumedIndices.has(entry.originalIndex)) continue;
        group.entries.forEach((e) => consumedIndices.add(e.originalIndex));
        const sortedEntries = group.entries.slice().sort(sortByTimestampThenIndex);
        const latest = sortedEntries[0];
        displayItems.push({
          kind: "group",
          id: `facebook-group-${group.key.key}`,
          title: `${titleCase(group.key.actionLabel)} (${group.key.platformLabel})`,
          summary: latest.original.summary,
          count: group.entries.length,
          platformLabel: group.key.platformLabel,
          actionLabel: titleCase(group.key.actionLabel),
          priority: latest.priority,
          priorityRank: latest.priorityRank,
          requiresApproval: latest.requiresApproval,
          timestampLabel: latest.timestampLabel,
          timestampMs: latest.timestampMs,
          ownerLabel: latest.ownerLabel,
          dueLabel: latest.dueLabel,
          originalIndex: latest.originalIndex,
          items: sortedEntries
        });
        continue;
      }
    }

    if (!consumedIndices.has(entry.originalIndex)) {
      displayItems.push({ kind: "single", id: entry.original.id, data: entry });
    }
  }

  const sortedDisplay = displayItems.slice().sort(compareDisplayItems);
  const totalCount = displayItems.reduce((total, item) => total + (item.kind === "group" ? item.count : 1), 0);

  return { displayItems: sortedDisplay, totalCount };
}

function enrichItem(item: ActionQueueItem, originalIndex: number, requiresApprovalSection: boolean): EnrichedQueueItem {
  const createdLabel = formatUpdateLabel(item.createdAt);
  const timestampMs = toTimestampMs(item.createdAt);
  const dueLabel = formatDueLabel(item.dueAt);
  const ownerLabel = item.actor?.trim()?.length ? `Owner: ${item.actor}` : "Owner unavailable";
  const actorLabel = item.actor?.trim() ?? null;
  const priority = normalizePriority(item.priority);
  const facebookKey = deriveFacebookKey(item);

  return {
    original: item,
    originalIndex,
    requiresApproval: requiresApprovalSection,
    priority,
    priorityRank: PRIORITY_ORDER[priority],
    ownerLabel,
    actorLabel,
    timestampLabel: createdLabel,
    timestampMs,
    dueLabel,
    facebookKey
  };
}

function compareDisplayItems(a: ActionQueueDisplayItem, b: ActionQueueDisplayItem) {
  const aApproval = a.kind === "group" ? Number(a.requiresApproval) : Number(a.data.requiresApproval);
  const bApproval = b.kind === "group" ? Number(b.requiresApproval) : Number(b.data.requiresApproval);
  if (aApproval !== bApproval) {
    return bApproval - aApproval;
  }

  const aPriorityRank = a.kind === "group" ? a.priorityRank : a.data.priorityRank;
  const bPriorityRank = b.kind === "group" ? b.priorityRank : b.data.priorityRank;
  if (aPriorityRank !== bPriorityRank) {
    return aPriorityRank - bPriorityRank;
  }

  const aTimestamp = a.kind === "group" ? a.timestampMs : a.data.timestampMs;
  const bTimestamp = b.kind === "group" ? b.timestampMs : b.data.timestampMs;
  if (aTimestamp != null && bTimestamp != null && aTimestamp !== bTimestamp) {
    return bTimestamp - aTimestamp;
  }
  if (aTimestamp == null && bTimestamp != null) {
    return 1;
  }
  if (aTimestamp != null && bTimestamp == null) {
    return -1;
  }

  const aIndex = a.kind === "group" ? a.originalIndex : a.data.originalIndex;
  const bIndex = b.kind === "group" ? b.originalIndex : b.data.originalIndex;
  return aIndex - bIndex;
}

function sortByTimestampThenIndex(a: EnrichedQueueItem, b: EnrichedQueueItem) {
  if (a.timestampMs != null && b.timestampMs != null && a.timestampMs !== b.timestampMs) {
    return b.timestampMs - a.timestampMs;
  }
  if (a.timestampMs == null && b.timestampMs != null) {
    return 1;
  }
  if (a.timestampMs != null && b.timestampMs == null) {
    return -1;
  }
  return a.originalIndex - b.originalIndex;
}

function formatUpdateLabel(iso?: string | null) {
  const relative = iso ? formatRelativeTimeFromNow(iso) : null;
  if (!relative) {
    return "Update time unavailable";
  }
  return `Updated ${relative}`;
}

function formatDueLabel(iso?: string | null) {
  if (!iso) return null;
  const relative = formatRelativeTimeFromNow(iso);
  if (!relative) return "Due time unavailable";
  return `Due ${relative}`;
}

function toTimestampMs(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizePriority(priority?: string | null): PriorityLabel {
  const normalized = (priority ?? "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "unknown";
}

const PRIORITY_ORDER: Record<PriorityLabel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4
};

export function priorityTone(priority: PriorityLabel) {
  if (priority === "critical") return "rose" as const;
  if (priority === "high") return "amber" as const;
  if (priority === "medium") return "sky" as const;
  if (priority === "low") return "zinc" as const;
  return "zinc" as const;
}

export function titleCase(value: string) {
  if (!value) return value;
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveFacebookKey(item: ActionQueueItem): FacebookGroupingKey | null {
  const title = item.title ?? "";
  const normalizedTitle = normalizeFacebookTitle(title);
  if (!normalizedTitle.startsWith("facebook ads")) return null;

  const parts = normalizedTitle.split(/[\-–—•|]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const base = parts[0] ?? "facebook ads";
  const actionSegment = base.replace("facebook ads", "").trim() || "review";
  const remainder = parts[1] ?? "";

  const platformLabel = "Facebook Ads";
  const actionLabel = `${"facebook ads"} ${actionSegment}`.trim();
  const key = [platformLabel.toLowerCase(), actionLabel.toLowerCase(), remainder.toLowerCase()].join("|");
  return {
    key,
    platformLabel,
    actionLabel
  };
}

function normalizeFacebookTitle(title: string) {
  const cleaned = title
    .toLowerCase()
    .replace(/\d{4}[-\/]\d{2}[-\/]\d{2}/g, "")
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, "")
    .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, "")
    .replace(/\d+h|\d+d/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}
