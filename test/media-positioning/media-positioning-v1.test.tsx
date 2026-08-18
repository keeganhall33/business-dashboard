import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMediaPositioningRecommendationV1,
  generateContentBriefFromOpportunityV1,
  getMediaPositioningFixtureBundleV1,
  MEDIA_POSITIONING_CONTRACT_VERSION_V1,
  toMediaPositioningDashboardCardsV1,
  type MediaAssetRecordV1
} from "@/lib/media-positioning";

test("media positioning fixture bundle defines proof assets opportunities briefs and archive design", () => {
  const bundle = getMediaPositioningFixtureBundleV1();

  assert.equal(bundle.contract_version, MEDIA_POSITIONING_CONTRACT_VERSION_V1);
  assert.ok(bundle.proof_points.length >= 8);
  assert.ok(bundle.assets.length >= 5);
  assert.ok(bundle.opportunities.length >= 4);
  assert.ok(bundle.briefs.length >= 4);
  assert.ok(bundle.archive_ingestion_design.future_connectors.includes("CRM/relationship proof #316"));
  assert.ok(bundle.archive_ingestion_design.future_connectors.includes("file/media connectors"));
  assert.ok(bundle.archive_ingestion_design.indexed_fields.includes("rights status"));
  assert.ok(bundle.archive_ingestion_design.indexed_fields.includes("endorsement status"));
});

test("golden proof points cover named cultural scenarios without fabricating endorsements", () => {
  const bundle = getMediaPositioningFixtureBundleV1();
  const text = JSON.stringify(bundle.proof_points);

  for (const expected of ["Jordan", "Rory", "Obama Presidential Center", "Augusta", "Music figures", "Major athletes", "Charity", "Major media"]) {
    assert.match(text, new RegExp(expected, "i"));
  }

  const endorsementStatuses = new Set(bundle.proof_points.map((proof) => proof.endorsement_status));
  assert.ok(endorsementStatuses.has("DEPICTION_ONLY"));
  assert.ok(endorsementStatuses.has("OWNERSHIP_OR_RECEIPT_ONLY"));
  assert.ok(endorsementStatuses.has("INSTITUTIONAL_ASSOCIATION"));
  assert.ok(endorsementStatuses.has("MEDIA_COVERAGE_ONLY"));
  assert.equal(endorsementStatuses.has("CONFIRMED_ENDORSEMENT"), false);

  for (const proof of bundle.proof_points) {
    assert.ok(proof.endorsement_safeguard.length > 30);
    if (proof.endorsement_status !== "CONFIRMED_ENDORSEMENT") {
      assert.match(proof.endorsement_safeguard, /Do not|not an endorsement|not imply|not state/i);
    }
  }
});

test("system transforms proof into distinct high-end content briefs", () => {
  const bundle = getMediaPositioningFixtureBundleV1();
  const byId = new Map(bundle.briefs.map((brief) => [brief.brief_id, brief]));

  assert.equal(byId.get("brief-greatness-recognizes-greatness-archive")?.recommendation, "NEW_VOICEOVER");
  assert.equal(byId.get("brief-institutional-legacy-press-kit")?.recommendation, "ARCHIVE_REPURPOSE");
  assert.equal(byId.get("brief-archive-index-before-publishing")?.recommendation, "DO_NOT_PUBLISH_YET");
  assert.equal(byId.get("brief-event-capture-elite-room")?.recommendation, "EVENT_CAPTURE");

  for (const brief of bundle.briefs) {
    assert.ok(brief.hook.length > 20);
    assert.ok(brief.thesis.length > 30);
    assert.ok(brief.story_arc.length > 0);
    assert.ok(brief.edit_instructions.length > 0);
    assert.equal(brief.approval_required, true);
    assert.ok(!brief.caption_or_cta_intent.toLowerCase().includes("post now"));
  }
});

