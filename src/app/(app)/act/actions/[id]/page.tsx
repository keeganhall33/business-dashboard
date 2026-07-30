import { notFound } from "next/navigation";
import { VerticalSliceCard, Pill } from "@/components/vertical-slice/VerticalSliceCard";

type PageProps = {
  params: Promise<{ id: string }>;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export default async function ActionDetailsPage({ params }: PageProps) {
  const { id } = await params;

  const actionRes = await fetchJson(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/actions/${id}`).catch(() => null);
  if (!actionRes?.ok) return notFound();
  const action = actionRes.action as { [key: string]: JsonValue };

  const auditRes = await fetchJson(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/actions/${id}/audit`).catch(() => ({ ok: true, audit: [] as JsonValue[] }));
  const audit = (auditRes.audit ?? []) as { [key: string]: JsonValue }[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Action</h1>
        <p className="text-sm text-zinc-400">Details, evidence, measurement, and audit (no execution).</p>
      </header>

      <VerticalSliceCard title={String(action.title ?? "")} subtitle={`${String(action.category ?? "")} • ${String(action.channel ?? "")}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="zinc">{String(action.status ?? "")}</Pill>
          <Pill tone="zinc">{String(action.current_level ?? "")}</Pill>
          <Pill tone="zinc">approval {String(action.approval_level ?? "")}</Pill>
          <Pill tone="zinc">confidence {String(action.confidence ?? "")}</Pill>
        </div>
        {action.evidence_snapshot_hash ? (
          <div className="mt-3 text-xs text-zinc-500">Evidence hash: {String(action.evidence_snapshot_hash).slice(0, 20)}…</div>
        ) : null}
      </VerticalSliceCard>

      <VerticalSliceCard title="Evidence (immutable snapshot)" subtitle="Stored separately from later evidence used for revalidation.">
        <pre className="max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-200">
          {JSON.stringify(action.evidence_snapshot ?? {}, null, 2)}
        </pre>
      </VerticalSliceCard>

      <VerticalSliceCard title="Prepared assets" subtitle="Drafts + previews. Editing is allowed only at the readiness boundary.">
        <pre className="max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-200">
          {JSON.stringify(action.prepared_assets ?? [], null, 2)}
        </pre>
      </VerticalSliceCard>

      <VerticalSliceCard title="Execution preview (execution disabled)" subtitle="Must include preview/steps; approval updates internal state only.">
        <pre className="max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-200">
          {JSON.stringify(action.execution_plan ?? {}, null, 2)}
        </pre>
      </VerticalSliceCard>

      <VerticalSliceCard title="Measurement plan" subtitle="Required before approval.">
        <pre className="max-h-[260px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-200">
          {JSON.stringify(action.measurement_window ?? {}, null, 2)}
        </pre>
      </VerticalSliceCard>

      <VerticalSliceCard title="Audit trail" subtitle="Every transition must be audited with an idempotency key.">
        <div className="space-y-2">
          {audit.length ? (
            audit.map((e, idx) => (
              <div key={String(e.id ?? idx)} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs text-zinc-400">{String(e.created_at ?? "")} • {String(e.actor ?? "")} • {String(e.event_type ?? "")}</div>
                <div className="mt-1 text-xs text-zinc-500">{String(e.from_status ?? "")} → {String(e.to_status ?? "")}</div>
                {e.idempotency_key ? <div className="mt-1 text-[11px] text-zinc-500">idempotency: {String(e.idempotency_key)}</div> : null}
                {e.note ? <div className="mt-2 text-xs text-zinc-200">{String(e.note)}</div> : null}
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">No audit events.</div>
          )}
        </div>
      </VerticalSliceCard>
    </div>
  );
}
