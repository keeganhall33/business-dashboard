import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import {
  EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT,
  ExecutiveHomeShell,
  toggleExecutiveHomeSection,
  visibleExecutiveHomeCards
} from "@/components/executive-home/ExecutiveHomeShell";
import {
  EXECUTIVE_HOME_FIXTURE_V1,
  type ExecutiveHomeFixtureV1,
  type ExecutiveIntelligenceCardV1
} from "@/lib/executive-home/fixtures";

function cloneCard(
  base: ExecutiveIntelligenceCardV1,
  id: string,
  title: string,
  overrides: Partial<ExecutiveIntelligenceCardV1> = {}
): ExecutiveIntelligenceCardV1 {
  return {
    ...base,
    id,
    title,
    ...overrides
  };
}

function buildAttentionFixture(): ExecutiveHomeFixtureV1 {
  const matters = EXECUTIVE_HOME_FIXTURE_V1.cards.find((card) => card.section === "WHAT_MATTERS_NOW");
  const changed = EXECUTIVE_HOME_FIXTURE_V1.cards.find((card) => card.section === "WHAT_CHANGED");
  const opportunity = EXECUTIVE_HOME_FIXTURE_V1.cards.find((card) => card.section === "TOP_OPPORTUNITIES");
  assert.ok(matters);
  assert.ok(changed);
  assert.ok(opportunity);

  return {
    ...EXECUTIVE_HOME_FIXTURE_V1,
    cards: [
      ...EXECUTIVE_HOME_FIXTURE_V1.cards,
      cloneCard(matters, "matters-extra-1", "Matters extra 1"),
      cloneCard(matters, "matters-extra-2", "Matters extra 2"),
      cloneCard(matters, "matters-extra-3", "Matters extra 3"),
      cloneCard(matters, "matters-extra-4", "Matters extra 4", {
        state: "UNKNOWN",
        confidence: "UNKNOWN",
        freshness: "UNKNOWN",
        approval_state: "KEEGAN_ACTION_REQUIRED"
      }),
      cloneCard(matters, "matters-extra-5", "Matters extra 5", { state: "CONFLICTED" }),
      cloneCard(changed, "changed-extra-1", "Changed extra 1"),
      cloneCard(changed, "changed-extra-2", "Changed extra 2"),
      cloneCard(changed, "changed-extra-3", "Changed extra 3"),
      cloneCard(changed, "changed-extra-4", "Changed extra 4", { state: "STALE", freshness: "STALE" }),
      cloneCard(opportunity, "opportunity-extra-1", "Opportunity extra 1"),
      cloneCard(opportunity, "opportunity-extra-2", "Opportunity extra 2"),
      cloneCard(opportunity, "opportunity-extra-3", "Opportunity extra 3")
    ]
  };
}

const attentionFixture = buildAttentionFixture();
const html = renderToString(<ExecutiveHomeShell data={attentionFixture} />);

test("Executive Home caps every section at four cards by default while preserving the full count", () => {
  assert.equal(EXECUTIVE_HOME_SECTION_DEFAULT_LIMIT, 4);
  assert.match(html, /6 signals/);
  assert.match(html, /5 signals/);
  assert.match(html, /4 signals/);

  assert.match(html, /Matters extra 1/);
  assert.match(html, /Matters extra 2/);
  assert.match(html, /Matters extra 3/);
  assert.doesNotMatch(html, /Matters extra 4/);
  assert.doesNotMatch(html, /Matters extra 5/);

  assert.match(html, /Changed extra 1/);
  assert.match(html, /Changed extra 2/);
  assert.match(html, /Changed extra 3/);
  assert.doesNotMatch(html, /Changed extra 4/);

  assert.match(html, /Opportunity extra 1/);
  assert.match(html, /Opportunity extra 2/);
  assert.match(html, /Opportunity extra 3/);
});

test("overflow sections expose native accessible disclosure controls and sections at four do not", () => {
  assert.match(html, /aria-label="View more What matters now signals"/);
  assert.match(html, /aria-label="View more What changed signals"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="executive-home-cards-WHAT_MATTERS_NOW"/);
  assert.match(html, /aria-controls="executive-home-cards-WHAT_CHANGED"/);
  assert.doesNotMatch(html, /aria-label="View more Top opportunities signals"/);
  assert.equal(html.match(/>View more \(/g)?.length, 2);
  assert.match(html, /w-full rounded-full[^>]*sm:w-auto/);
});

test("section expansion is isolated, preserves order, reveals all cards, and toggles back to the cap", () => {
  const mattersCards = attentionFixture.cards.filter((card) => card.section === "WHAT_MATTERS_NOW");
  const changedCards = attentionFixture.cards.filter((card) => card.section === "WHAT_CHANGED");
  const originalMattersOrder = mattersCards.map((card) => card.id);

  const none = new Set<ExecutiveIntelligenceCardV1["section"]>();
  const mattersExpanded = toggleExecutiveHomeSection(none, "WHAT_MATTERS_NOW");
  assert.equal(mattersExpanded.has("WHAT_MATTERS_NOW"), true);
  assert.equal(mattersExpanded.has("WHAT_CHANGED"), false);
  assert.deepEqual(visibleExecutiveHomeCards(mattersCards, true).map((card) => card.id), originalMattersOrder);
  assert.deepEqual(
    visibleExecutiveHomeCards(changedCards, false).map((card) => card.id),
    changedCards.slice(0, 4).map((card) => card.id)
  );

  const revealedUnknown = visibleExecutiveHomeCards(mattersCards, true).find((card) => card.id === "matters-extra-4");
  assert.ok(revealedUnknown);
  assert.equal(revealedUnknown.state, "UNKNOWN");
  assert.equal(revealedUnknown.confidence, "UNKNOWN");
  assert.equal(revealedUnknown.freshness, "UNKNOWN");
  assert.equal(revealedUnknown.approval_state, "KEEGAN_ACTION_REQUIRED");

  const collapsedAgain = toggleExecutiveHomeSection(mattersExpanded, "WHAT_MATTERS_NOW");
  assert.equal(collapsedAgain.has("WHAT_MATTERS_NOW"), false);
  assert.deepEqual(
    visibleExecutiveHomeCards(mattersCards, false).map((card) => card.id),
    originalMattersOrder.slice(0, 4)
  );
});

test("attention budgeting preserves existing status placeholders and Decision Room deep links", () => {
  assert.match(html, /Loading executive intelligence with provenance intact/);
  assert.match(html, /No material intelligence changes need attention right now/);
  assert.match(html, /Unable to verify executive intelligence/);
  assert.match(html, /Open Decision Room/);
  assert.match(html, /Jump to grounded drill-down/);
});
