"use client";

import { useState } from "react";
import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import { EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1, type ExecutiveHomeDecisionRoomDrilldownV1 } from "@/lib/executive-home/decision-room-drilldown";
import type { ExecutiveHomeFixtureV1, ExecutiveIntelligenceCardV1 } from "@/lib/executive-home/fixtures";
import { ExecutiveIntelligenceCard } from "./ExecutiveIntelligenceCard";

const sections: Array<{ id: ExecutiveIntelligenceCardV1["section"]; label: string; description: string }> = [
  { id: "WHAT_MATTERS_NOW", label: "What matters now", description: "The smallest set of high-value changes and decisions." },
  { id: "WHAT_CHANGED", label: "What changed", description: "Material changes only; routine noise stays silent." },
  { id: "DO_NOW_PREPARE_MONITOR", label: "Do now / prepare / monitor", description: "Triage without turning Home into an action wall." },
  { id: "KEEGAN_ACTION_REQUIRED", label: "Keegan action required", description: "Approval-gated work is visually distinct from awareness." },
  { id: "TOP_OPPORTUNITIES", label: "Top opportunities", description: "Opportunity value with uncertainty and evidence preserved." },
  { id: "CURRENT_HYPOTHESES_EXPERIMENTS", label: "Current hypotheses / experiments", description: "Open questions and tests, not facts." },
  { id: "LEARNING_SINCE_LAST_REVIEW", label: "Learning since last review", description: "What the system learned and what changed because of it." },
  { id: "DATA_COVERAGE_GAPS", label: "Data / coverage gaps", description: "UNKNOWN, STALE, and CONFLICTED states stay explicit." }
];

export function ExecutiveHomeShell({
  data,
  decisionRoom = EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1
}: {
  data: ExecutiveHomeFixtureV1;
  decisionRoom?: ExecutiveHomeDecisionRoomDrilldownV1;
}) {
  const [activeDecisionRoomId, setActiveDecisionRoomId] = useState<string | null>(null);
  const isDecisionRoomOpen = activeDecisionRoomId === decisionRoom.decision_id;

  return (
    <main className="min-h-screen bg-[#f7f2ea] px-4 py-6 text-stone-950 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Light-first intelligence dashboard</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-normal text-stone-950 md:text-5xl">{data.hero.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700">{data.hero.summary}</p>
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <StatePlaceholder label="Loading" value={data.loading_state} />
            <StatePlaceholder label="Empty" value={data.empty_state} />
            <StatePlaceholder label="Error" value={data.error_state} />
          </div>
        </header>

        <nav aria-label="Executive Home sections" className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm">
              {section.label}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-8">
          {sections.map((section) => {
            const cards = data.cards.filter((card) => card.section === section.id);
            return (
              <section key={section.id} id={section.id}>
                <div className="mb-3 max-w-3xl">
                  <h2 className="text-xl font-semibold tracking-normal text-stone-950">{section.label}</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{section.description}</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {cards.map((card) => (
                    <ExecutiveIntelligenceCard
                      key={card.id}
                      card={card}
                      decisionRoomId={card.id === decisionRoom.source_card_id ? decisionRoom.decision_id : undefined}
                      onOpenDecisionRoom={card.id === decisionRoom.source_card_id ? () => setActiveDecisionRoomId(decisionRoom.decision_id) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section id="decision-room-drilldown" className="mt-8" aria-label="Executive Home Decision Room drill-down">
          <div className="mb-3 flex flex-col gap-3 rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Grounded drill-down</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal text-stone-950">Decision Room detail</h2>
              <p className="mt-1 text-sm leading-6 text-stone-700">Open the Home recommendation to inspect WHY, evidence, unknowns, counterargument, next move, and contextual Ask Jeeves.</p>
            </div>
            {isDecisionRoomOpen ? (
              <button type="button" onClick={() => setActiveDecisionRoomId(null)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Back to Executive Home
              </button>
            ) : (
              <a href={`#${decisionRoom.source_card_id}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-center text-sm font-semibold text-stone-800">
                Choose recommendation above
              </a>
            )}
          </div>
          {isDecisionRoomOpen ? (
            <DecisionRoom decision={decisionRoom} />
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-5 text-sm leading-6 text-stone-700">
              No Decision Room is open. Use the Home recommendation card to drill down without losing Executive Home orientation.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatePlaceholder({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="mt-1 leading-6 text-stone-800">{value}</div>
    </div>
  );
}
