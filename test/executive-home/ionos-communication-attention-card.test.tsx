import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  IonosCommunicationAttentionCard,
  visibleIonosExecutiveAttention
} from "@/components/executive-home/IonosCommunicationAttentionCard";
import type { IonosIntelligentInboxResultV1 } from "@/lib/email/ionos-intelligent-inbox-v1";

type AttentionItem = IonosIntelligentInboxResultV1["executiveAttention"][number];

const NOW = "2026-09-08T20:00:00.000Z";

function attentionItem(id: string, overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id,
    projectionId: `projection-${id}`,
    threadId: `thread-${id}`,
    contactId: `contact-${id}`,
    opportunityIds: [],
    mailboxRoles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP"],
    primaryState: "NEEDS_REPLY",
    states: ["NEEDS_REPLY"],
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    lastMeaningfulInteractionAt: "2026-09-08T19:00:00.000Z",
    lastMeaningfulDirection: "INBOUND",
    whatHappened: `What happened ${id}`,
    whyItMatters: `Why it matters ${id}`,
    nextMove: "PREPARE_REPLY",
    nextMoveStatus: "SUGGESTED_UNVERIFIED",
    blockingConditions: ["OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL"],
    decisionEligible: true,
    evidenceFingerprint: `fingerprint-${id}`,
    deepLink: `/relationships/${id}`,
    attentionReason: "NEEDS_REPLY",
    ...overrides
  };
}

function inbox(items: readonly AttentionItem[]): IonosIntelligentInboxResultV1 {
  return {
    generatedAt: NOW,
    needsReply: [],
    waitingOnContact: [],
    staleOpportunities: [],
    highValue: [],
    recentReplies: [],
    suggestedCommitments: [],
    suggestedFollowUps: [],
    requiresVerification: [],
    executiveAttention: items,
    telemetry: {
      projectionCount: items.length,
      queueCounts: {
        needsReply: 0,
        waitingOnContact: 0,
        staleOpportunities: 0,
        highValue: 0,
        recentReplies: 0,
        suggestedCommitments: 0,
        suggestedFollowUps: 0,
        requiresVerification: 0,
        executiveAttention: items.length
      },
      attentionReasonCodes: items.map((item) => item.attentionReason),
      projectionFingerprints: items.map((item) => item.evidenceFingerprint),
      generatedAt: NOW
    }
  };
}

test("null input is honestly unavailable without fabricated correspondence counts", () => {
  const html = renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={null} />);
  assert.match(html, /Unavailable until live IONOS activation/);
  assert.match(html, /will not fabricate correspondence or attention counts/);
  assert.match(html, /href="\/relationships"/);
  assert.doesNotMatch(html, /0 (?:messages|replies|attention items)/i);
});

test("Executive Home preserves canonical attention order and caps the surface at three", () => {
  const source = inbox([
    attentionItem("first"),
    attentionItem("second"),
    attentionItem("third"),
    attentionItem("fourth")
  ]);

  assert.deepEqual(visibleIonosExecutiveAttention(source).map((item) => item.id), ["first", "second", "third"]);

  const html = renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={source} />);
  assert.match(html, /What happened first/);
  assert.match(html, /What happened second/);
  assert.match(html, /What happened third/);
  assert.doesNotMatch(html, /What happened fourth/);
  assert.ok(html.indexOf("What happened first") < html.indexOf("What happened second"));
  assert.ok(html.indexOf("What happened second") < html.indexOf("What happened third"));
});

test("attention items retain what happened why next freshness truth and mailbox context", () => {
  const html = renderToStaticMarkup(
    <IonosCommunicationAttentionCard
      inbox={inbox([
        attentionItem("detail", {
          mailboxRoles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP", "ASSISTANT_CUSTOMER_SERVICE_OUTREACH"]
        })
      ])}
    />
  );

  assert.match(html, /What happened/);
  assert.match(html, /What happened detail/);
  assert.match(html, /Why it matters/);
  assert.match(html, /Why it matters detail/);
  assert.match(html, /Next safe move/);
  assert.match(html, /PREPARE_REPLY/);
  assert.match(html, /KNOWN/);
  assert.match(html, /CURRENT/);
  assert.match(html, /Personal \/ high-value \+ Assistant \/ customer service/);
});

test("UNKNOWN STALE and CONFLICTED evidence remains visibly verification-gated", () => {
  const source = inbox([
    attentionItem("unknown", {
      primaryState: "UNKNOWN",
      states: ["UNKNOWN"],
      truthState: "UNKNOWN",
      freshnessState: "UNKNOWN",
      decisionEligible: false,
      nextMove: "VERIFY_EVIDENCE",
      attentionReason: "VERIFY_EVIDENCE"
    }),
    attentionItem("stale", {
      freshnessState: "STALE",
      decisionEligible: false,
      nextMove: "VERIFY_EVIDENCE",
      attentionReason: "VERIFY_EVIDENCE"
    }),
    attentionItem("conflicted", {
      primaryState: "CONFLICTED",
      states: ["CONFLICTED"],
      truthState: "CONFLICTED",
      decisionEligible: false,
      nextMove: "VERIFY_EVIDENCE",
      attentionReason: "VERIFY_EVIDENCE"
    })
  ]);
  const html = renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={source} />);

  assert.match(html, /UNKNOWN/);
  assert.match(html, /STALE/);
  assert.match(html, /CONFLICTED/);
  assert.equal((html.match(/Verify before acting/g) ?? []).length, 3);
  assert.doesNotMatch(html, /approved action/i);
});

test("suggested next moves remain explicitly unverified and approval-gated", () => {
  const html = renderToStaticMarkup(
    <IonosCommunicationAttentionCard inbox={inbox([attentionItem("suggestion")])} />
  );
  assert.match(html, /Suggested only · approval required/);
  assert.match(html, /preparation-only until separately approved/);
});

test("safe canonical deep links are preserved and missing links fall back to Relationships", () => {
  const html = renderToStaticMarkup(
    <IonosCommunicationAttentionCard
      inbox={inbox([
        attentionItem("linked", { deepLink: "/relationships/linked" }),
        attentionItem("fallback", { deepLink: null })
      ])}
    />
  );
  assert.match(html, /href="\/relationships\/linked"/);
  assert.ok((html.match(/href="\/relationships"/g) ?? []).length >= 2);
});

test("card renders no outbound or mutation affordance", () => {
  const html = renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={inbox([attentionItem("safe")])} />);
  assert.doesNotMatch(html, />\s*(?:Send|Compose)\s*</i);
  assert.doesNotMatch(html, /SMTP|method="post"|<form/i);
});

test("identical canonical input produces deterministic markup", () => {
  const source = inbox([attentionItem("a"), attentionItem("b")]);
  assert.equal(
    renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={source} />),
    renderToStaticMarkup(<IonosCommunicationAttentionCard inbox={source} />)
  );
});
