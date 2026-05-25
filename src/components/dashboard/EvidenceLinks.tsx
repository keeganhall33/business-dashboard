"use client";

import { useMemo, useState, useTransition } from "react";
import type { DeliverableLink } from "@/lib/types/dashboard";
import { Drawer } from "./ui/Drawer";

type Props = {
  docs?: DeliverableLink[] | null;
  entityLabel: string;
  entityName: string;
  entityId?: string | null;
  ownerAgent?: string | null;
  max?: number;
};

export function EvidenceLinks({
  docs,
  entityLabel,
  entityName,
  entityId,
  ownerAgent,
  max = 3
}: Props) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const normalizedDocs = useMemo(() => {
    const list = Array.isArray(docs) ? docs : [];
    return list
      .map((doc) => ({
        label: String(doc.label ?? "").trim(),
        url: String(doc.url ?? "").trim()
      }))
      .filter((doc) => Boolean(doc.label) && Boolean(doc.url));
  }, [docs]);

  const hasDocs = normalizedDocs.length > 0;
  const visibleDocs = normalizedDocs.slice(0, max);

  function requestProof() {
    if (requested) return;
    setError(null);
    startTransition(async () => {
      try {
        const owner = (ownerAgent && ownerAgent.trim()) || "avery";
        const title = `Proof needed: ${entityLabel} — ${entityName}`;
        const descriptionLines = [
          `Entity: ${entityLabel}`,
          `Name: ${entityName}`,
          entityId ? `ID: ${entityId}` : null,
          "",
          "Add up to 3 evidence links to Supabase:",
          "- source (URL or text containing URL)",
          "- notes_md (paste URLs inline)",
          "- deliverables / deliverable_links (JSON array of {label,url})",
          "",
          "Once links exist, they will render as Evidence buttons on the Command Center card."
        ].filter(Boolean);

        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: descriptionLines.join("\n"),
            agentKey: owner,
            priority: "high",
            executionType: "data",
            requiresApproval: false
          })
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Failed to create proof request (${response.status}).`);
        }

        setRequested(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`${entityLabel} evidence`}
        description={entityName}
        widthClassName="sm:max-w-2xl"
      >
        {hasDocs ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Links</div>
              <div className="mt-3 grid gap-2">
                {normalizedDocs.map((doc) => (
                  <a
                    key={`${doc.label}|${doc.url}`}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 transition hover:border-white/20"
                  >
                    <span className="font-semibold">{doc.label}</span>
                    <span className="truncate text-xs text-zinc-400">{doc.url}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-400">
            No evidence links yet.
          </div>
        )}
      </Drawer>

      <div className="mt-2 flex flex-wrap gap-2">
        {hasDocs ? (
          visibleDocs.map((doc) => (
            <a
              key={`${doc.label}|${doc.url}`}
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-700"
            >
              {doc.label}
            </a>
          ))
        ) : (
          <span className="rounded-full border border-zinc-900 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-600" title="No evidence linked yet">
            No evidence
          </span>
        )}

        {hasDocs && normalizedDocs.length > max ? (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-200 hover:border-white/15"
          >
            View all ({normalizedDocs.length})
          </button>
        ) : null}

        {!hasDocs ? (
          <button
            type="button"
            disabled={isPending || requested}
            onClick={requestProof}
            className="rounded-full border border-amber-700/60 bg-amber-900/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-900/20 disabled:opacity-50"
            title="Create a task to request proof / evidence links"
          >
            {requested ? "Proof requested" : isPending ? "Requesting…" : "Request proof"}
          </button>
        ) : null}

        {hasDocs ? (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-200 hover:border-white/15"
            title="Open evidence drawer"
          >
            Open
          </button>
        ) : null}
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
