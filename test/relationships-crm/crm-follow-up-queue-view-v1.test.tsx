import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CrmFollowUpQueueV1 } from "@/components/relationships-crm/CrmFollowUpQueueV1";
import type {
  CanonicalRelationshipFollowUpQueueItemV1,
  CanonicalRelationshipFollowUpQueueResultV1,
  RelationshipFollowUpQueueClassV1
} from "@/lib/relationships-crm/canonical-follow-up-queue-v1";

const classes: RelationshipFollowUpQueueClassV1[] = [
  "NEEDS_REPLY", "WAITING_ON_CONTACT", "FOLLOW_UP_THIS_WEEK", "OVERDUE",
  "STALE_OPPORTUNITY", "HIGH_VALUE", "RECENTLY_REENGAGED", "REQUIRES_VERIFICATION"
];

function item(overrides: Partial<CanonicalRelationshipFollowUpQueueItemV1> = {}): CanonicalRelationshipFollowUpQueueItemV1 {
  return {
    itemId: "queue:1",
    projectionId: "projection:1",
    contactId: "contact:1",
    threadId: "thread:1",
    opportunityIds: ["opportunity:1"],
    queueClasses: ["NEEDS_REPLY", "HIGH_VALUE"],
    primaryQueueClass: "NEEDS_REPLY",
    priority: 3,
    dueAt: "2026-09-15T12:00:00.000Z",
    lastMeaningfulInteractionAt: "2026-09-13T12:00:00.000Z",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    requiresReview: false,
    suggestedMove: "REPLY_NOW",
    followUpIds: ["follow-up:1"],
    evidenceRefs: ["ionos:mailbox:1:email:1"],
    ...overrides
  };
}

function queue(items: readonly CanonicalRelationshipFollowUpQueueItemV1[]): CanonicalRelationshipFollowUpQueueResultV1 {
  return {
    generatedAt: "2026-09-14T00:00:00.000Z",
    items,
    counts: Object.fromEntries(classes.map((queueClass) => [queueClass, items.filter((value) => value.queueClasses.includes(queueClass)).length])) as Record<RelationshipFollowUpQueueClassV1, number>
  };
}

test("renders every canonical queue class and deterministic priority order", () => {
  const low = item({ itemId: "low", priority: 7, contactId: "contact:low", queueClasses: ["HIGH_VALUE"], primaryQueueClass: "HIGH_VALUE" });
  const high = item({ itemId: "high", priority: 1, contactId: "contact:high", queueClasses: classes, primaryQueueClass: "REQUIRES_VERIFICATION", requiresReview: true });
  const html = renderToStaticMarkup(<CrmFollowUpQueueV1 queue={queue([low, high])} />);
  for (const label of ["Needs reply", "Waiting on contact", "Follow up this week", "Overdue", "Stale opportunity", "High value", "Recently re-engaged", "Requires verification"]) {
    assert.match(html, new RegExp(label));
  }
  assert.ok(html.indexOf("Contact contact:high") < html.indexOf("Contact contact:low"));
});

test("keeps verification, UNKNOWN, STALE, and CONFLICTED states visible", () => {
  const html = renderToStaticMarkup(<CrmFollowUpQueueV1 queue={queue([
    item({ itemId: "unknown", truthState: "UNKNOWN", freshnessState: "UNKNOWN", requiresReview: true, queueClasses: ["REQUIRES_VERIFICATION"], primaryQueueClass: "REQUIRES_VERIFICATION" }),
    item({ itemId: "conflicted", truthState: "CONFLICTED", freshnessState: "STALE", requiresReview: true, queueClasses: ["REQUIRES_VERIFICATION"], primaryQueueClass: "REQUIRES_VERIFICATION" })
  ])} />);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /STALE/);
  assert.match(html, /Verification required before this record can drive a consequential action/);
});

test("offers only supported person and opportunity destinations", () => {
  const html = renderToStaticMarkup(<CrmFollowUpQueueV1 queue={queue([item()])} />);
  assert.match(html, /href="\/relationships\/people\/contact%3A1"/);
  assert.match(html, /href="\/opportunities-actions\/opportunity\/opportunity%3A1"/);
  assert.doesNotMatch(html, /mailto:|smtp:|send|compose/i);
});

test("renders a truthful empty canonical queue", () => {
  const html = renderToStaticMarkup(<CrmFollowUpQueueV1 queue={queue([])} />);
  assert.match(html, /No supported follow-ups/);
  assert.match(html, /supplied no actionable or verification-required records/);
});

test("production route uses the authoritative server loader without fixtures", () => {
  const routeSource = readFileSync(resolve(process.cwd(), "src/app/(app)/relationships/follow-ups/page.tsx"), "utf8");
  const homeSource = readFileSync(resolve(process.cwd(), "src/app/(app)/relationships/page.tsx"), "utf8");
  assert.match(routeSource, /loadProductionFollowUpQueueV1/);
  assert.match(routeSource, /queue=\{queue\}/);
  assert.match(routeSource, /force-no-store/);
  assert.doesNotMatch(routeSource, /fixture|seed/i);
  assert.match(homeSource, /href="\/relationships\/follow-ups"/);
  assert.match(homeSource, /Open follow-up queue/);
});
