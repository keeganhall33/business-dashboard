import assert from "node:assert/strict";
import test from "node:test";

import * as api from "@/lib/email/ionos-crm-linking-v1";
import {
  projectCanonicalEmailToCrmV1,
  type CanonicalEmailCrmLinkInputV1,
  type EmailContactIdentityEvidenceV1
} from "@/lib/email/ionos-crm-linking-v1";
import type { CanonicalEmailRecordV1 } from "@/lib/email/ionos-email-normalization-v1";

const NOW = "2026-09-08T18:00:00.000Z";

function canonicalRecord(overrides: Partial<CanonicalEmailRecordV1> = {}): CanonicalEmailRecordV1 {
  return {
    id: "email-1",
    identityBasis: "MESSAGE_ID",
    messageId: "<email-1@example.test>",
    dedupeKey: "message-id:email-1@example.test",
    direction: "INBOUND",
    participants: {
      from: ["collector@example.test"],
      to: ["keegan@example.test"],
      cc: [],
      bcc: []
    },
    sentAt: "2026-09-08T12:00:00.000Z",
    receivedAt: "2026-09-08T12:00:05.000Z",
    subject: "Private collector inquiry that must not enter telemetry",
    thread: { inReplyTo: null, references: [] },
    body: { policy: "TEXT", reference: null, text: "private message body" },
    attachments: [],
    provenance: [
      {
        mailboxId: "personal",
        role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        folder: "INBOX",
        uidValidity: "77",
        uid: "100",
        sourceTimestamp: "2026-09-08T12:00:06.000Z",
        ingestFingerprint: "source-fingerprint-1"
      }
    ],
    qualityReasons: [],
    firstSourceTimestamp: "2026-09-08T12:00:06.000Z",
    lastSourceTimestamp: "2026-09-08T12:00:06.000Z",
    ...overrides
  };
}

function contact(overrides: Partial<EmailContactIdentityEvidenceV1> = {}): EmailContactIdentityEvidenceV1 {
  return {
    contactId: "contact-collector",
    email: "collector@example.test",
    evidenceRef: "crm-contact-evidence-1",
    observedAt: "2026-09-08T13:00:00.000Z",
    ...overrides
  };
}

function baseInput(overrides: Partial<CanonicalEmailCrmLinkInputV1> = {}): CanonicalEmailCrmLinkInputV1 {
  return {
    records: [canonicalRecord()],
    contacts: [contact()],
    companyDomains: [],
    entityLinks: [],
    recordStates: [],
    corrections: [],
    now: NOW,
    ...overrides
  };
}

function resolutionFor(result: ReturnType<typeof projectCanonicalEmailToCrmV1>, contactId: string | null) {
  return result.records[0].participantResolutions.find((resolution) => resolution.contactId === contactId);
}

test("resolves one exact participant email to one existing contact with explicit membership evidence", () => {
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      contacts: [
        contact({
          email: "Collector@Example.Test",
          companyMembership: { companyId: "company-1", evidenceRef: "membership-evidence-1" }
        })
      ]
    })
  );

  const resolved = resolutionFor(result, "contact-collector");
  assert.equal(resolved?.status, "RESOLVED");
  assert.equal(resolved?.companyStatus, "RESOLVED");
  assert.equal(resolved?.companyId, "company-1");
  assert.deepEqual(resolved?.evidenceRefs, ["crm-contact-evidence-1", "membership-evidence-1"]);
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].contactId, "contact-collector");
  assert.equal(result.records[0].decisionEligible, true);
});

test("unifies the same contact across authorized mailbox roles while preserving distinct provenance", () => {
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      records: [
        canonicalRecord(),
        canonicalRecord({
          id: "email-2",
          messageId: "<email-2@example.test>",
          dedupeKey: "message-id:email-2@example.test",
          sentAt: "2026-09-08T12:30:00.000Z",
          receivedAt: "2026-09-08T12:30:05.000Z",
          provenance: [
            {
              mailboxId: "assistant",
              role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
              folder: "INBOX",
              uidValidity: "88",
              uid: "200",
              sourceTimestamp: "2026-09-08T12:30:06.000Z",
              ingestFingerprint: "source-fingerprint-2"
            }
          ],
          firstSourceTimestamp: "2026-09-08T12:30:06.000Z",
          lastSourceTimestamp: "2026-09-08T12:30:06.000Z"
        })
      ]
    })
  );

  assert.equal(result.contactTimelines.length, 1);
  assert.equal(result.contactTimelines[0].contactId, "contact-collector");
  assert.equal(result.contactTimelines[0].activities.length, 2);
  assert.deepEqual(
    result.contactTimelines[0].activities.map((activity) => activity.canonicalEmailId),
    ["email-1", "email-2"]
  );
  assert.deepEqual(result.contactTimelines[0].activities[0].provenanceFingerprints, ["source-fingerprint-1"]);
  assert.deepEqual(result.contactTimelines[0].activities[1].provenanceFingerprints, ["source-fingerprint-2"]);
});

