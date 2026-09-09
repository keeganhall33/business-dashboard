import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import SpecialistsPage from "@/app/(app)/specialists/page";
import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import {
  getSpecialistCapabilityStatusV1,
  getSpecialistCommandCenterCardsForModeV1,
  getSpecialistCommandCenterCardsV1,
  getProductionSpecialistCommandCenterCardsV1,
  type SpecialistProductionInputV1
} from "@/lib/executive-home/specialist-command-center";

test("production command center withholds fixture-backed specialist conclusions when live input is absent", () => {
  const html = renderToString(
    <ExecutiveCommandCenter
      data={EXECUTIVE_HOME_FIXTURE_V1.command_center}
      specialistMode="PRODUCTION"
      onOpenDecisionRoom={() => undefined}
    />
  );

  assert.match(html, /Specialist evidence unavailable/);
  assert.match(html, /No canonical production specialist snapshot is supplied/);
  assert.match(html, /UNKNOWN/);
  assert.doesNotMatch(html, /Financial fixture:/);
  assert.doesNotMatch(html, /Goals fixture:/);
  assert.doesNotMatch(html, /Relationship fixture:/);
  assert.doesNotMatch(html, /aria-label="Financial evidence freshness/);
  assert.doesNotMatch(html, /Review in Decision Room/);
});

test("fixture specialist generation is deterministic only through the explicit fixture mode", () => {
  const first = getSpecialistCommandCenterCardsForModeV1("FIXTURE");
  const second = getSpecialistCommandCenterCardsForModeV1("FIXTURE");

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((card) => card.id), ["financial", "goals-capacity", "relationships"]);
  assert.ok(first.every((card) => card.source_mode === "FIXTURE"));
  assert.deepEqual(getSpecialistCommandCenterCardsForModeV1("PRODUCTION"), []);
  assert.deepEqual(getProductionSpecialistCommandCenterCardsV1(), []);
});

test("explicit production input preserves unknown stale and conflicted truth without fixture substitution", () => {
  const [financial, goals, relationships] = getSpecialistCommandCenterCardsV1();
  const productionInput: SpecialistProductionInputV1 = {
    source_mode: "PRODUCTION",
    cards: [
      { ...financial, source_mode: "PRODUCTION", truth_state: "STALE", evidence_freshness: "STALE", detail_href: "/specialists/financial" },
      { ...goals, source_mode: "PRODUCTION", truth_state: "CONFLICTED", evidence_freshness: "CONFLICTED", detail_href: "/specialists/goals-capacity" },
      { ...relationships, source_mode: "PRODUCTION", truth_state: "UNKNOWN", evidence_freshness: "UNKNOWN", detail_href: "/relationships" }
    ]
  };

  const cards = getProductionSpecialistCommandCenterCardsV1(productionInput);
  const capabilities = getSpecialistCapabilityStatusV1(productionInput);

  assert.deepEqual(cards.map((card) => card.truth_state), ["STALE", "CONFLICTED", "UNKNOWN"]);
  assert.deepEqual(capabilities.map((item) => item.availability), ["PRODUCTION_BACKED", "PRODUCTION_BACKED", "PRODUCTION_BACKED"]);
  assert.deepEqual(capabilities.map((item) => item.truth_state), ["STALE", "CONFLICTED", "UNKNOWN"]);
  assert.ok(capabilities.every((item) => item.detail_href));
});

test("specialists workspace renders an honest production coverage state instead of the generic prose wall", () => {
  const html = renderToString(<SpecialistsPage />);

  assert.match(html, /Production truth boundary/);
  assert.match(html, /LIVE EVIDENCE: UNAVAILABLE/);
  assert.match(html, /Capability status/);
  assert.match(html, /Financial/);
  assert.match(html, /Goals \/ Capacity/);
  assert.match(html, /Relationships/);
  assert.match(html, /No current specialist conclusion is presented without a verified production input/);
  assert.match(html, /No specialist detail link is exposed until production-backed evidence supports the displayed state/);
  assert.match(html, /grid gap-4 lg:grid-cols-3/);
  assert.match(html, /aria-label="Specialist intelligence workspace"/);
  assert.doesNotMatch(html, /href="\/specialists\/financial"/);
  assert.doesNotMatch(html, /href="\/specialists\/goals-capacity"/);
  assert.doesNotMatch(html, />KNOWN</);
});
