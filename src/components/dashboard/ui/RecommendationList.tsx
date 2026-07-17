import { AutoLinkText } from "./AutoLinkText";

export type RecommendationListItem = {
  id: string;
  title: string;
  whyNow?: string | null;
  impact?: string | null;
  evidence?: string | null;
  confidence?: string | null;
  nextStep?: string | null;
  owner?: string | null;
  badges?: string[];
};

export function RecommendationList({ items, empty }: { items: RecommendationListItem[]; empty: string }) {
  if (!items.length) {
    return <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-400">{empty}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              {item.owner ? <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Owner: {item.owner}</p> : null}
            </div>
            {item.badges?.length ? (
              <div className="flex flex-wrap gap-2">
                {item.badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-zinc-300">
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <dl className="mt-3 grid gap-3 text-xs text-zinc-300 md:grid-cols-2 lg:grid-cols-3">
            <RecommendationField label="Why now" value={item.whyNow} />
            <RecommendationField label="Impact" value={item.impact} />
            <RecommendationField label="Evidence" value={item.evidence} />
            <RecommendationField label="Confidence" value={item.confidence} />
            <RecommendationField label="Next step" value={item.nextStep} />
          </dl>
        </article>
      ))}
    </div>
  );
}

function RecommendationField({ label, value }: { label: string; value?: string | null }) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return (
      <div>
        <dt className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</dt>
        <dd className="mt-1 text-sm text-zinc-500">—</dd>
      </div>
    );
  }

  const isUrl = /^https?:\/\//i.test(trimmed);
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm">
        {isUrl ? (
          <a
            href={trimmed}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline decoration-dotted underline-offset-4"
          >
            {trimmed}
          </a>
        ) : (
          <AutoLinkText value={trimmed} />
        )}
      </dd>
    </div>
  );
}
