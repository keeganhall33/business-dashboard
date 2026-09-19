import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOARDROOM_RSS_URL,
  BOARDROOM_SOURCE_ID,
  type BoardroomRssItem
} from "../../src/lib/external-intelligence/collection/boardroom/boardroom.contract";
import { buildBoardroomEvidenceReference } from "../../src/lib/external-intelligence/collection/boardroom/boardroom.evidence";
import type { BoardroomCollectionOutput } from "../../src/lib/external-intelligence/collection/boardroom/boardroom.adapter";
import {
  compileBoardroomRssOpportunityPipelineV1
} from "../../src/lib/relationship-intelligence/boardroom-rss-opportunity-pipeline-v1";

const evaluatedAt = "2026-09-19T19:00:00.000Z";
const collectedAt = "2026-09-19T18:30:00.000Z";

function item(overrides: Partial<BoardroomRssItem> = {}): BoardroomRssItem {
  return {
    canonical_url: "https://boardroom.tv/acme-sponsorship/",
    guid: "https://boardroom.tv/?p=12345",
    title: "Acme signs new sponsorship with major sports property",
    published_at_iso: "2026-09-19T17:00:00.000Z",
    author: "Boardroom Staff",
    categories: ["Sports", "Deals & Investments"],
    excerpt: "The sponsorship includes a new brand activation program for the upcoming season.",
    rss_content_html: "<p>The sponsorship includes a new brand activation program for the upcoming season.</p>",
    ...overrides
  };
}

function collection(items: BoardroomRssItem[]): BoardroomCollectionOutput {
  return {
    ok: true,
    source_id: BOARDROOM_SOURCE_ID,
    feed: { feed_url: BOARDROOM_RSS_URL, feed_title: "Boardroom" },
    items,
    meta: { now_iso: collectedAt, max_items: 25, observed_count: items.length }
  };
}

function evidenceFor(source: BoardroomRssItem) {
  return buildBoardroomEvidenceReference({
    evidence_reference_id: "ev_boardroom_acme_12345",
    canonical_url: source.canonical_url,
    guid: source.guid,
    source_item_id: source.guid ? `guid:${source.guid}` : `url:${source.canonical_url}`,
    title: source.title,
    published_at_iso: source.published_at_iso,
    collected_at_iso: collectedAt,
    author: source.author,
    categories: [...source.categories],
    excerpt: source.excerpt,
    rss_content_html: source.rss_content_html,
    feed_url: BOARDROOM_RSS_URL,
    rss_position: 0
  });
}

test("routes exact Boardroom RSS evidence into classifier and canonical intake without inventing entities", () => {
  const source = item();
  const result = compileBoardroomRssOpportunityPipelineV1({
    evaluatedAt,
    collection: collection([source]),
    evidenceReferences: [evidenceFor(source)]
  });

  assert.equal(result.status, "READY");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.disposition, "READY_FOR_CLASSIFICATION");
  assert.equal(result.stories.length, 1);
  assert.deepEqual(result.stories[0]?.organizationRefs, []);
  assert.deepEqual(result.stories[0]?.entityRefs, []);
  assert.equal(result.stories[0]?.existingOpportunityRef, null);

  assert.equal(result.classification?.counts.reviewed, 1);
  assert.equal(result.classification?.decisions[0]?.signalClass, "SPONSORSHIP");
  assert.equal(result.classification?.decisions[0]?.disposition, "QUALIFIED_FOR_RESEARCH");
  assert.deepEqual(result.classification?.decisions[0]?.organizationRefs, []);
  assert.deepEqual(result.classification?.decisions[0]?.entityRefs, []);
  assert.equal(result.classification?.decisions[0]?.existingOpportunityRef, null);

  assert.equal(result.intake?.status, "READY");
  assert.equal(result.intake?.observations.length, 1);
  assert.equal(result.intake?.records[0]?.canonicalOrganizationRef, null);
  assert.equal(result.intake?.records[0]?.canonicalPersonRef, null);
  assert.equal(result.intake?.records[0]?.canonicalOpportunityRef, null);

  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});

test("does not substitute collection time when Boardroom publication time is missing", () => {
  const source = item({ published_at_iso: null });
  const result = compileBoardroomRssOpportunityPipelineV1({
    evaluatedAt,
    collection: collection([source]),
    evidenceReferences: [evidenceFor(source)]
  });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.records[0]?.disposition, "VERIFY_SOURCE_EVIDENCE");
  assert.ok(result.records[0]?.reasonCodes.includes("PUBLISHER_TIMESTAMP_MISSING"));
  assert.equal(result.stories.length, 0);
  assert.equal(result.classification?.counts.reviewed, 0);
  assert.equal(result.intake?.observations.length, 0);
});

test("fails source evidence closed when canonical provenance disagrees", () => {
  const source = item();
  const evidence = evidenceFor(source);
  evidence.provenance_metadata = {
    ...evidence.provenance_metadata,
    source_item_id: "guid:https://boardroom.tv/?p=other"
  };

  const result = compileBoardroomRssOpportunityPipelineV1({
    evaluatedAt,
    collection: collection([source]),
    evidenceReferences: [evidence]
  });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.records[0]?.disposition, "VERIFY_SOURCE_EVIDENCE");
  assert.ok(result.records[0]?.reasonCodes.includes("PROVENANCE_SOURCE_ITEM_ID_MISMATCH"));
  assert.equal(result.stories.length, 0);
});

test("suppresses retracted Boardroom evidence instead of classifying it", () => {
  const source = item();
  const evidence = evidenceFor(source);
  evidence.retraction_status = "retracted";

  const result = compileBoardroomRssOpportunityPipelineV1({
    evaluatedAt,
    collection: collection([source]),
    evidenceReferences: [evidence]
  });

  assert.equal(result.status, "READY");
  assert.equal(result.records[0]?.disposition, "SUPPRESSED_RETRACTED");
  assert.ok(result.records[0]?.reasonCodes.includes("EVIDENCE_RETRACTED"));
  assert.equal(result.stories.length, 0);
  assert.equal(result.classification?.counts.reviewed, 0);
});

test("blocks a failed Boardroom collection without manufacturing source records", () => {
  const result = compileBoardroomRssOpportunityPipelineV1({
    evaluatedAt,
    collection: { ok: false, source_id: BOARDROOM_SOURCE_ID, error: "network unavailable" },
    evidenceReferences: []
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.issues, ["BOARDROOM_COLLECTION_FAILED"]);
  assert.equal(result.records.length, 0);
  assert.equal(result.classification, null);
  assert.equal(result.intake, null);
});
