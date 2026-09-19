import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpportunityAccessEvidenceFromRelationshipRowsV1,
  type OpportunityAccessRelationshipEntryV1
} from "@/lib/opportunity-intelligence/opportunity-access-evidence-adapter-v1";

const opportunityId = "opportunity:buyer-access";

function entry(overrides: Partial<OpportunityAccessRelationshipEntryV1>): OpportunityAccessRelationshipEntryV1 {
  return {
    opportunityId,
    entityType: "PERSON",
    canonicalId: "person:introducer",
    label: "Introducer",
    resolution: "RESOLVED",
    evidenceState: "KNOWN",
    evidenceRefs: ["crm:source:1"],
    role: "REFERRER",
    freshnessState: "CURRENT",
    observedAt: "2026-09-18T12:00:00.000Z",
    ...overrides
  };
}

test("builds a warm path only from current known referrer and organization records", () => {
  const evidence = buildOpportunityAccessEvidenceFromRelationshipRowsV1({
    opportunityId,
    entries: [
      entry({}),
      entry({
        entityType: "COMPANY",
        canonicalId: "organization:buyer",
        label: "Buyer Company",
        role: "ORGANIZATION",
        evidenceRefs: ["crm:source:2"],
        observedAt: "2026-09-19T10:00:00.000Z"
      })
    ]
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.kind, "WARM_ACCESS_PATH");
  assert.deepEqual(evidence[0]?.evidenceRefs, ["crm:source:1", "crm:source:2"]);
  assert.equal(evidence[0]?.observedAt, "2026-09-19T10:00:00.000Z");
  assert.deepEqual(evidence[0]?.path.map((node) => node.label), ["Introducer", "Buyer Company"]);
});

test("does not promote ordinary contacts, stale referrers, or unsupported organizations into access evidence", () => {
  const organization = entry({
    entityType: "COMPANY",
    canonicalId: "organization:buyer",
    label: "Buyer Company",
    role: "ORGANIZATION"
  });

  for (const candidate of [
    entry({ role: "CONTACT" }),
    entry({ freshnessState: "STALE" }),
    entry({ evidenceState: "CONFLICTED" }),
    entry({ evidenceRefs: [] }),
    entry({ resolution: "UNAVAILABLE" })
  ]) {
    assert.deepEqual(
      buildOpportunityAccessEvidenceFromRelationshipRowsV1({ opportunityId, entries: [candidate, organization] }),
      []
    );
  }
});