test("multiple exact-email contact candidates remain AMBIGUOUS and are never auto-selected or merged", () => {
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      contacts: [
        contact({ contactId: "contact-a", evidenceRef: "candidate-a" }),
        contact({ contactId: "contact-b", evidenceRef: "candidate-b" })
      ]
    })
  );

  const ambiguous = result.records[0].participantResolutions.find((entry) => entry.status === "AMBIGUOUS");
  assert.ok(ambiguous);
  assert.equal(ambiguous.contactId, null);
  assert.equal(ambiguous.companyId, null);
  assert.deepEqual(ambiguous.evidenceRefs, ["candidate-a", "candidate-b"]);
  assert.equal(result.activities.length, 0);
  assert.equal(result.records[0].decisionEligible, false);
  assert.equal(result.telemetry.ambiguousParticipantCount, 1);
});

test("unknown participants remain UNKNOWN without fabricated person or company records", () => {
  const result = projectCanonicalEmailToCrmV1(baseInput({ contacts: [] }));

  assert.equal(result.activities.length, 0);
  assert.equal(result.contactTimelines.length, 0);
  assert.ok(result.records[0].participantResolutions.every((entry) => entry.status === "UNKNOWN"));
  assert.ok(result.records[0].participantResolutions.every((entry) => entry.contactId === null && entry.companyId === null));
  assert.equal(result.records[0].decisionEligible, false);
});

test("company linkage is absent for a bare email domain and appears only with explicit governed domain evidence", () => {
  const withoutEvidence = projectCanonicalEmailToCrmV1(baseInput());
  assert.equal(resolutionFor(withoutEvidence, "contact-collector")?.companyStatus, "UNKNOWN");
  assert.equal(resolutionFor(withoutEvidence, "contact-collector")?.companyId, null);

  const withEvidence = projectCanonicalEmailToCrmV1(
    baseInput({
      companyDomains: [
        {
          companyId: "company-example",
          domain: "example.test",
          evidenceRef: "approved-domain-evidence",
          observedAt: "2026-09-08T13:10:00.000Z"
        }
      ]
    })
  );
  assert.equal(resolutionFor(withEvidence, "contact-collector")?.companyStatus, "RESOLVED");
  assert.equal(resolutionFor(withEvidence, "contact-collector")?.companyId, "company-example");
  assert.ok(resolutionFor(withEvidence, "contact-collector")?.evidenceRefs.includes("approved-domain-evidence"));
});

test("conflicting governed domain evidence fails closed without choosing a company", () => {
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      companyDomains: [
        {
          companyId: "company-a",
          domain: "example.test",
          evidenceRef: "domain-a",
          observedAt: "2026-09-08T13:10:00.000Z"
        },
        {
          companyId: "company-b",
          domain: "example.test",
          evidenceRef: "domain-b",
          observedAt: "2026-09-08T13:11:00.000Z"
        }
      ]
    })
  );

  const resolved = resolutionFor(result, "contact-collector");
  assert.equal(resolved?.companyStatus, "CONFLICTED");
  assert.equal(resolved?.companyId, null);
  assert.equal(result.records[0].decisionEligible, false);
  assert.equal(result.telemetry.conflictedCompanyCount, 1);
});

test("explicit opportunity project artwork product organization and relationship edges survive with provenance", () => {
  const entityLinks = [
    ["OPPORTUNITY", "opp-1"],
    ["PROJECT", "project-1"],
    ["ARTWORK", "artwork-1"],
    ["PRODUCT", "product-1"],
    ["ORGANIZATION", "org-1"],
    ["RELATIONSHIP", "relationship-1"]
  ] as const;
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      entityLinks: entityLinks.map(([entityType, entityId], index) => ({
        canonicalEmailId: "email-1",
        entityType,
        entityId,
        evidenceRef: `edge-evidence-${index}`,
        observedAt: "2026-09-08T13:15:00.000Z"
      }))
    })
  );

  assert.equal(result.records[0].linkedEntities.length, 6);
  assert.equal(result.activities[0].linkedEntities.length, 6);
  assert.equal(result.telemetry.linkedEntityCount, 6);
  assert.ok(result.records[0].linkedEntities.every((edge) => edge.evidenceRefs.length === 1));
  assert.equal(JSON.stringify(result.records[0]).includes("Private collector inquiry"), false);
  assert.equal(JSON.stringify(result.records[0]).includes("private message body"), false);
});

