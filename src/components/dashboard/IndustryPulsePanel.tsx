"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { IndustryPulseInteractions, IndustryPulseResponse, IndustryPulseOpportunity } from "@/lib/types/industryPulse";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { requestDashboardRefresh, DASHBOARD_REFRESH_EVENT } from "@/lib/dashboard/events";
import { extractResponseError } from "@/lib/dashboard/http";
import { EmptyState } from "./ui/EmptyState";

type Props = {
  initialSnapshot?: DashboardOverviewResponse["industryPulse"];
};

const VISIBLE_ITEMS = 5;
const FETCH_LIMIT = 12;

function todayIsoDayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

function formatConfidence(confidence: number | null) {
  if (confidence == null) return "—";
  return `${Math.round(confidence * 100)}%`;
}

function toneForConfidence(confidence: number | null) {
  if (confidence == null) return "zinc";
  if (confidence >= 0.8) return "emerald";
  if (confidence >= 0.5) return "amber";
  return "rose";
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-border)] bg-white/[0.02] px-2 py-0.5 text-[11px] font-semibold text-zinc-200"
      data-tone={tone}
    >
      <span className="ui-status-dot" data-tone={tone} />
      {label}
    </span>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
      <div className="h-4 w-40 animate-pulse rounded-full bg-zinc-800/80" />
      <div className="mt-3 h-5 w-3/4 animate-pulse rounded-full bg-zinc-800/70" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-zinc-900/60" />
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-zinc-900/60" />
      </div>
      <div className="mt-4 h-8 w-44 animate-pulse rounded-xl bg-zinc-800/60" />
    </div>
  );
}

