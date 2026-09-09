import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { CrmPersonDetailV1 } from "@/components/relationships-crm/CrmPersonDetailV1";
import {
  buildCrmDirectoryIndexV1,
  crmPersonDetailHrefV1,
  type CrmDirectoryIndexV1,
  type CrmPersonDirectoryRecordV1
} from "@/lib/relationships-crm/crm-directory-index-v1";
import {
  buildCrmPersonDetailV1,
  resolveCrmPersonDetailV1
} from "@/lib/relationships-crm/crm-person-detail-v1";

const knownPerson: CrmPersonDirectoryRecordV1 = {
  id: "brian-lee",
  name: "Brian Lee",
  title: "Founder",
  companyName: "Arena Club",
  contactChannels: [
    { kind: "EMAIL", value: "brian@example.test", evidenceState: "KNOWN" },
    { kind: "PHONE", value: null, evidenceState: "UNKNOWN" }
  ],
  relationshipState: "ACTIVE",
  relationshipStrength: "HIGH",
  lastTouchAt: "2026-09-04T18:00:00.000Z",
  nextFollowUpAt: "2026-09-11T18:00:00.000Z",
  activeOpportunity: "The Chase original art cards",
  activeAsk: "Confirm approved athlete source photography",
  evidenceState: "KNOWN"
};

const uncertainPerson: CrmPersonDirectoryRecordV1 = {
  id: "unknown-contact",
  name: null,
  title: null,
  companyName: null,
  contactChannels: [],
  relationshipState: null,
  relationshipStrength: "UNKNOWN",
  lastTouchAt: null,
  nextFollowUpAt: null,
  activeOpportunity: null,
  activeAsk: null,
  evidenceState: "CONFLICTED"
};

const index: CrmDirectoryIndexV1 = buildCrmDirectoryIndexV1({
  people: [uncertainPerson, knownPerson],
  companies: []
});

test("person detail href is deterministic and rejects empty ids", () => {
  assert.equal(crmPersonDetailHrefV1("brian-lee"), "/relationships/people/brian-lee");
  assert.equal(crmPersonDetailHrefV1("person/with space"), "/relationships/people/person%2Fwith%20space");
  assert.throws(() => crmPersonDetailHrefV1("  "), /non-empty string/);
});

test("verified person projects business context without inventing new fields", () => {
  const person = buildCrmPersonDetailV1(knownPerson);

  assert.equal(person.contractVersion, "crm_person_detail_v1");
  assert.equal(person.name, "Brian Lee");
  assert.equal(person.title, "Founder");
  assert.equal(person.companyName, "Arena Club");
  assert.equal(person.lastTouchAt, "2026-09-04");
  assert.equal(person.nextFollowUpAt, "2026-09-11");
  assert.equal(person.activeOpportunity, "The Chase original art cards");
  assert.equal(person.activeAsk, "Confirm approved athlete source photography");
  assert.equal(person.evidenceState, "KNOWN");
  assert.equal(person.verificationRequired, false);
  assert.match(person.recommendedNextMove, /Review the active ask/);
});

test("unknown and conflicted person facts stay unknown and verification-gated", () => {
  const person = buildCrmPersonDetailV1(uncertainPerson);
  const html = renderToString(<CrmPersonDetailV1 person={person} />);

  assert.equal(person.name, null);
  assert.equal(person.companyName, null);
  assert.equal(person.relationshipState, null);
  assert.equal(person.verificationRequired, true);
  assert.equal(person.recommendedNextMove, "Verify current relationship evidence before acting.");
  assert.match(html, /Unknown/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /Verification is required/);
  assert.doesNotMatch(html, /\$0|0%|relationship score/i);
});

test("person record workspace is scan-first, read-only, responsive, and progressively discloses depth", () => {
  const person = buildCrmPersonDetailV1(knownPerson);
  const html = renderToString(<CrmPersonDetailV1 person={person} />);

  assert.match(html, /Relationships · Person/);
  assert.match(html, /Brian Lee/);
  assert.match(html, /Arena Club/);
  assert.match(html, /Relationship snapshot/);
  assert.match(html, /Last touch/);
  assert.match(html, /Next follow-up/);
  assert.match(html, /Current business context/);
  assert.match(html, /Recommended next move/);
  assert.match(html, /Activity and touchpoint depth/);
  assert.match(html, /Evidence and provenance/);
  assert.match(html, /sm:px-6/);
  assert.match(html, /lg:grid-cols/);
  assert.doesNotMatch(html, /Send|Compose|form action=|mailto:/i);
});

test("people directory links supplied records to the implemented person route", () => {
  const html = renderToString(<CrmDirectoryIndexV1 index={index} mode="PEOPLE" />);
  assert.match(html, /href="\/relationships\/people\/brian-lee"/);
  assert.match(html, /href="\/relationships\/people\/unknown-contact"/);
});

test("resolver returns exact supplied record and fails honestly for unsupported ids", () => {
  const person = resolveCrmPersonDetailV1(index, "brian-lee");
  assert.ok(person);
  assert.equal(person.id, "brian-lee");
  assert.equal(resolveCrmPersonDetailV1(index, "missing-person"), null);
  assert.equal(resolveCrmPersonDetailV1(index, ""), null);
});

test("production dynamic route remains fail-closed until a canonical CRM loader supplies verified people", () => {
  const source = readFileSync("src/app/(app)/relationships/people/[id]/page.tsx", "utf8");

  assert.match(source, /EMPTY_CRM_DIRECTORY_INDEX_V1/);
  assert.match(source, /resolveCrmPersonDetailV1/);
  assert.match(source, /notFound\(\)/);
  assert.doesNotMatch(source, /Brian Lee|Arena Club|Pentel|Michael Jordan/);
});
