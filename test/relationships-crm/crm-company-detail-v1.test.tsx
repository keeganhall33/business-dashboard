import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CrmCompanyDetailV1 } from "@/components/relationships-crm/CrmCompanyDetailV1";
import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import {
  buildCrmDirectoryIndexV1,
  crmCompanyDetailHrefV1,
  type CrmCompanyDirectoryRecordV1,
  type CrmDirectoryIndexV1
} from "@/lib/relationships-crm/crm-directory-index-v1";
import {
  buildCrmCompanyDetailV1,
  resolveCrmCompanyDetailV1
} from "@/lib/relationships-crm/crm-company-detail-v1";

const knownCompany: CrmCompanyDirectoryRecordV1 = {
  id: "arena-club",
  name: "Arena Club",
  category: "Sports collectibles",
  keyPeople: ["Brian Lee"],
  relationshipState: "ACTIVE",
  activeOpportunities: ["The Chase original art cards"],
  lastActivityAt: "2026-09-04T18:00:00.000Z",
  nextMove: "Confirm approved athlete source photography",
  supportedValue: "$10k-$15k per original",
  evidenceState: "KNOWN",
  detailHref: "/relationships/companies/arena-club"
};

const uncertainCompany: CrmCompanyDirectoryRecordV1 = {
  id: "uncertain-company",
  name: null,
  category: null,
  keyPeople: [],
  relationshipState: null,
  activeOpportunities: [],
  lastActivityAt: null,
  nextMove: "Email the CEO immediately",
  supportedValue: null,
  evidenceState: "CONFLICTED"
};

const index: CrmDirectoryIndexV1 = buildCrmDirectoryIndexV1({
  people: [],
  companies: [uncertainCompany, knownCompany]
});

test("company detail href is deterministic and rejects empty ids", () => {
  assert.equal(crmCompanyDetailHrefV1("arena-club"), "/relationships/companies/arena-club");
  assert.equal(crmCompanyDetailHrefV1("company/with space"), "/relationships/companies/company%2Fwith%20space");
  assert.throws(() => crmCompanyDetailHrefV1("  "), /non-empty string/);
});

test("known company detail projects only supported directory evidence", () => {
  const company = buildCrmCompanyDetailV1(knownCompany);

  assert.equal(company.contractVersion, "crm_company_detail_v1");
  assert.equal(company.name, "Arena Club");
  assert.equal(company.category, "Sports collectibles");
  assert.deepEqual(company.keyPeople, ["Brian Lee"]);
  assert.deepEqual(company.activeOpportunities, ["The Chase original art cards"]);
  assert.equal(company.lastActivityAt, "2026-09-04");
  assert.equal(company.supportedValue, "$10k-$15k per original");
  assert.equal(company.verificationRequired, false);
  assert.equal(company.recommendedNextMove, "Confirm approved athlete source photography");
});

test("uncertain company facts remain unavailable and cannot become action certainty", () => {
  const company = buildCrmCompanyDetailV1(uncertainCompany);
  const html = renderToString(<CrmCompanyDetailV1 company={company} />);

  assert.equal(company.name, null);
  assert.equal(company.category, null);
  assert.deepEqual(company.keyPeople, []);
  assert.deepEqual(company.activeOpportunities, []);
  assert.equal(company.supportedValue, null);
  assert.equal(company.verificationRequired, true);
  assert.equal(company.recommendedNextMove, "Verify current company evidence before acting.");
  assert.notEqual(company.recommendedNextMove, uncertainCompany.nextMove);
  assert.match(html, /Unknown/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /Verification is required/);
  assert.doesNotMatch(html, /\$0|0%|relationship score/i);
});

test("company workspace is scan-first, read-only, responsive, and progressively discloses depth", () => {
  const company = buildCrmCompanyDetailV1(knownCompany);
  const html = renderToString(<CrmCompanyDetailV1 company={company} />);

  assert.match(html, /Relationships · Company/);
  assert.match(html, /Arena Club/);
  assert.match(html, /Company relationship snapshot/);
  assert.match(html, /Active opportunities/);
  assert.match(html, /Key people/);
  assert.match(html, /Recommended next move/);
  assert.match(html, /Evidence and provenance/);
  assert.match(html, /sm:px-6/);
  assert.match(html, /lg:grid-cols/);
  assert.doesNotMatch(html, /Send|Compose|form action=|mailto:/i);
});

test("companies directory links only records that supply the exact implemented canonical destination", () => {
  const html = renderToString(<CrmDirectoryIndexV1 index={index} mode="COMPANIES" />);
  assert.match(html, /href="\/relationships\/companies\/arena-club"/);
  assert.doesNotMatch(html, /href="\/relationships\/companies\/uncertain-company"/);

  const wrongHrefIndex = buildCrmDirectoryIndexV1({
    people: [],
    companies: [{ ...knownCompany, detailHref: "/relationships/companies/not-arena" }]
  });
  const wrongHrefHtml = renderToString(<CrmDirectoryIndexV1 index={wrongHrefIndex} mode="COMPANIES" />);
  assert.doesNotMatch(wrongHrefHtml, /href="\/relationships\/companies\/not-arena"/);
  assert.doesNotMatch(wrongHrefHtml, /href="\/relationships\/companies\/arena-club"/);
});

test("resolver returns exact supplied company and fails honestly for unsupported ids", () => {
  const company = resolveCrmCompanyDetailV1(index, "arena-club");
  assert.ok(company);
  assert.equal(company.id, "arena-club");
  assert.equal(resolveCrmCompanyDetailV1(index, "missing-company"), null);
  assert.equal(resolveCrmCompanyDetailV1(index, ""), null);
});

test("production dynamic route remains fail-closed until a canonical company loader exists", () => {
  const source = readFileSync("src/app/(app)/relationships/companies/[id]/page.tsx", "utf8");

  assert.match(source, /EMPTY_CRM_DIRECTORY_INDEX_V1/);
  assert.match(source, /resolveCrmCompanyDetailV1/);
  assert.match(source, /notFound\(\)/);
  assert.doesNotMatch(source, /Arena Club|Pentel|The Collect Room|Michael Jordan/);
});
