import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import RelationshipCompaniesPage from "@/app/(app)/relationships/companies/page";
import RelationshipPeoplePage from "@/app/(app)/relationships/people/page";
import RelationshipsPage from "@/app/(app)/relationships/page";
import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import {
  buildCrmDirectoryIndexV1,
  filterCrmCompaniesV1,
  filterCrmPeopleV1,
  sortCrmCompaniesV1,
  sortCrmPeopleV1,
  type CrmCompanyDirectoryRecordV1,
  type CrmPersonDirectoryRecordV1
} from "@/lib/relationships-crm/crm-directory-index-v1";

const PEOPLE: readonly CrmPersonDirectoryRecordV1[] = [
  {
    id: "person-z",
    name: "Zeta Person",
    title: null,
    companyName: "Example Company",
    contactChannels: [{ kind: "EMAIL", value: null, evidenceState: "UNKNOWN" }],
    relationshipState: "WAITING_ON_CONTACT",
    relationshipStrength: "UNKNOWN",
    lastTouchAt: "2026-09-01T12:00:00.000Z",
    nextFollowUpAt: null,
    activeOpportunity: null,
    activeAsk: null,
    evidenceState: "UNKNOWN"
  },
  {
    id: "person-a",
    name: "Alpha Person",
    title: "Partnerships",
    companyName: "Arena Example",
    contactChannels: [{ kind: "EMAIL", value: "alpha@example.test", evidenceState: "KNOWN" }],
    relationshipState: "NEEDS_REPLY",
    relationshipStrength: "HIGH",
    lastTouchAt: "2026-09-08T12:00:00.000Z",
    nextFollowUpAt: "2026-09-10T12:00:00.000Z",
    activeOpportunity: "Card collaboration",
    activeAsk: "Confirm asset direction",
    evidenceState: "KNOWN"
  },
  {
    id: "person-c",
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
  }
];

const COMPANIES: readonly CrmCompanyDirectoryRecordV1[] = [
  {
    id: "company-z",
    name: "Zeta Company",
    category: null,
    keyPeople: [],
    relationshipState: "STALE",
    activeOpportunities: [],
    lastActivityAt: "2026-08-01T12:00:00.000Z",
    nextMove: "Verify evidence",
    supportedValue: null,
    evidenceState: "STALE"
  },
  {
    id: "company-a",
    name: "Arena Example",
    category: "Collectibles",
    keyPeople: ["Alpha Person"],
    relationshipState: "ACTIVE",
    activeOpportunities: ["Card collaboration"],
    lastActivityAt: "2026-09-08T12:00:00.000Z",
    nextMove: "Prepare response",
    supportedValue: "Qualitative upside supported; direct value unknown",
    evidenceState: "KNOWN"
  }
];

const INDEX = buildCrmDirectoryIndexV1({ people: PEOPLE, companies: COMPANIES });

test("CRM projection sorts people and companies deterministically with unknown names last", () => {
  assert.deepEqual(sortCrmPeopleV1(PEOPLE).map((row) => row.id), ["person-a", "person-z", "person-c"]);
  assert.deepEqual(sortCrmCompaniesV1(COMPANIES).map((row) => row.id), ["company-a", "company-z"]);
  assert.deepEqual(buildCrmDirectoryIndexV1({ people: [...PEOPLE].reverse(), companies: [...COMPANIES].reverse() }), INDEX);
});

test("CRM filtering is deterministic across names companies contact channels and evidence state", () => {
  assert.deepEqual(filterCrmPeopleV1(PEOPLE, { query: "arena" }).map((row) => row.id), ["person-a"]);
  assert.deepEqual(filterCrmPeopleV1(PEOPLE, { evidenceStates: ["UNKNOWN", "CONFLICTED"] }).map((row) => row.id), ["person-z", "person-c"]);
  assert.deepEqual(filterCrmCompaniesV1(COMPANIES, { query: "collectibles" }).map((row) => row.id), ["company-a"]);
  assert.deepEqual(filterCrmCompaniesV1(COMPANIES, { evidenceStates: ["STALE"] }).map((row) => row.id), ["company-z"]);
});

test("People directory renders contact and touchpoint fields while preserving unknown and conflicted truth", () => {
  const html = renderToString(<CrmDirectoryIndexV1 index={INDEX} mode="PEOPLE" />);

  assert.match(html, /People directory/);
  assert.match(html, /Contact/);
  assert.match(html, /Last touch/);
  assert.match(html, /Next follow-up/);
  assert.match(html, /Opportunity \/ ask/);
  assert.match(html, /Alpha Person/);
  assert.match(html, /alpha@example\.test/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, />Unknown</);
  assert.match(html, /overflow-x-auto/);
  assert.doesNotMatch(html, /href="\/relationships\/people\/[^"]+/);
});

test("Companies directory renders organization context without manufacturing numeric value", () => {
  const html = renderToString(<CrmDirectoryIndexV1 index={INDEX} mode="COMPANIES" />);

  assert.match(html, /Companies directory/);
  assert.match(html, /Key people/);
  assert.match(html, /Active opportunities/);
  assert.match(html, /Supported value/);
  assert.match(html, /Qualitative upside supported; direct value unknown/);
  assert.match(html, /STALE/);
  assert.match(html, />Unknown</);
  assert.doesNotMatch(html, /\$0(?:\.00)?/);
  assert.doesNotMatch(html, /href="\/relationships\/companies\/[^"]+/);
});

test("CRM overview exposes first-class People and Companies navigation without a prose subsystem wall", () => {
  const html = renderToString(<CrmDirectoryIndexV1 index={INDEX} mode="OVERVIEW" />);

  assert.match(html, /aria-label="CRM navigation"/);
  assert.match(html, /href="\/relationships\/people"/);
  assert.match(html, /href="\/relationships\/companies"/);
  assert.match(html, /CRM Home/);
  assert.match(html, /People/);
  assert.match(html, /Companies/);
  assert.doesNotMatch(html, /Open relationship evidence/);
});

test("production CRM routes render honest empty states and contain no synthetic contact or company fixture", () => {
  const overview = renderToString(<RelationshipsPage />);
  const people = renderToString(<RelationshipPeoplePage />);
  const companies = renderToString(<RelationshipCompaniesPage />);
  const combined = `${overview}${people}${companies}`;

  assert.match(overview, /No verified CRM records/);
  assert.match(people, /No verified people records/);
  assert.match(companies, /No verified companies records/);
  assert.doesNotMatch(combined, /Arena Club|Pentel|collector-reply|ymca-commitment|IONOS relationship intelligence/);
  assert.doesNotMatch(combined, /example\.test/);
  assert.match(combined, /Synthetic contacts and companies are intentionally not shown/);
});
