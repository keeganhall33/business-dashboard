"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDashboardRefresh } from "@/lib/dashboard/events";

export function CollectorInlineForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    collectorName: "",
    tier: "A",
    relationshipStatus: "warm",
    nextMove: "",
    nextMoveDueAt: "",
    estimatedValue: ""
  });

  function handleChange(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-xs uppercase tracking-[0.2em] text-emerald-400"
        disabled={pending}
      >
        {open ? "Close" : "Add collector"}
      </button>
      {open && (
        <form
          className="mt-3 grid gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const payload = {
                  collectorName: form.collectorName,
                  tier: form.tier as "A" | "B",
                  relationshipStatus: form.relationshipStatus,
                  nextMove: form.nextMove || undefined,
                  nextMoveDueAt: form.nextMoveDueAt || undefined,
                  estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined
                };
                const res = await fetch("/api/collectors", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(body?.message ?? "Request failed");
                }
                setForm({ collectorName: "", tier: form.tier, relationshipStatus: form.relationshipStatus, nextMove: "", nextMoveDueAt: "", estimatedValue: "" });
                setOpen(false);
                router.refresh();
                requestDashboardRefresh({ reason: "collector-inline" });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Name</span>
            <input
              required
              aria-label="Name"
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={form.collectorName}
              onChange={(e) => handleChange("collectorName", e.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Tier
              <select
                aria-label="Tier"
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
                value={form.tier}
                onChange={(e) => handleChange("tier", e.target.value)}
              >
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Status
              <input
                aria-label="Status"
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
                value={form.relationshipStatus}
                onChange={(e) => handleChange("relationshipStatus", e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Next move
            <input
              aria-label="Next move"
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={form.nextMove}
              onChange={(e) => handleChange("nextMove", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Next move due (YYYY-MM-DD)
            <input
              type="date"
              aria-label="Next move due"
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={form.nextMoveDueAt}
              onChange={(e) => handleChange("nextMoveDueAt", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Estimated value
            <input
              type="number"
              step="1000"
              aria-label="Estimated value"
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={form.estimatedValue}
              onChange={(e) => handleChange("estimatedValue", e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-2xl border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-emerald-300"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </form>
      )}
    </div>
  );
}
