"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDashboardRefresh } from "@/lib/dashboard/events";

type Props = {
  cashOnHand: number | null;
  monthlyBurn: number | null;
  projected30dRevenue: number | null;
  survivalFloor: number;
};

export function FinanceInlineForm({ cashOnHand, monthlyBurn, projected30dRevenue, survivalFloor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    cashOnHand: cashOnHand ?? 0,
    monthlyBurn: monthlyBurn ?? 0,
    projected30dRevenue: projected30dRevenue ?? 0,
    survivalFloor: survivalFloor ?? 7000
  });
  const [error, setError] = useState<string | null>(null);

  function handleChange(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: Number(value) }));
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-xs uppercase tracking-[0.2em] text-emerald-400"
        disabled={pending}
      >
        {open ? "Close" : "Edit"}
      </button>
      {open && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const res = await fetch("/api/finance/snapshot", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(form)
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(body?.message ?? "Request failed");
                }
                setOpen(false);
                router.refresh();
                requestDashboardRefresh({ reason: "finance-inline" });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            });
          }}
        >
          <Field label="Cash on hand" value={form.cashOnHand} onChange={(value) => handleChange("cashOnHand", value)} />
          <Field label="Monthly burn" value={form.monthlyBurn} onChange={(value) => handleChange("monthlyBurn", value)} />
          <Field label="30d projection" value={form.projected30dRevenue} onChange={(value) => handleChange("projected30dRevenue", value)} />
          <Field label="Survival floor" value={form.survivalFloor} onChange={(value) => handleChange("survivalFloor", value)} />
          <button
            type="submit"
            className="rounded-2xl border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
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

type FieldProps = {
  label: string;
  value: number;
  onChange: (value: string) => void;
};

function Field({ label, value, onChange }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      <input
        type="number"
        step="100"
        className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
