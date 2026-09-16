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

test("canonical CRM loader hides identity-only records that provide no relationship value", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [...ACTIVE_ROWS]
  });

  assert.deepEqual(index.people, []);
  assert.deepEqual(index.companies, []);
  assert.doesNotMatch(JSON.stringify(index), /Retired Person|Invalid Company/);
});

test("unsupported identity-only CRM rows stay out of the executive directory", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [ACTIVE_ROWS[2], ACTIVE_ROWS[1]]
  });
  assert.deepEqual(index, { people: [], companies: [] });
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

test("canonical CRM loader composes Mercedes people, company, activity, follow-up, and opportunity context", async () => {
  const entities = [
    { entity_id: "person:michelle", entity_type: "person", canonical_name: "Michelle", resolution_status: "active" },
    { entity_id: "person:melody", entity_type: "person", canonical_name: "Melody", resolution_status: "active" },
    { entity_id: "organization:mercedes", entity_type: "organization", canonical_name: "Mercedes-Benz", resolution_status: "active" }
  ];
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => entities,
    loadRelationshipStates: async () => [{ contact_entity_id: "person:michelle", primary_state: "WAITING_ON_CONTACT", states: ["WAITING_ON_CONTACT", "HIGH_VALUE"], truth_state: "KNOWN", freshness_state: "CURRENT", last_meaningful_interaction_json: { effectiveTimestamp: "2026-09-11T16:00:00.000Z" }, next_best_move_json: { move: "WAIT_FOR_CONTACT" }, generated_at: "2026-09-14T16:00:00.000Z" }],
    loadActivities: async () => [{ contact_entity_id: "person:michelle", occurred_at: "2026-09-11T16:00:00.000Z", summary: "Follow-up sent", truth_state: "KNOWN" }],
    loadFollowUps: async () => [{ contact_entity_id: "person:michelle", opportunity_id: "opp-mercedes", due_at: "2026-09-22T16:00:00.000Z", status: "OPEN", truth_state: "KNOWN", freshness_state: "CURRENT" }],
    loadOpportunityLinks: async () => [
      { opportunity_id: "opp-mercedes", entity_id: "person:michelle", role: "CONTACT", truth_state: "KNOWN", freshness_state: "CURRENT" },
      { opportunity_id: "opp-mercedes", entity_id: "person:melody", role: "CONTACT", truth_state: "KNOWN", freshness_state: "CURRENT" },
      { opportunity_id: "opp-mercedes", entity_id: "organization:mercedes", role: "BRAND", truth_state: "KNOWN", freshness_state: "CURRENT" }
    ],
    loadOpportunities: async () => [{ id: "opp-mercedes", name: "Mercedes-Benz Masters collaboration", organization: "Mercedes-Benz", status: "in_conversation", next_step: "Wait for contact", value_estimate: null }]
  });

  const michelle = index.people.find((person) => person.name === "Michelle");
  const melody = index.people.find((person) => person.name === "Melody");
  const mercedes = index.companies.find((company) => company.name === "Mercedes-Benz");
  assert.equal(michelle?.companyName, "Mercedes-Benz");
  assert.equal(michelle?.relationshipState, "Waiting On Contact");
  assert.equal(michelle?.relationshipStrength, "HIGH");
  assert.equal(michelle?.nextFollowUpAt, "2026-09-22T16:00:00.000Z");
  assert.equal(michelle?.activeOpportunity, "Mercedes-Benz Masters collaboration");
  assert.equal(michelle?.activeAsk, "Wait For Contact");
  assert.equal(melody?.companyName, "Mercedes-Benz");
  assert.equal(melody?.activeOpportunity, "Mercedes-Benz Masters collaboration");
  assert.deepEqual(mercedes?.keyPeople, ["Michelle", "Melody"]);
  assert.deepEqual(mercedes?.activeOpportunities, ["Mercedes-Benz Masters collaboration"]);
});

test("CRM loader includes people and companies already present in the opportunity pipeline", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [],
    loadRelationshipStates: async () => [],
    loadActivities: async () => [],
    loadFollowUps: async () => [],
    loadOpportunityLinks: async () => [],
    loadOpportunities: async () => [
      { id: "opp-pentel", name: "Pentel artist collaboration", organization: "Pentel", status: "in_conversation", next_step: "Confirm the creative lead", next_step_due_at: "2026-09-30T00:00:00.000Z", value_estimate: 25000, contact_name: "Brooke Allen", contact_role: "Partnerships", source: "KEEGAN_CONFIRMED", updated_at: "2026-09-14T00:00:00.000Z" },
      { id: "opp-arena", name: "Arena Club partnership", organization: "Arena Club", status: "qualified", next_step: "Prepare introduction", next_step_due_at: null, value_estimate: null, contact_name: "Brian Lee", contact_role: null, source: "opportunity pipeline", updated_at: "2026-09-14T00:00:00.000Z" }
    ]
  });

  assert.deepEqual(index.people.map((person) => person.name), ["Brian Lee", "Brooke Allen"]);
  assert.deepEqual(index.companies.map((company) => company.name), ["Arena Club", "Pentel"]);
  assert.equal(index.people.find((person) => person.name === "Brooke Allen")?.companyName, "Pentel");
  assert.equal(index.companies.find((company) => company.name === "Pentel")?.supportedValue, "$25,000");
  assert.match(index.people[0]?.detailHref ?? "", /pipeline-person/);
});