test("truth/freshness evidence, source/effective timestamps and correction history remain auditable", () => {
  const previous = canonicalRecord({
    id: "email-old",
    messageId: "<old@example.test>",
    dedupeKey: "message-id:old@example.test",
    sentAt: "2026-09-07T10:00:00.000Z",
    receivedAt: "2026-09-07T10:00:05.000Z",
    provenance: [
      {
        mailboxId: "personal",
        role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        folder: "INBOX",
        uidValidity: "77",
        uid: "90",
        sourceTimestamp: "2026-09-07T10:00:06.000Z",
        ingestFingerprint: "source-old"
      }
    ],
    firstSourceTimestamp: "2026-09-07T10:00:06.000Z",
    lastSourceTimestamp: "2026-09-07T10:00:06.000Z"
  });
  const current = canonicalRecord({
    id: "email-new",
    messageId: "<new@example.test>",
    dedupeKey: "message-id:new@example.test"
  });
  const result = projectCanonicalEmailToCrmV1(
    baseInput({
      records: [current, previous],
      recordStates: [
        {
          canonicalEmailId: "email-new",
          truthState: "KNOWN",
          freshnessState: "CURRENT",
          evidenceRef: "freshness-proof",
          observedAt: "2026-09-08T13:30:00.000Z"
        }
      ],
      corrections: [
        {
          canonicalEmailId: "email-new",
          supersedesCanonicalEmailId: "email-old",
          evidenceRef: "correction-proof",
          observedAt: "2026-09-08T14:00:00.000Z"
        }
      ]
    })
  );

  const projection = result.records.find((entry) => entry.canonicalEmailId === "email-new");
  assert.equal(projection?.truthState, "KNOWN");
  assert.equal(projection?.freshnessState, "CURRENT");
  assert.equal(projection?.effectiveTimestamp, "2026-09-08T12:00:00.000Z");
  assert.equal(projection?.sourceTimestamp, "2026-09-08T12:00:06.000Z");
  assert.equal(projection?.supersedesCanonicalEmailId, "email-old");
  assert.ok(projection?.evidenceRefs.includes("freshness-proof"));
  assert.ok(projection?.evidenceRefs.includes("correction-proof"));
  assert.equal(result.telemetry.correctionCount, 1);
});

test("output and unified timeline ordering are stable across input permutations", () => {
  const recordA = canonicalRecord({ id: "email-a", messageId: "<a@example.test>", dedupeKey: "a" });
  const recordB = canonicalRecord({
    id: "email-b",
    messageId: "<b@example.test>",
    dedupeKey: "b",
    sentAt: "2026-09-08T12:40:00.000Z",
    receivedAt: "2026-09-08T12:40:05.000Z",
    provenance: [
      {
        mailboxId: "marketing",
        role: "MARKETING_FUNNELKIT",
        folder: "INBOX",
        uidValidity: "99",
        uid: "300",
        sourceTimestamp: "2026-09-08T12:40:06.000Z",
        ingestFingerprint: "source-b"
      }
    ],
    firstSourceTimestamp: "2026-09-08T12:40:06.000Z",
    lastSourceTimestamp: "2026-09-08T12:40:06.000Z"
  });
  const contacts = [contact(), contact({ contactId: "contact-keegan", email: "keegan@example.test", evidenceRef: "keegan-evidence" })];
  const first = projectCanonicalEmailToCrmV1(baseInput({ records: [recordB, recordA], contacts }));
  const second = projectCanonicalEmailToCrmV1(baseInput({ records: [recordA, recordB], contacts: [...contacts].reverse() }));

  assert.deepEqual(first, second);
  const collectorTimeline = first.contactTimelines.find((timeline) => timeline.contactId === "contact-collector");
  assert.deepEqual(collectorTimeline?.activities.map((activity) => activity.canonicalEmailId), ["email-a", "email-b"]);
});

