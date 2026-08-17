import type { ExecutiveIntelligenceCardV1 } from "@/lib/executive-home/fixtures";
import { LightBadge, approvalTone, confidenceTone, domainTone, freshnessTone, priorityTone, stateTone } from "./IntelligencePrimitives";

export function ExecutiveIntelligenceCard({ card }: { card: ExecutiveIntelligenceCardV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300 hover:shadow-md focus-within:border-stone-400">
      <div className="flex flex-wrap gap-2">
        <LightBadge label={card.state} tone={stateTone(card.state)} />
        <LightBadge label={card.priority} tone={priorityTone(card.priority)} />
        <LightBadge label={`Confidence ${card.confidence}`} tone={confidenceTone(card.confidence)} />
        <LightBadge label={card.freshness} tone={freshnessTone(card.freshness)} />
        <LightBadge label={card.approval_state} tone={approvalTone(card.approval_state)} />
        <LightBadge label={card.specialist_domain} tone={domainTone(card.specialist_domain)} />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-normal text-stone-950">{card.title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-700">{card.summary}</p>
      <details className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-stone-950">WHY / EVIDENCE / NEXT ACTION</summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
          <p><strong className="text-stone-950">Why:</strong> {card.why}</p>
          <div>
            <strong className="text-stone-950">Evidence:</strong>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {card.evidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <p><strong className="text-stone-950">Next action:</strong> {card.next_action}</p>
        </div>
      </details>
    </article>
  );
}
