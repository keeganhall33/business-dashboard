import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCrmDirectoryIndexV1,
  type CrmDirectoryLoaderDependenciesV1
} from "@/lib/relationships-crm/crm-directory-loader-v1";

const ACTIVE_ROWS = [
  {
    entity_id: "person:zulu",
    entity_type: "person",
    canonical_name: "Zulu Person",
    resolution_status: "active"
  },
  {
    entity_id: "org:alpha",
    entity_type: "organization",
    canonical_name: "Alpha Company",
    resolution_status: "active"
  },
  {
    entity_id: "person:alpha",
    entity_type: "person",
    canonical_name: "Alpha Person",
    resolution_status: "active"
  },
  {
    entity_id: "person:retired",
    entity_type: "person",
    canonical_name: "Retired Person",
    resolution_status: "retired"
  },
  {
    entity_id: "",
    entity_type: "organization",
    canonical_name: "Invalid Company",
    resolution_status: "active"
  }
] as const;

test("canonical CRM loader separates active people and companies with deterministic ordering", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [...ACTIVE_ROWS]
  });

  assert.deepEqual(index.people.map((row) => row.id), ["person:alpha", "person:zulu"]);
  assert.deepEqual(index.companies.map((row) => row.id), ["org:alpha"]);
  assert.equal(index.people[0]?.detailHref, "/relationships/people/person%3Aalpha");
  assert.equal(index.companies[0]?.detailHref, "/relationships/companies/org%3Aalpha");
  assert.doesNotMatch(JSON.stringify(index), /Retired Person|Invalid Company/);
});

test("canonical identity is known while unsupported CRM fields remain unknown or empty", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [ACTIVE_ROWS[2], ACTIVE_ROWS[1]]
  });
  const person = index.people[0];
  const company = index.companies[0];

  assert.equal(person?.name, "Alpha Person");
  assert.equal(person?.evidenceState, "KNOWN");
  assert.equal(person?.relationshipStrength, "UNKNOWN");
  assert.deepEqual(person?.contactChannels, []);
  assert.equal(person?.title, null);
  assert.equal(person?.companyName, null);
  assert.equal(person?.relationshipState, null);
  assert.equal(person?.activeOpportunity, null);
  assert.equal(person?.activeAsk, null);
  assert.equal(person?.lastTouchAt, null);
  assert.equal(person?.nextFollowUpAt, null);

  assert.equal(company?.name, "Alpha Company");
  assert.equal(company?.evidenceState, "KNOWN");
  assert.deepEqual(company?.keyPeople, []);
  assert.deepEqual(company?.activeOpportunities, []);
  assert.equal(company?.category, null);
  assert.equal(company?.relationshipState, null);
  assert.equal(company?.lastActivityAt, null);
  assert.equal(company?.nextMove, null);
  assert.equal(company?.supportedValue, null);
});

test("canonical CRM loader preserves honest empty state for empty and unavailable stores", async () => {
  const empty = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => []
  });
  const unavailableDependencies: CrmDirectoryLoaderDependenciesV1 = {
    loadActiveEntities: async () => {
      throw new Error("source unavailable");
    }
  };
  const unavailable = await loadCrmDirectoryIndexV1(unavailableDependencies);

  assert.deepEqual(empty, { people: [], companies: [] });
  assert.deepEqual(unavailable, { people: [], companies: [] });
});
