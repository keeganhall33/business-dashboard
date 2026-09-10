import Link from "next/link";
import { getSpecialistCapabilityStatusV1 } from "@/lib/executive-home/specialist-command-center";

export default function GoalsCapacitySpecialistPage() {
  const capability = getSpecialistCapabilityStatusV1().find((item) => item.id === "goals-capacity")!;

  return (
    <main className="space-y-5">
      <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Specialist drill-down</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-stone-950">Goals / Capacity</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">
          Production capacity intelligence appears here only when verified goals and workload evidence supports it.
        </p>
      </header>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="goals-capacity-coverage-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Production coverage</p>
            <h2 id="goals-capacity-coverage-title" className="mt-1 text-xl font-semibold text-stone-950">
              Goals and capacity intelligence {capability.availability.toLowerCase()}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {capability.availability}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {capability.truth_state}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              FRESHNESS: {capability.evidence_freshness}
            </span>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 md:grid-cols-3">
          <CoverageDetail label="What can be trusted" value={capability.can_trust} />
          <CoverageDetail label="Missing evidence" value={capability.missing_evidence} />
          <CoverageDetail label="Next safe step" value={capability.next_safe_step} />
        </dl>
      </section>

      <section className="rounded-3xl border border-dashed border-stone-300 bg-[#fffdf8] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Decision boundary</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
          Portfolio pressure, workload conflicts, deadlines, priorities, and recommended actions remain unavailable until verified production evidence is supplied. Test fixtures are not used as live business truth.
        </p>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Goals and capacity navigation">
        <Link href="/specialists" className="inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
          Back to Specialists
        </Link>
        <Link href="/data-evidence" className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
          Open Data &amp; Evidence
        </Link>
        <Link href="/dashboard" className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
          Executive Home
        </Link>
      </nav>
    </main>
  );
}

function CoverageDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-stone-700">{value}</dd>
    </div>
  );
}
