import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RelationshipsPage from "@/app/(app)/relationships/page";
import RelationshipActivityPage from "@/app/(app)/relationships/activity/page";
import { CrmActivityTimelineV1 } from "@/components/relationships-crm/CrmActivityTimelineV1";
import type { EmailActivityProjectionV1 } from "@/lib/email/ionos-crm-linking-v1";
import type { RelationshipActivityClassificationEvidenceV1 } from "@/lib/email/ionos-relationship-state-v1";
import { toCrmActivityTimelineV1 } from "@/lib/relationships-crm/crm-activity-timeline-v1";

function emailActivity(overrides: Partial<EmailActivityProjectionV1> & Pick<EmailActivityProjectionV1, "id" | "canonicalEmailId">): EmailActivityProjectionV1 {
  return {
    id: overrides.id,
    canonicalEmailId: overrides.canonicalEmailId,
    contactId: overrides.contactId ?? "contact-1",
    companyId: overrides.companyId ?? "company-1",
    linkedEntities: overrides.linkedEntities ?? [{ entityType: "OPPORTUNITY", entityId: "opportunity-1", evidenceRefs: ["ev-link"] }],
    sourceTimestamp: overrides.sourceTimestamp ?? "2026-09-10T15:00:00.000Z",
    effectiveTimestamp: overrides.effectiveTimestamp ?? "2026-09-10T15:00:00.000Z",
    truthState: overrides.truthState ?? "KNOWN",
    freshnessState: overrides.freshnessState ?? "CURRENT",
    evidenceRefs: overrides.evidenceRefs ?? ["ev-email"],
    provenanceFingerprints: overrides.provenanceFingerprints ?? ["fp-email"],
    supersedesCanonicalEmailId: overrides.supersedesCanonicalEmailId ?? null,
  };
}

function classification(
  activityId: string,
  canonicalEmailId: string,
  overrides: Partial<RelationshipActivityClassificationEvidenceV1> = {},
): RelationshipActivityClassificationEvidenceV1 {
  return {
    activityId,
    canonicalEmailId,
    contactId: overrides.contactId ?? "contact-1",
    threadId: overrides.threadId ?? "thread-1",
    direction: overrides.direction ?? "INBOUND",
    classification: overrides.classification ?? "DIRECT_HUMAN",
    mailboxRole: overrides.mailboxRole ?? "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    expectsReply: overrides.expectsReply ?? true,
    evidenceRef: overrides.evidenceRef ?? "ev-classification",
    observedAt: overrides.observedAt ?? "2026-09-10T15:01:00.000Z",
  };
}

test("timeline keeps direct human correspondence distinct from automated email activity", () => {
  const direct = emailActivity({ id: "activity-direct", canonicalEmailId: "email-direct" });
  const automated = emailActivity({
    id: "activity-system",
    canonicalEmailId: "email-system",
    effectiveTimestamp: "2026-09-10T14:00:00.000Z",
  });

  const timeline = toCrmActivityTimelineV1({
    emailActivities: [automated, direct],
    emailClassifications: [
      classification(direct.id, direct.canonicalEmailId),
      classification(automated.id, automated.canonicalEmailId, {
        classification: "AUTOMATED_NOTIFICATION",
        direction: "OUTBOUND",
      }),
    ],
  });

  assert.equal(timeline.coverage, "AVAILABLE");
  assert.equal(timeline.directHumanCount, 1);
  assert.equal(timeline.systemEventCount, 1);
  assert.deepEqual(timeline.items.map((item) => item.id), ["activity-direct", "activity-system"]);
  assert.equal(timeline.items[0].kind, "DIRECT_EMAIL");
  assert.equal(timeline.items[0].provenance, "DIRECT_HUMAN");
  assert.equal(timeline.items[0].direction, "INBOUND");
  assert.equal(timeline.items[1].kind, "EMAIL_SYSTEM_EVENT");
  assert.equal(timeline.items[1].provenance, "SYSTEM");
});

