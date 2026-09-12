import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import {
  ExecutiveOpportunityDetailV1,
  buildExecutiveOpportunityDetailViewV1
} from "@/components/opportunity-intelligence/ExecutiveOpportunityDetailV1";
import type { ExecutiveCommandCenterOpportunityV1 } from "@/lib/executive-home/fixtures";
import {
  projectOpportunityRelationshipLinksV1,
  type OpportunityRelationshipEvidenceV1
} from "@/lib/opportunity-intelligence/opportunity-relationship-links-v1";

const opportunity: ExecutiveCommandCenterOpportunityV1 = {
  id: "mercedes-masters",
  title: "Mercedes Masters",
  upside: "UNKNOWN",
  fit: "Strong brand fit",
  timing: "Prepare",
  effort: "UNKNOWN",
  evidence: "KNOWN",
  next_move: "Verify buyer and planning window.",
  detail_href: "/opportunities-actions/opportunity/mercedes-masters"
};

function person(overrides: Partial<OpportunityRelationshipEvidenceV1> = {}): OpportunityRelationshipEvidenceV1 {
  return {
    opportunityId: opportunity.id,
    entityType: "PERSON",
    canonicalId: "person-michelle",
    label: "Michelle Bevilacqua",
    href: "/relationships/people/person-michelle",
    resolution: "RESOLVED",
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:person:michelle"],
    ...overrides
  };
}

function company(overrides: Partial<OpportunityRelationshipEvidenceV1> = {}): OpportunityRelationshipEvidenceV1 {
  return {
    opportunityId: opportunity.id,
    entityType: "COMPANY",
    canonicalId: "company-public-school",
    label: "Public School",
    href: "/relationships/companies/company-public-school",
    resolution: "RESOLVED",
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:company:public-school"],
    ...overrides
  };
}

test("projects only exact evidence-supported canonical person and company routes", () => {
  const result = projectOpportunityRelationshipLinksV1({
    opportunityId: opportunity.id,
    evidence: [company(), person()]
  });

  assert.deepEqual(result.links.map((link) => ({ type: link.entityType, label: link.label, href: link.href })), [
    {
      type: "PERSON",
      label: "Michelle Bevilacqua",
      href: "/relationships/people/person-michelle"
    },
    {
      type: "COMPANY",
      label: "Public School",
      href: "/relationships/companies/company-public-school"
    }
  ]);
  assert.deepEqual(result.withheld, []);
  assert.equal(result.verificationRequired, false);
});

test("ambiguous missing inferred stale conflicted and unsupported evidence never becomes a link", () => {
  const evidence: OpportunityRelationshipEvidenceV1[] = [
    person({ canonicalId: "person-ambiguous", href: "/relationships/people/person-ambiguous", resolution: "AMBIGUOUS" }),
    person({ canonicalId: null, label: null, href: null, resolution: "UNAVAILABLE" }),
    person({ canonicalId: "person-inferred", href: "/relationships/people/person-inferred", evidenceState: "INFERRED" }),
    company({ canonicalId: "company-stale", href: "/relationships/companies/company-stale", evidenceState: "STALE" }),
    company({ canonicalId: "company-conflicted", href: "/relationships/companies/company-conflicted", evidenceState: "CONFLICTED" }),
    company({ canonicalId: "company-wrong-route", href: "/relationships/people/company-wrong-route" })
  ];

  const result = projectOpportunityRelationshipLinksV1({ opportunityId: opportunity.id, evidence });
  assert.equal(result.links.length, 0);
  assert.equal(result.verificationRequired, true);
  assert.deepEqual(
    new Set(result.withheld.map((item) => item.reason)),
    new Set(["AMBIGUOUS", "UNAVAILABLE", "INFERRED", "STALE", "CONFLICTED", "UNSUPPORTED_HREF"])
  );
});

test("exact duplicate evidence is merged deterministically while conflicting duplicates fail closed", () => {
  const merged = projectOpportunityRelationshipLinksV1({
    opportunityId: opportunity.id,
    evidence: [
      person({ evidenceRefs: ["evidence:b"] }),
      person({ evidenceRefs: ["evidence:a"] })
    ]
  });
  assert.equal(merged.links.length, 1);
  assert.deepEqual(merged.links[0].evidenceRefs, ["evidence:a", "evidence:b"]);

  const conflicted = projectOpportunityRelationshipLinksV1({
    opportunityId: opportunity.id,
    evidence: [person(), person({ label: "Different supplied label" })]
  });
  assert.equal(conflicted.links.length, 0);
  assert.deepEqual(conflicted.withheld, [{
    entityType: "PERSON",
    canonicalId: "person-michelle",
    reason: "DUPLICATE_CONFLICT"
  }]);
});

test("cross-opportunity evidence is rejected instead of leaking relationship context", () => {
  assert.throws(
    () => projectOpportunityRelationshipLinksV1({
      opportunityId: opportunity.id,
      evidence: [person({ opportunityId: "different-opportunity" })]
    }),
    /OPPORTUNITY_RELATIONSHIP_SCOPE_MISMATCH/
  );
});

test("opportunity detail renders compact supported relationship links and withholds dead CTAs", () => {
  const evidence = [
    person(),
    company(),
    person({
      canonicalId: "person-unverified",
      label: "Unverified person",
      href: "/relationships/people/person-unverified",
      evidenceState: "UNKNOWN"
    })
  ];
  const view = buildExecutiveOpportunityDetailViewV1(opportunity, evidence);
  const html = renderToString(
    <ExecutiveOpportunityDetailV1 opportunity={opportunity} relationshipEvidence={evidence} />
  );

  assert.equal(view.relatedRelationships.links.length, 2);
  assert.equal(view.relatedRelationships.withheld.length, 1);
  assert.equal(view.verificationRequired, true);
  assert.match(html, /Related relationships/);
  assert.match(html, /Evidence-supported CRM context/);
  assert.match(html, /href="\/relationships\/people\/person-michelle"/);
  assert.match(html, /href="\/relationships\/companies\/company-public-school"/);
  assert.match(html, /1(?:<!-- -->)? relationship link(?:<!-- -->)? withheld pending verification/);
  assert.doesNotMatch(html, /href="\/relationships\/people\/person-unverified"/);
});

test("relationship section is absent when supplied evidence cannot support a canonical destination", () => {
  const evidence = [person({ evidenceState: "STALE" })];
  const html = renderToString(
    <ExecutiveOpportunityDetailV1 opportunity={opportunity} relationshipEvidence={evidence} />
  );

  assert.doesNotMatch(html, /Related relationships/);
  assert.doesNotMatch(html, /href="\/relationships\/people\/person-michelle"/);
  assert.match(html, /VERIFICATION REQUIRED/);
});

test("free-text opportunity title and next move are never used to invent identity or href", () => {
  const suggestiveOpportunity = {
    ...opportunity,
    title: "Michelle at Public School for Mercedes",
    next_move: "Email Michelle at Public School"
  };
  const view = buildExecutiveOpportunityDetailViewV1(suggestiveOpportunity, null);
  const html = renderToString(<ExecutiveOpportunityDetailV1 opportunity={suggestiveOpportunity} />);

  assert.equal(view.relatedRelationships.links.length, 0);
  assert.doesNotMatch(html, /\/relationships\/people\/person-michelle/);
  assert.doesNotMatch(html, /\/relationships\/companies\/company-public-school/);
});
