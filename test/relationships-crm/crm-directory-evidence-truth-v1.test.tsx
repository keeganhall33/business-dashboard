import assert from "node:assert/strict";
import test from "node:test";

import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

const ENTITIES = [
  {
    entity_id: "person:buyer",
    entity_type: "person",
    canonical_name: "Buyer Person",
    resolution_status: "active"
  },
  {
    entity_id: "organization:brand",
    entity_type: "organization",
    canonical_name: "Brand Company",
    resolution_status: "active"
  }
] as const;

const LINKS = [
  {
    opportunity_id: "opp-1",
    entity_id: "person:buyer",
    role: "CONTACT",
    truth_state: "KNOWN",
    freshness_state: "CURRENT"
  },
  {
    opportunity_id: "opp-1",
    entity_id: "organization:brand",
    role: "BRAND",
    truth_state: "KNOWN",
    freshness_state: "CURRENT"
  }
] as const;

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    name: "Brand collaboration",
    organization: "Brand Company",
    status: "in_conversation",
    next_step: "Review the opportunity",
    next_step_due_at: null,
    value_estimate: null,
    contact_name: "Buyer Person",
    contact_role: "Partnerships",
    source: "IMPORTED_PIPELINE",
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

async function loadWithOpportunity(overrides: Record<string, unknown> = {}) {
  return loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [...ENTITIES],
    loadRelationshipStates: async () => [],
    loadActivities: async () => [],
    loadFollowUps: async () => [],
    loadOpportunityLinks: async () => [...LINKS],
    loadOpportunities: async () => [opportunity(overrides)],
    loadProfiles: async () => [],
    loadEntityLinks: async () => []
  });
}

test("canonical identity does not upgrade unconfirmed opportunity evidence to KNOWN", async () => {
  const index = await loadWithOpportunity();

  assert.equal(index.people[0]?.name, "Buyer Person");
  assert.equal(index.people[0]?.evidenceState, "UNKNOWN");
  assert.equal(index.companies[0]?.name, "Brand Company");
  assert.equal(index.companies[0]?.evidenceState, "UNKNOWN");
});

test("explicit user-confirmed opportunity evidence can remain KNOWN after canonical linking", async () => {
  const index = await loadWithOpportunity({ source: "KEEGAN_CONFIRMED" });

  assert.equal(index.people[0]?.evidenceState, "KNOWN");
  assert.equal(index.companies[0]?.evidenceState, "KNOWN");
});

test("stale opportunity evidence stays STALE after canonical linking", async () => {
  const index = await loadWithOpportunity({
    source: "KEEGAN_CONFIRMED",
    updated_at: "2020-01-01T00:00:00.000Z"
  });

  assert.equal(index.people[0]?.evidenceState, "STALE");
  assert.equal(index.companies[0]?.evidenceState, "STALE");
});

test("explicit editable canonical profiles remain KNOWN without inventing relationship evidence", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [...ENTITIES],
    loadRelationshipStates: async () => [],
    loadActivities: async () => [],
    loadFollowUps: async () => [],
    loadOpportunityLinks: async () => [],
    loadOpportunities: async () => [],
    loadProfiles: async () => [
      {
        entity_id: "person:buyer",
        title: "Partnerships",
        primary_email: "buyer@example.com"
      },
      {
        entity_id: "organization:brand",
        category: "Brand"
      }
    ],
    loadEntityLinks: async () => []
  });

  assert.equal(index.people[0]?.evidenceState, "KNOWN");
  assert.equal(index.companies[0]?.evidenceState, "KNOWN");
});