export function IndustryPulsePanel({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [availableDays, setAvailableDays] = useState<string[]>(initialSnapshot?.day ? [initialSnapshot.day] : []);
  const [selectedDay, setSelectedDay] = useState(initialSnapshot?.day ?? todayIsoDayUtc());
  const [isLoading, setIsLoading] = useState(!initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<IndustryPulseInteractions | null>(null);
  const [isPending, startTransition] = useTransition();

  // Some snapshots (ex: dashboard overview seed mode) may not include `day` on each item.
  // Normalize here so downstream actions (pipeline creation) always have a valid day.
  const items: IndustryPulseOpportunity[] = (snapshot?.items ?? []).map((item) => {
    const { day, ...rest } = item as Partial<IndustryPulseOpportunity> & Record<string, unknown>;
    return {
      ...(rest as IndustryPulseOpportunity),
      day: day ?? (snapshot?.day ?? selectedDay)
    };
  });

  const selectedIndex = useMemo(
    () => Math.max(0, availableDays.findIndex((d) => d === selectedDay)),
    [availableDays, selectedDay]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadBase() {
      setError(null);
      try {
        const [pulse, touch] = await Promise.all([
          fetch(`/api/industry-pulse?day=${encodeURIComponent(selectedDay)}&days=14&limit=${FETCH_LIMIT}`, { cache: "no-store" }).then(
            async (res) => {
              if (!res.ok) throw new Error(await extractResponseError(res));
              return (await res.json()) as IndustryPulseResponse;
            }
          ),
          fetch("/api/industry-pulse/interactions", { cache: "no-store" }).then(async (res) => {
            if (!res.ok) throw new Error(await extractResponseError(res));
            return (await res.json()) as IndustryPulseInteractions;
          })
        ]);
        if (cancelled) return;
        setSnapshot({ day: pulse.day, refreshedAtIso: pulse.refreshedAtIso, items: pulse.items });
        setAvailableDays(pulse.availableDays);
        setSelectedDay(pulse.day);
        setInteractions(touch);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load industry pulse.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadBase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleRefresh() {
      // Only refresh currently selected day.
      startTransition(async () => {
        try {
          const res = await fetch(`/api/industry-pulse?day=${encodeURIComponent(selectedDay)}&days=14&limit=${FETCH_LIMIT}`, {
            cache: "no-store"
          });
          if (!res.ok) throw new Error(await extractResponseError(res));
          const pulse = (await res.json()) as IndustryPulseResponse;
          setSnapshot({ day: pulse.day, refreshedAtIso: pulse.refreshedAtIso, items: pulse.items });
          setAvailableDays(pulse.availableDays);
          setSelectedDay(pulse.day);
        } catch (err) {
          console.error(err);
          publishDashboardToast({
            tone: "error",
            title: "Industry Pulse refresh failed",
            description: err instanceof Error ? err.message : String(err)
          });
        }
      });
    }
    window.addEventListener(DASHBOARD_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handleRefresh);
  }, [selectedDay, startTransition]);

  function setDay(nextDay: string) {
    if (!nextDay || nextDay === selectedDay) return;
    setSelectedDay(nextDay);
    setIsLoading(true);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/industry-pulse?day=${encodeURIComponent(nextDay)}&days=14&limit=${FETCH_LIMIT}`, {
          cache: "no-store"
        });
        if (!res.ok) throw new Error(await extractResponseError(res));
        const pulse = (await res.json()) as IndustryPulseResponse;
        setSnapshot({ day: pulse.day, refreshedAtIso: pulse.refreshedAtIso, items: pulse.items });
        setAvailableDays(pulse.availableDays);
        setSelectedDay(pulse.day);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load archive day.");
      } finally {
        setIsLoading(false);
      }
    });
  }

  async function patchInteraction(payload: {
    id: string;
    contacted?: boolean;
    dismissed?: boolean;
    addedToPipeline?: { opportunityId?: string };
  }) {
    const res = await fetch("/api/industry-pulse/interactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await extractResponseError(res));
    const next = (await res.json()) as IndustryPulseInteractions;
    setInteractions(next);
  }

  function getInteraction(id: string) {
    return interactions?.items?.[id] ?? null;
  }

  async function handleAddToPipeline(item: IndustryPulseOpportunity) {
    startTransition(async () => {
      try {
        const notes = [
          item.summary ? `Summary: ${item.summary}` : null,
          item.collabIdea ? `Collab idea: ${item.collabIdea}` : null,
          item.whyNow ? `Why now: ${item.whyNow}` : null,
          item.contactEmail ? `Primary contact: ${item.contactEmail}` : null,
          item.sourceUrl ? `Source: ${item.sourceUrl}` : null,
          `Industry Pulse ID: ${item.id}`
        ]
          .filter(Boolean)
          .join("\n\n");

        const response = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.headline,
            organization: null,
            opportunityType: "brand_partnership",
            status: "identified",
            ownerAgent: "noah",
            nextStep: item.contactEmail ? `Reach out to ${item.contactEmail}` : "Identify the best contact",
            notesMd: notes,
            source: item.sourceUrl ?? item.source
          })
        });
        if (!response.ok) throw new Error(await extractResponseError(response));
        const created = (await response.json()) as { ok: true; opportunity: { id: string; name: string } };
        await patchInteraction({ id: item.id, addedToPipeline: { opportunityId: created.opportunity.id } });
        publishDashboardToast({ tone: "success", title: "Added to pipeline", description: item.headline });
        requestDashboardRefresh({ reason: "industry-pulse.add" });
      } catch (err) {
        publishDashboardToast({
          tone: "error",
          title: "Add to pipeline failed",
          description: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  async function handleMarkContacted(item: IndustryPulseOpportunity) {
    startTransition(async () => {
      try {
        await patchInteraction({ id: item.id, contacted: true });
        publishDashboardToast({ tone: "success", title: "Marked contacted", description: item.headline });
      } catch (err) {
        publishDashboardToast({
          tone: "error",
          title: "Mark contacted failed",
          description: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  async function handleDismiss(item: IndustryPulseOpportunity) {
    startTransition(async () => {
      try {
        await patchInteraction({ id: item.id, dismissed: true });
        publishDashboardToast({ tone: "success", title: "Dismissed", description: `${item.headline} removed from view` });
      } catch (err) {
        publishDashboardToast({
          tone: "error",
          title: "Dismiss failed",
          description: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  const subtitle = snapshot?.refreshedAtIso
    ? `Curated opportunities • refreshed ${new Date(snapshot.refreshedAtIso).toLocaleString()}`
    : "Curated opportunities";

  const dayLabel = new Date(selectedDay).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const visibleItems = useMemo(() => {
    return items.filter((item) => !interactions?.items?.[item.id]?.dismissedAtIso).slice(0, VISIBLE_ITEMS);
  }, [items, interactions]);

  const hasAnyItems = items.length > 0;
  const isCaughtUp = hasAnyItems && visibleItems.length === 0;

  if (!snapshot && !isLoading && !hasAnyItems) {
    return (
      <section className="ui-glass ui-glass-hover rounded-3xl p-6">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Industry Pulse</div>
          <p className="text-sm text-zinc-400">Live opportunity feed</p>
        </div>
        <div className="mt-4">
          <EmptyState
            title="Industry Pulse unavailable"
            detail={error ? `Latest refresh failed: ${error}` : "No feed data has been ingested yet."}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Industry Pulse</div>
          <div className="mt-1 text-lg font-semibold text-zinc-100">{VISIBLE_ITEMS} collaboration targets · {dayLabel}</div>
          <div className="mt-1 text-sm text-zinc-500">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Day</span>
          <select
            className="rounded-xl border border-[var(--ui-border)] bg-black/25 px-3 py-2 text-sm text-zinc-200"
            value={selectedDay}
            onChange={(e) => setDay(e.target.value)}
          >
            {availableDays.slice(0, 14).map((day) => (
              <option key={day} value={day}>
                {new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-[var(--ui-border)] bg-black/25 px-3 py-2 text-xs text-zinc-400">
            {isPending ? "Updating…" : availableDays.length ? `${selectedIndex + 1}/${availableDays.length}` : "—"}
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: VISIBLE_ITEMS }).map((_, idx) => <LoadingCard key={idx} />)
        ) : visibleItems.length ? (
          visibleItems.map((item) => {
            const interaction = getInteraction(item.id);
            const pipelined = Boolean(interaction?.addedToPipelineAtIso);
            const contacted = Boolean(interaction?.contactedAtIso);
            const contactTone = toneForConfidence(item.contactConfidence);

            return (
              <div key={item.id} className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{item.source}</div>
                    <a
                      href={item.sourceUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-base font-semibold text-zinc-50 hover:text-white"
                    >
                      {item.headline}
                    </a>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {pipelined ? <StatusBadge label="In pipeline" tone="sky" /> : null}
                    {contacted ? <StatusBadge label="Contacted" tone="emerald" /> : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Collab idea</div>
                    <p className="mt-1 text-sm text-zinc-100">{item.collabIdea || "—"}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Why now</div>
                    <p className="mt-1 text-sm text-zinc-100">{item.whyNow || "—"}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-black/25 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Primary contact</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">
                    {item.contactName ? `${item.contactName}${item.contactEmail ? " · " : ""}` : null}
                    {item.contactEmail || (item.contactName ? "" : "—")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <StatusBadge label={`Confidence: ${formatConfidence(item.contactConfidence)}`} tone={contactTone} />
                    <StatusBadge
                      label={`Status: ${item.contactStatus}`}
                      tone={item.contactStatus === "verified" ? "emerald" : item.contactStatus === "suspected" ? "amber" : "zinc"}
                    />
                    {item.contactEmailSource ? <StatusBadge label={`Source: ${item.contactEmailSource}`} tone="zinc" /> : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleAddToPipeline(item)}
                    className="rounded-xl border border-[var(--ui-accent)]/40 bg-[color-mix(in_oklab,var(--ui-accent)_18%,transparent)] px-3 py-2 text-sm font-semibold text-zinc-50 hover:bg-[color-mix(in_oklab,var(--ui-accent)_24%,transparent)] disabled:opacity-40"
                  >
                    {pipelined ? "Added" : "Add to pipeline"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleMarkContacted(item)}
                    className="rounded-xl border border-[var(--ui-border)] bg-white/[0.02] px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.04] disabled:opacity-40"
                  >
                    {contacted ? "Contacted" : "Mark contacted"}
                  </button>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-[var(--ui-border)] bg-white/[0.02] px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.04]"
                    >
                      Open source
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleDismiss(item)}
                    className="rounded-xl border border-rose-900/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })
        ) : isCaughtUp ? (
          <div className="col-span-full rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-400">
            You&apos;re caught up on leads for {dayLabel}. Check another day or refresh tomorrow.
          </div>
        ) : (
          <div className="col-span-full rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-400">
            No opportunities found for {selectedDay}.
          </div>
        )}
      </div>
    </section>
  );
}