test("optional editable CRM stores cannot blank existing pipeline records", async () => {
  const unavailable = async () => {
    throw new Error("relation does not exist");
  };
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [],
    loadRelationshipStates: async () => [],
    loadActivities: async () => [],
    loadFollowUps: async () => [],
    loadOpportunityLinks: async () => [],
    loadOpportunities: async () => [
      {
        id: "opp-arena",
        name: "Arena Club partnership",
        organization: "Arena Club",
        status: "in_conversation",
        next_step: "Confirm the next creative",
        contact_name: "Brian Lee",
        source: "KEEGAN_CONFIRMED",
        updated_at: "2026-09-15T00:00:00.000Z"
      }
    ],
    loadProfiles: unavailable,
    loadEntityLinks: unavailable
  });

  assert.deepEqual(index.people.map((person) => person.name), ["Brian Lee"]);
  assert.deepEqual(index.companies.map((company) => company.name), ["Arena Club"]);
  assert.equal(index.people[0]?.companyName, "Arena Club");
});

test("editable CRM profiles override derived business fields and preserve free-form company links", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [
      { entity_id: "person:andi-anchell", entity_type: "person", canonical_name: "Andi Anchell", resolution_status: "active" },
      { entity_id: "organization:public-school", entity_type: "organization", canonical_name: "Public School", resolution_status: "active" }
    ],
    loadProfiles: async () => [
      {
        entity_id: "person:andi-anchell",
        title: "Partner",
        primary_email: "andi@example.com",
        relationship_state: "In conversation",
        relationship_quality: "HIGH",
        last_touch_at: "2026-09-10T00:00:00.000Z",
        next_follow_up_at: "2026-09-20T00:00:00.000Z",
        next_move: "Confirm the next meeting"
      },
      {
        entity_id: "organization:public-school",
        category: "Creative agency",
        relationship_state: "Active partner",
        relationship_quality: "MEDIUM",
        last_touch_at: "2026-09-11T00:00:00.000Z",
        next_follow_up_at: "2026-09-21T00:00:00.000Z",
        next_move: "Share the revised concept",
        supported_value: 50000
      }
    ],
    loadEntityLinks: async () => [{
      subject_entity_id: "person:andi-anchell",
      relationship_type: "WORKS_AT",
      object_entity_id: "organization:public-school",
      role_title: "Partner",
      is_primary: true
    }]
  });

  assert.equal(index.people[0]?.companyName, "Public School");
  assert.match(index.people[0]?.companyHref ?? "", /organization%3Apublic-school/);
  assert.equal(index.people[0]?.relationshipState, "In conversation");
  assert.equal(index.people[0]?.relationshipStrength, "HIGH");
  assert.equal(index.people[0]?.lastTouchAt, "2026-09-10T00:00:00.000Z");
  assert.equal(index.people[0]?.nextFollowUpAt, "2026-09-20T00:00:00.000Z");
  assert.equal(index.people[0]?.activeAsk, "Confirm the next meeting");
  assert.equal(index.companies[0]?.relationshipState, "Active partner");
  assert.equal(index.companies[0]?.relationshipStrength, "MEDIUM");
  assert.equal(index.companies[0]?.nextFollowUpAt, "2026-09-21T00:00:00.000Z");
  assert.equal(index.companies[0]?.supportedValue, "$50,000");
});

test("CRM excludes research-only prospects and marks overdue pipeline guidance stale", async () => {
  const index = await loadCrmDirectoryIndexV1({
    loadActiveEntities: async () => [], loadRelationshipStates: async () => [], loadActivities: async () => [], loadFollowUps: async () => [], loadOpportunityLinks: async () => [],
    loadOpportunities: async () => [
      { id: "research", name: "Speculative lead", organization: "Large Brand", status: "researching", contact_name: "Research Contact", updated_at: "2026-09-14T00:00:00.000Z" },
      { id: "active", name: "Active deal", organization: "Real Client", status: "in_conversation", contact_name: "Client Contact", next_step: "Follow up yesterday", next_step_due_at: "2020-01-01T00:00:00.000Z", updated_at: "2026-09-14T00:00:00.000Z" }
    ]
  });
  assert.deepEqual(index.people.map((person) => person.name), ["Client Contact"]);
  assert.equal(index.people[0]?.evidenceState, "STALE");
  assert.match(index.people[0]?.activeAsk ?? "", /Review and update/);
});
