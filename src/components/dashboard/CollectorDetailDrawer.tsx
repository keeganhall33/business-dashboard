"use client";

import type { CollectorRelationship } from "@/lib/types/dashboard";
import { Drawer } from "./ui/Drawer";
import { EvidenceLinks } from "./EvidenceLinks";

type Props = {
  open: boolean;
  collector: CollectorRelationship | null;
  onClose: () => void;
};

export function CollectorDetailDrawer({ open, collector, onClose }: Props) {
  if (!collector) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={collector.name}
      description={`Tier ${collector.tier} • ${collector.status ?? "quiet"}`}
      widthClassName="sm:max-w-2xl"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Relationship</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Last touch" value={formatRelative(collector.lastOutreachAt)} />
            <Field label="Estimated value" value={collector.estimatedValue != null ? formatCurrency(collector.estimatedValue) : "—"} />
            <Field label="Next move" value={collector.nextMove ?? "—"} />
            <Field label="Next move due" value={collector.nextMoveDueAt ? formatRelative(collector.nextMoveDueAt) : "—"} />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Evidence</div>
              <div className="mt-1 text-sm text-zinc-400">Links render from Supabase deliverables.</div>
            </div>
          </div>
          <EvidenceLinks
            docs={collector.supportingDocs}
            entityLabel="Collector"
            entityName={collector.name}
            entityId={collector.id}
            ownerAgent={null}
            max={8}
          />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Actions</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.06]"
              onClick={() => {
                navigator.clipboard?.writeText(collector.name).catch(() => undefined);
              }}
            >
              Copy name
            </button>
            <button
              type="button"
              className="rounded-xl border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-900/15"
              onClick={async () => {
                const title = `Update collector: ${collector.name}`;
                const description = [
                  `Collector: ${collector.name}`,
                  `ID: ${collector.id}`,
                  "",
                  "Update Supabase collector_relationships:",
                  "- status",
                  "- last_outreach_at",
                  "- next_move / next_move_due_at",
                  "- estimated_value",
                  "- supporting docs"
                ].join("\n");

                await fetch("/api/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title,
                    description,
                    agentKey: "avery",
                    priority: "high",
                    executionType: "data",
                    requiresApproval: false
                  })
                }).catch(() => undefined);
              }}
            >
              Create update task
            </button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, "day");
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

