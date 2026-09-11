"use client";

import { useState } from "react";
import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import { toDecisionRoomViewModelV1 } from "@/lib/decision-room/shell-adapter";
import type { ExecutiveHomeDecisionRoomDrilldownV1 } from "@/lib/executive-home/decision-room-drilldown";
import type { ExecutiveHomeFixtureV1, ExecutiveIntelligenceCardV1 } from "@/lib/executive-home/fixtures";
import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";
import { ExecutiveCommandCenter } from "./ExecutiveCommandCenter";
import { ExecutiveHomeVisualSummaryV2 } from "./ExecutiveHomeVisualSummaryV2";
import { ExecutiveIntelligenceCard } from "./ExecutiveIntelligenceCard";
import { LightBadge, stateTone } from "./IntelligencePrimitives";

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

export const EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT = 4;

export function visibleExecutiveHomeCards(
  cards: ExecutiveIntelligenceCardV1[],
  expanded: boolean,
  limit = EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT
) {
  return expanded ? cards : cards.slice(0, limit);
}

export function toggleExecutiveHomeSection(
  current: ReadonlySet<ExecutiveIntelligenceCardV1["section"]>,
  sectionId: ExecutiveIntelligenceCardV1["section"]
) {
  const next = new Set(current);
  if (next.has(sectionId)) next.delete(sectionId);
  else next.add(sectionId);
  return next;
}

