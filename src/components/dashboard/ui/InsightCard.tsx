"use client";

import { useMemo, useState } from "react";
import { Drawer } from "./Drawer";
import { StatusChip } from "./StatusChip";

export type InsightState = "pending" | "supported" | "action_needed" | "resolved";

export type InsightEvidenceItem = {
  label: string;
  value: string;
};

export type InsightActionItem = {
  label: string;
  detail?: string | null;
  href?: string | null;
  onClick?: (() => void) | null;
  disabled?: boolean;
  statusLabel?: string | null;
};

export type InsightObject = {
  id: string;
  title: string;
  claim: string;
  state: InsightState;
  confidenceLabel?: string | null;
  ownerLabel?: string | null;
  evidence?: InsightEvidenceItem[] | null;
  actions?: InsightActionItem[] | null;
  updatedAtLabel?: string | null;
  definition?: string | null;
};

function stateTone(state: InsightState) {
  if (state === "supported") return "emerald" as const;
  if (state === "action_needed") return "amber" as const;
  if (state === "resolved") return "sky" as const;
  return "zinc" as const;
}

function stateLabel(state: InsightState) {
  if (state === "supported") return "supported";
  if (state === "action_needed") return "action needed";
  if (state === "resolved") return "resolved";
  return "pending";
}

export function InsightCard({ insight, className = "" }: { insight: InsightObject; className?: string }) {
  const [open, setOpen] = useState(false);

  const evidence = useMemo(
    () =>
      (insight.evidence ?? [])
        .map((item) => ({ label: String(item.label ?? "").trim(), value: String(item.value ?? "").trim() }))
        .filter((item) => Boolean(item.label) && Boolean(item.value)),
    [insight.evidence]
  );

  const actions = useMemo(
    () =>
      (insight.actions ?? [])
        .map((item) => ({
          label: String(item.label ?? "").trim(),
          detail: item.detail ?? null,
          href: item.href ?? null,
          onClick: item.onClick ?? null,
          disabled: Boolean(item.disabled),
          statusLabel: item.statusLabel ?? null
        }))
        .filter((item) => Boolean(item.label)),
    [insight.actions]
  );

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-4 ${className}`}>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={insight.title}
        description={insight.ownerLabel ? `${insight.ownerLabel} · ${stateLabel(insight.state)}` : stateLabel(insight.state)}
        widthClassName="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Claim</div>
            <div className="mt-2 text-sm text-zinc-100">{insight.claim}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip label={stateLabel(insight.state)} tone={stateTone(insight.state)} />
              {insight.confidenceLabel ? <StatusChip label={insight.confidenceLabel} tone="zinc" /> : null}
              {insight.updatedAtLabel ? <StatusChip label={insight.updatedAtLabel} tone="zinc" /> : null}
            </div>
          </div>

          {insight.definition ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Definition</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{insight.definition}</div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Evidence</div>
            {evidence.length ? (
              <div className="mt-3 space-y-2">
                {evidence.map((item) => (
                  <div key={`${item.label}:${item.value}`} className="flex items-start justify-between gap-4 text-sm">
                    <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                      {item.label}
                    </div>
                    <div className="text-right text-zinc-200">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">No evidence attached yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Recommended action</div>
            {actions.length ? (
              <div className="mt-3 space-y-2">
                {actions.map((action) => {
                  const content = (
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">{action.label}</div>
                      {action.detail ? <div className="mt-1 text-xs text-zinc-500">{action.detail}</div> : null}
                    </div>
                  );

                  const actionLabel = action.statusLabel ?? (action.href ? "Open" : "Run");

                  if (action.href) {
                    return (
                      <a
                        key={`${action.label}:${action.href}`}
                        href={action.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-white/20"
                      >
                        {content}
                        <div className="shrink-0 text-xs text-zinc-400">{actionLabel}</div>
                      </a>
                    );
                  }

                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => action.onClick?.()}
                      disabled={!action.onClick || action.disabled}
                      className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {content}
                      <div className="shrink-0 text-xs text-zinc-400">{actionLabel}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">No recommended actions yet.</div>
            )}
          </div>
        </div>
      </Drawer>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{insight.title}</div>
          <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{insight.claim}</div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusChip label={stateLabel(insight.state)} tone={stateTone(insight.state)} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-200 hover:border-white/20 hover:bg-white/[0.04]"
          >
            Explain
          </button>
        </div>
      </div>
    </div>
  );
}