test("unclassified or ambiguous email provenance stays UNKNOWN rather than becoming human correspondence", () => {
  const email = emailActivity({ id: "activity-unknown", canonicalEmailId: "email-unknown" });
  const duplicate = classification(email.id, email.canonicalEmailId);

  const missing = toCrmActivityTimelineV1({ emailActivities: [email], emailClassifications: [] });
  const ambiguous = toCrmActivityTimelineV1({ emailActivities: [email], emailClassifications: [duplicate, { ...duplicate }] });

  for (const timeline of [missing, ambiguous]) {
    assert.equal(timeline.items[0].kind, "EMAIL_UNCLASSIFIED");
    assert.equal(timeline.items[0].provenance, "UNKNOWN");
    assert.equal(timeline.items[0].direction, null);
    assert.match(timeline.items[0].summary, /requires provenance classification/);
    assert.equal(timeline.directHumanCount, 0);
    assert.equal(timeline.unknownProvenanceCount, 1);
  }
});

test("supplemental supported meetings and system events preserve provenance, truth, freshness, labels and unknown timestamps", () => {
  const timeline = toCrmActivityTimelineV1({
    emailActivities: [],
    emailClassifications: [],
    supplementalActivities: [
      {
        id: "meeting-1",
        kind: "MEETING",
        timestamp: "2026-09-09T18:30:00.000Z",
        actorLabel: "Saved contact",
        entityLabel: "Verified company",
        summary: "Meeting recorded from supported CRM evidence",
        contactId: "contact-2",
        companyId: "company-2",
        opportunityIds: ["opportunity-2"],
        truthState: "KNOWN",
        freshnessState: "CURRENT",
        provenance: "HUMAN_RECORDED",
        evidenceRefs: ["meeting-evidence"],
      },
      {
        id: "system-1",
        kind: "SYSTEM_EVENT",
        timestamp: "not-a-date",
        actorLabel: null,
        entityLabel: null,
        summary: "Supported system event",
        contactId: null,
        companyId: null,
        opportunityIds: [],
        truthState: "UNKNOWN",
        freshnessState: "UNKNOWN",
        provenance: "SYSTEM",
        evidenceRefs: ["system-evidence"],
      },
    ],
  });

  assert.equal(timeline.items[0].id, "meeting-1");
  assert.equal(timeline.items[0].provenance, "HUMAN_RECORDED");
  assert.equal(timeline.items[0].truthState, "KNOWN");
  assert.equal(timeline.items[1].timestamp, null);
  assert.equal(timeline.items[1].truthState, "UNKNOWN");
  assert.equal(timeline.items[1].freshnessState, "UNKNOWN");
  assert.equal(timeline.systemEventCount, 1);
});

test("activity UI is scan-first, chronological, provenance-aware and exposes only supported record destinations", () => {
  const email = emailActivity({ id: "activity-ui", canonicalEmailId: "email-ui" });
  const timeline = toCrmActivityTimelineV1({
    emailActivities: [email],
    emailClassifications: [classification(email.id, email.canonicalEmailId)],
  });
  const html = renderToStaticMarkup(<CrmActivityTimelineV1 timeline={timeline} />);

  assert.match(html, /Chronological relationship activity/);
  assert.match(html, /Direct email/);
  assert.match(html, /DIRECT HUMAN/);
  assert.match(html, /KNOWN/);
  assert.match(html, /CURRENT/);
  assert.match(html, /href="\/relationships\/people\/contact-1"/);
  assert.match(html, /href="\/relationships\/companies\/company-1"/);
  assert.match(html, /Opportunity:.*opportunity-1/);
  assert.match(html, /Evidence details/);
  assert.doesNotMatch(html, /message body|raw headers|credential/i);
});

test("production activity route fails closed and CRM Home exposes the real destination", () => {
  const activityHtml = renderToStaticMarkup(<RelationshipActivityPage />);
  const homeHtml = renderToStaticMarkup(<RelationshipsPage />);
  const activityRouteSource = readFileSync(resolve(process.cwd(), "src/app/(app)/relationships/activity/page.tsx"), "utf8");

  assert.match(activityHtml, /Activity timeline unavailable/);
  assert.match(activityHtml, /No authoritative production activity loader is connected/);
  assert.match(activityHtml, /stays empty rather than inventing emails, meetings, calls, notes, or follow-ups/);
  assert.match(homeHtml, /href="\/relationships\/activity"/);
  assert.match(homeHtml, /Open activity timeline/);
  assert.match(activityRouteSource, /timeline=\{null\}/);
  assert.doesNotMatch(activityRouteSource, /fixture/i);
});
