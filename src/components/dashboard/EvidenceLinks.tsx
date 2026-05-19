"use client";

import { useMemo, useState, useTransition } from "react";
import type { DeliverableLink } from "@/lib/types/dashboard";

type Props = {
  docs?: DeliverableLink[] | null;
  entityLabel: string;
  entityName: string;
  entityId?: string | null;
  ownerAgent?: string | null;
  max?: number;
};

const DEFAULT_PLACEHOLDERS: DeliverableLink[] = [
  { label: "Brief", url: "" },
  { label: "Email", url: "" },
  { label: "Research", url: "" }
];

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
      <div className="mt-2 flex flex-wrap gap-2">
        {hasDocs
          ? visibleDocs.map((doc) => (
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
          : DEFAULT_PLACEHOLDERS.slice(0, max).map((placeholder) => (
              <span
                key={placeholder.label}
                className="rounded-full border border-zinc-900 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-600"
                title="No evidence linked yet"
              >
                {placeholder.label}
              </span>
            ))}

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
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
