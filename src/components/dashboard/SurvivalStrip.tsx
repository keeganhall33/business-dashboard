import { SurvivalStrip as SurvivalStripData } from "@/lib/types/dashboard";
import { FinanceInlineForm } from "./FinanceInlineForm";

type Props = { data: SurvivalStripData };

export function SurvivalStrip({ data }: Props) {
  if (!data) return null;

  const coverage = data.cashOnHand != null && data.survivalFloor > 0 ? Math.min(100, Math.round((data.cashOnHand / data.survivalFloor) * 100)) : null;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/95 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Survival runway</div>
          {data.configured ? (
            <div className="mt-2">
              <div className="text-3xl font-semibold text-zinc-50">
                {formatCurrency(data.cashOnHand)} <span className="text-base font-normal text-zinc-500">cash on hand</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-zinc-900">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{ width: `${coverage ?? 0}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Floor {formatCurrency(data.survivalFloor)} • Coverage {coverage != null ? `${coverage}%` : "—"}
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
              Add cash, burn, and projection numbers to activate the survival strip.
            </div>
          )}
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">30d projection</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-50">{formatCurrency(data.projected30dRevenue)}</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Runway</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-50">
              {data.runwayDays != null ? `${data.runwayDays}d` : "—"}
            </div>
            {data.monthlyBurn != null && (
              <div className="text-xs text-zinc-500">Burn {formatCurrency(data.monthlyBurn)}/mo</div>
            )}
          </div>
        </div>
      </div>
      <FinanceInlineForm
        cashOnHand={data.cashOnHand ?? 0}
        monthlyBurn={data.monthlyBurn ?? 0}
        projected30dRevenue={data.projected30dRevenue ?? 0}
        survivalFloor={data.survivalFloor}
      />
    </section>
  );
}

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