test("recommendation classifier is explicit about archive versus production needs", () => {
  const bundle = getMediaPositioningFixtureBundleV1();
  const opportunity = bundle.opportunities.find((item) => item.opportunity_id === "opp-greatness-recognizes-greatness");
  assert.ok(opportunity);

  assert.equal(
    classifyMediaPositioningRecommendationV1({ opportunity, assets: bundle.assets }),
    "NEW_VOICEOVER"
  );

  const clearedAssets = bundle.assets.map((asset): MediaAssetRecordV1 =>
    asset.asset_id === "asset-jordan-process-and-final" ? { ...asset, rights_status: "CLEARED" } : asset
  );
  assert.equal(
    classifyMediaPositioningRecommendationV1({ opportunity, assets: clearedAssets }),
    "NEW_VOICEOVER"
  );

  const onlyJordanCleared = clearedAssets.filter((asset) => asset.asset_id === "asset-jordan-process-and-final");
  assert.equal(
    classifyMediaPositioningRecommendationV1({ opportunity, assets: onlyJordanCleared }),
    "ARCHIVE_REPURPOSE"
  );

  const riskyOpportunity = bundle.opportunities.find((item) => item.opportunity_id === "opp-archive-mining-music-athletes");
  assert.ok(riskyOpportunity);
  assert.equal(
    classifyMediaPositioningRecommendationV1({ opportunity: riskyOpportunity, assets: bundle.assets }),
    "DO_NOT_PUBLISH_YET"
  );

  const eventOpportunity = bundle.opportunities.find((item) => item.opportunity_id === "opp-next-elite-room-event-capture");
  assert.ok(eventOpportunity);
  assert.equal(
    classifyMediaPositioningRecommendationV1({ opportunity: eventOpportunity, assets: [] }),
    "EVENT_CAPTURE"
  );
});

test("generated briefs preserve endorsement safeguards and unknown rights blocks", () => {
  const bundle = getMediaPositioningFixtureBundleV1();
  const opportunity = bundle.opportunities.find((item) => item.opportunity_id === "opp-archive-mining-music-athletes");
  assert.ok(opportunity);

  const brief = generateContentBriefFromOpportunityV1({
    opportunity,
    proofPoints: bundle.proof_points,
    assets: bundle.assets
  });

  assert.equal(brief.recommendation, "DO_NOT_PUBLISH_YET");
  assert.equal(brief.rights_status, "UNKNOWN");
  assert.match(brief.do_not_publish_reason ?? "", /Rights|identity|archive/i);
  assert.ok(brief.endorsement_guardrails.some((guardrail) => /Do not|Use category-level/i.test(guardrail)));
  assert.ok(brief.missing_capture.includes("archive indexing pass"));
});

test("human production requirements are not hidden behind AI claims", () => {
  const bundle = getMediaPositioningFixtureBundleV1();

  for (const brief of bundle.briefs) {
    assert.ok(brief.ai_value_add.length > 0);
    assert.ok(brief.human_requirements.length > 0);
  }

  const eventBrief = bundle.briefs.find((brief) => brief.brief_id === "brief-event-capture-elite-room");
  assert.ok(eventBrief);
  assert.equal(eventBrief.production_burden, "HUMAN_SHOOTER_REQUIRED");
  assert.ok(eventBrief.human_requirements.some((item) => /shooter|editor/i.test(item)));
});

test("dashboard cards expose requested UX fields and recurring queue is opportunity-led", () => {
  const bundle = getMediaPositioningFixtureBundleV1();
  const cards = toMediaPositioningDashboardCardsV1(bundle);

  assert.equal(cards.length, bundle.briefs.length);
  assert.deepEqual(new Set(cards.map((card) => card.approval)), new Set(["REQUIRED_BEFORE_PUBLIC_POSTING"]));
  assert.ok(cards.every((card) => card.why_now.length > 0));
  assert.ok(cards.every((card) => card.narrative.length > 0));
  assert.ok(cards.every((card) => card.proof.length > 0 || card.recommendation === "EVENT_CAPTURE"));
  assert.ok(cards.some((card) => card.assets_missing.length > 0));

  assert.equal(bundle.narrative_queue.every((item) => item.arbitrary_calendar_slot === false), true);
  assert.equal(bundle.narrative_queue.length, bundle.briefs.length);
  assert.ok(bundle.narrative_queue.every((item) => item.relationship_strategy_refs.length > 0));
});