test("malformed, duplicate, unsupported and future-dated evidence fails closed", () => {
  assert.throws(
    () => projectCanonicalEmailToCrmV1(baseInput({ records: [canonicalRecord(), canonicalRecord()] })),
    /duplicate canonical email id/
  );
  assert.throws(
    () => projectCanonicalEmailToCrmV1(baseInput({ contacts: [contact(), contact()] })),
    /duplicate contact identity evidence/
  );
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({ contacts: [contact({ email: "not-an-email" })] })
      ),
    /valid email address/
  );
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({
          companyDomains: [
            {
              companyId: "company-1",
              domain: "not a domain",
              evidenceRef: "domain-proof",
              observedAt: "2026-09-08T13:00:00.000Z"
            }
          ]
        })
      ),
    /valid governed domain/
  );
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({ contacts: [contact({ observedAt: "2026-09-09T00:00:00.000Z" })] })
      ),
    /future-dated/
  );
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({
          entityLinks: [
            {
              canonicalEmailId: "email-1",
              entityType: "NOT_SUPPORTED" as never,
              entityId: "entity-1",
              evidenceRef: "edge-proof",
              observedAt: "2026-09-08T13:00:00.000Z"
            }
          ]
        })
      ),
    /unsupported entity link type/
  );

  const malformedRecord = { ...canonicalRecord(), extraPrivateField: "must fail" } as unknown as CanonicalEmailRecordV1;
  assert.throws(
    () => projectCanonicalEmailToCrmV1(baseInput({ records: [malformedRecord] })),
    /unsupported key extraPrivateField/
  );
});

test("contradictory company membership for one resolved contact fails closed", () => {
  const dualAddress = canonicalRecord({
    participants: {
      from: ["collector@example.test", "collector@other.test"],
      to: [],
      cc: [],
      bcc: []
    }
  });
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({
          records: [dualAddress],
          contacts: [
            contact({
              email: "collector@example.test",
              companyMembership: { companyId: "company-a", evidenceRef: "member-a" }
            }),
            contact({
              email: "collector@other.test",
              evidenceRef: "crm-contact-evidence-2",
              companyMembership: { companyId: "company-b", evidenceRef: "member-b" }
            })
          ]
        })
      ),
    /contradictory company evidence/
  );
});

test("correction cycles and non-monotonic correction evidence are rejected", () => {
  const oldRecord = canonicalRecord({
    id: "email-old",
    messageId: "<old@example.test>",
    dedupeKey: "old",
    sentAt: "2026-09-08T11:00:00.000Z",
    receivedAt: "2026-09-08T11:00:05.000Z",
    provenance: [
      {
        mailboxId: "personal",
        role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        folder: "INBOX",
        uidValidity: "77",
        uid: "99",
        sourceTimestamp: "2026-09-08T11:00:06.000Z",
        ingestFingerprint: "source-old"
      }
    ],
    firstSourceTimestamp: "2026-09-08T11:00:06.000Z",
    lastSourceTimestamp: "2026-09-08T11:00:06.000Z"
  });
  const newRecord = canonicalRecord({ id: "email-new", messageId: "<new@example.test>", dedupeKey: "new" });

  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({
          records: [oldRecord, newRecord],
          corrections: [
            {
              canonicalEmailId: "email-new",
              supersedesCanonicalEmailId: "email-old",
              evidenceRef: "new-over-old",
              observedAt: "2026-09-08T14:00:00.000Z"
            },
            {
              canonicalEmailId: "email-old",
              supersedesCanonicalEmailId: "email-new",
              evidenceRef: "old-over-new",
              observedAt: "2026-09-08T14:01:00.000Z"
            }
          ]
        })
      ),
    /cycle/
  );
  assert.throws(
    () =>
      projectCanonicalEmailToCrmV1(
        baseInput({
          records: [oldRecord, newRecord],
          corrections: [
            {
              canonicalEmailId: "email-new",
              supersedesCanonicalEmailId: "email-old",
              evidenceRef: "too-early",
              observedAt: "2026-09-08T10:00:00.000Z"
            }
          ]
        })
      ),
    /non-monotonic/
  );
});

test("privacy-safe telemetry exposes counts and stable fingerprints but no private email content", () => {
  const result = projectCanonicalEmailToCrmV1(baseInput());
  const telemetry = JSON.stringify(result.telemetry);

  assert.match(telemetry, /recordCount/);
  assert.match(telemetry, /record_/);
  for (const secret of [
    "collector@example.test",
    "keegan@example.test",
    "Private collector inquiry",
    "private message body",
    "source-fingerprint-1",
    "crm-contact-evidence-1"
  ]) {
    assert.equal(telemetry.includes(secret), false, `telemetry leaked ${secret}`);
  }
});

test("runtime API has no send, mailbox mutation, persistence, contact creation, network, scheduler or model-inference capability", () => {
  const exportedNames = Object.keys(api).sort();
  assert.deepEqual(exportedNames, ["projectCanonicalEmailToCrmV1"]);
  for (const forbidden of [
    /send/i,
    /smtp/i,
    /mailbox/i,
    /delete/i,
    /move/i,
    /append/i,
    /persist/i,
    /write/i,
    /createContact/i,
    /mergeContact/i,
    /network/i,
    /schedule/i,
    /model/i
  ]) {
    assert.equal(exportedNames.some((name) => forbidden.test(name)), false);
  }
});
