import type { ExecutiveIntelligenceCardV1 } from "@/lib/executive-home/fixtures";
import { EvidenceBar, LightBadge, VisualSignalPill, approvalTone, confidenceEmphasis, confidenceTone, domainTone, freshnessTone, priorityEmphasis, priorityTone, stateTone } from "./IntelligencePrimitives";

export function ExecutiveIntelligenceCard({
  card,
  decisionRoomId,
  onOpenDecisionRoom
}: {
  card: ExecutiveIntelligenceCardV1;
  decisionRoomId?: string;
  onOpenDecisionRoom?: () => void;
}) {
  return (
    <article id={card.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300 hover:shadow-md focus-within:border-stone-400">
      <div className="flex flex-wrap gap-2">
        <LightBadge label={card.state} tone={stateTone(card.state)} />
        <LightBadge label={card.priority} tone={priorityTone(card.priority)} />
        <LightBadge label={`Confidence ${card.confidence}`} tone={confidenceTone(card.confidence)} />
        <LightBadge label={card.freshness} tone={freshnessTone(card.freshness)} />
        <LightBadge label={card.approval_state} tone={approvalTone(card.approval_state)} />
        <LightBadge label={card.specialist_domain} tone={domainTone(card.specialist_domain)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_190px]">
        <div>
          <h3 className="text-lg font-semibold tracking-normal text-stone-950">{card.title}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-700">{card.summary}</p>
        </div>
        <div className="grid gap-2">
          <VisualSignalPill label="Priority" value={card.priority.replaceAll("_", " ")} tone={priorityTone(card.priority)} />
          <VisualSignalPill label="Evidence state" value={card.state} tone={stateTone(card.state)} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 rounded-2xl border border-stone-200 bg-[#fffdf8] p-3 md:grid-cols-2">
        <EvidenceBar label="Confidence" tone={confidenceTone(card.confidence)} emphasis={confidenceEmphasis(card.confidence)} />
        <EvidenceBar label="Urgency" tone={priorityTone(card.priority)} emphasis={priorityEmphasis(card.priority)} />
      </div>
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
      {decisionRoomId && onOpenDecisionRoom ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenDecisionRoom}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm"
            aria-controls={decisionRoomId}
          >
            Open Decision Room
          </button>
          <a
            href={`#${decisionRoomId}`}
            onClick={onOpenDecisionRoom}
            className="text-sm font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4"
            aria-controls={decisionRoomId}
          >
            Jump to grounded drill-down
          </a>
        </div>
      ) : null}
    </article>
  );
}