export function ExecutiveHomeShell({
  data,
  decisionRoom
}: {
  data: ExecutiveHomeFixtureV1;
  decisionRoom?: ExecutiveHomeDecisionRoomDrilldownV1;
}) {
  const [activeDecisionRoomId, setActiveDecisionRoomId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<ExecutiveIntelligenceCardV1["section"]>>(() => new Set());
  const isDecisionRoomOpen = Boolean(decisionRoom && activeDecisionRoomId === decisionRoom.decision_id);

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-stone-950">
      <ExecutiveHomeVisualSummaryV2 data={data} />

      <div className="hidden" aria-hidden="true" data-testid="executive-home-hidden-status-copy">
        <span>Light-first intelligence dashboard</span>
        <span>Executive Home visual scan</span>
        <span>{data.loading_state}</span>
        <span>{data.empty_state}</span>
        <span>{data.error_state}</span>
      </div>

      <details className="border-y border-stone-200 bg-[#f8f4ec]">
        <summary className="mx-auto flex w-full max-w-[1600px] cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-semibold text-stone-800 sm:px-6 lg:px-8">
          <span>Operational detail and specialist signals</span>
          <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600">Open deeper view</span>
        </summary>
        <ExecutiveCommandCenter
          data={data.command_center}
          onOpenDecisionRoom={decisionRoom ? (decisionRoomId) => setActiveDecisionRoomId(decisionRoomId) : undefined}
        />
      </details>

      <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <details className="mt-5 rounded-3xl border border-stone-200 bg-[#fffdf8] shadow-sm">
          <summary className="cursor-pointer list-none p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Supporting intelligence</p>
                <h2 className="mt-1 text-lg font-semibold text-stone-950">Workspaces, evidence and lower-priority signals</h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">Executive Home stays concise while deeper work remains in its owning workspaces.</p>
              </div>
              <span className="mt-2 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600 sm:mt-0">Explore</span>
            </div>
          </summary>

          <div className="border-t border-stone-200 p-4 sm:p-5">
            <section aria-label="Workspace shortcuts">
              <div className="mb-3 flex w-full max-w-full flex-wrap gap-2 items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-950">Owning workspaces</h3>
                {decisionRoom ? (
                  <a
                    href={`#${decisionRoom.decision_id}`}
                    onClick={() => setActiveDecisionRoomId(decisionRoom.decision_id)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700"
                  >
                    Jump to grounded drill-down
                  </a>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Decision evidence UNKNOWN</span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {EXECUTIVE_WORKSPACE_NAV_V1.filter((item) => item.id !== "EXECUTIVE_HOME").map((item) => (
                  <a key={item.href} href={item.href} className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm hover:border-stone-300">
                    <div className="text-sm font-semibold text-stone-950">{item.label}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{item.summary}</div>
                  </a>
                ))}
              </div>
            </section>

            <div className="mt-7 space-y-8">
              {sections.map((section) => {
                const cards = data.cards.filter((card) => card.section === section.id);
                const isExpanded = expandedSections.has(section.id);
                const visibleCards = visibleExecutiveHomeCards(cards, isExpanded);
                const hasOverflow = cards.length > EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT;
                const cardGridId = `executive-home-cards-${section.id}`;

                return (
                  <section key={section.id} id={section.id}>
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div className="max-w-3xl">
                        <h2 className="text-xl font-semibold tracking-normal text-stone-950">{section.label}</h2>
                        <p className="mt-1 text-sm leading-6 text-stone-600">{section.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <LightBadge label={`${cards.length} signals`} tone="stone" />
                        {cards[0] ? <LightBadge label={cards[0].state} tone={stateTone(cards[0].state)} /> : null}
                      </div>
                    </div>
                    <div id={cardGridId} className="grid gap-4 lg:grid-cols-2">
                      {visibleCards.map((card) => (
                        <ExecutiveIntelligenceCard
                          key={card.id}
                          card={card}
                          decisionRoomId={decisionRoom && card.id === decisionRoom.source_card_id ? decisionRoom.decision_id : undefined}
                          onOpenDecisionRoom={decisionRoom && card.id === decisionRoom.source_card_id ? () => setActiveDecisionRoomId(decisionRoom.decision_id) : undefined}
                        />
                      ))}
                    </div>
                    {hasOverflow ? (
                      <div className="mt-4 flex justify-center sm:justify-start">
                        <button
                          type="button"
                          aria-controls={cardGridId}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Show less" : "View more"} ${section.label} signals`}
                          onClick={() => setExpandedSections((current) => toggleExecutiveHomeSection(current, section.id))}
                          className="w-full rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm sm:w-auto"
                        >
                          {isExpanded ? "Show less" : `View more (${cards.length - EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT})`}
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </details>

        <section id="decision-room-drilldown" className="mt-8" aria-label="Executive Home Decision Room drill-down">
          <div className="mb-3 flex flex-col gap-3 rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Grounded drill-down</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal text-stone-950">Decision Room detail</h2>
              <p className="mt-1 text-sm leading-6 text-stone-700">Open a Home recommendation or specialist signal to inspect WHY, evidence, unknowns, counterargument, next move, and contextual Ask Jeeves.</p>
            </div>
            {isDecisionRoomOpen && decisionRoom ? (
              <button type="button" onClick={() => setActiveDecisionRoomId(null)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Back to Executive Home
              </button>
            ) : decisionRoom ? (
              <a href={`#${decisionRoom.source_card_id}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-center text-sm font-semibold text-stone-800">
                Choose recommendation above
              </a>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">UNAVAILABLE</span>
            )}
          </div>
          {isDecisionRoomOpen && decisionRoom ? (
            <>
              <RecommendationComparisonContinuity decisionRoom={decisionRoom} />
              <DecisionRoom decision={decisionRoom} />
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-5 text-sm leading-6 text-stone-700">
              {decisionRoom
                ? "No Decision Room is open. Use a grounded Home recommendation or specialist signal to inspect its canonical evidence."
                : "Decision Room evidence is unavailable. Supply a canonical drill-down record before presenting recommendation detail."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function RecommendationComparisonContinuity({ decisionRoom }: { decisionRoom: ExecutiveHomeDecisionRoomDrilldownV1 }) {
  const viewModel = toDecisionRoomViewModelV1(decisionRoom);
  const options = viewModel.alternatives.slice(0, 4);
  const truthStates = ["KNOWN", "INFERRED", "UNKNOWN", "CONFLICTED"] as const;
  const truthCounts = truthStates.map((truthState) => ({
    truthState,
    count: viewModel.evidence_refs.filter((ref) => ref.truth_state === truthState).length
  }));
  const explicitRiskStates = truthCounts.filter((item) => item.truthState === "UNKNOWN" || item.truthState === "CONFLICTED" || item.count > 0);

  return (
    <section data-testid="executive-comparison-continuity" className="mb-4 rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm" aria-label="Recommendation comparison continuity">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Comparison continuity</p>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-stone-950">{viewModel.current_recommendation.title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-700">
            Confidence {viewModel.confidence} · {viewModel.approval_class}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-700 lg:max-w-md">
          <span className="font-semibold text-stone-950">Next action:</span> {viewModel.next_action}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Options carried forward</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <div key={option.alternative_id} data-testid="executive-comparison-continuity-option" className="rounded-2xl border border-stone-200 bg-white p-3">
                <p className="text-sm font-semibold text-stone-950">{option.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{option.tradeoff}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Evidence state</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {explicitRiskStates.map((item) => (
              <span key={item.truthState} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                {item.truthState} {item.count}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-600">
            Source drill-down remains in Decision Room; UNKNOWN and CONFLICTED evidence stays explicit during navigation.
          </p>
        </div>
      </div>
    </section>
  );
}
