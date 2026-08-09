import test from "node:test";
import assert from "node:assert/strict";

import { ExternalEventV1Schema } from "@/lib/external-intelligence/contracts/external-event-v1";
import { detectOpportunityCandidatesFromEventV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";

function mkEventVersionRef(event_id: string, content_hash = "f".repeat(64)) {
  return { event_id, content_hash, schema_version: "external_event_v1" as const, policy_version: "event_v1.policy" };
}

test("positive: Premier Padel appoints Ten Toes lead digital marketing -> 1 PLAUSIBLE candidate (marketing)", () => {
  const ev = ExternalEventV1Schema.parse({
    schema_version: "external_event_v1",
    event_id: "provisional_event:entity_appointed_to_role:aaa",
    event_type: "entity_appointed_to_role",
    participants: [
      { role: "appointing_entity", entity_ref: { entity_id: "provisional:organization:pp", entity_type: "organization", canonical_name: "Premier Padel" } },
      { role: "appointed_entity", entity_ref: { entity_id: "provisional:organization:tt", entity_type: "organization", canonical_name: "Ten Toes" } }
    ],
    attributes: [{ key: "appointment_role", value: "lead digital marketing" }],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  });

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
  assert.equal(det.candidates.length, 1);
  assert.equal(det.candidates[0]?.opportunity_type, "agency_relationship_signal");
  assert.equal(det.candidates[0]?.detector_classification, "PLAUSIBLE_NEEDS_CONTEXT");
  assert.deepEqual(det.candidates[0]?.focal_entity_refs.map((e) => e.canonical_name), ["Ten Toes"]);
  assert.deepEqual(det.candidates[0]?.context_entity_refs.map((e) => e.canonical_name), ["Premier Padel"]);
  assert.deepEqual(det.candidates[0]?.relevant_functions, ["marketing"]);
});

test("positive: MI London appoints Ten Toes content agency -> 1 PLAUSIBLE candidate (creative_content)", () => {
  const ev = ExternalEventV1Schema.parse({
    schema_version: "external_event_v1",
    event_id: "provisional_event:entity_appointed_to_role:bbb",
    event_type: "entity_appointed_to_role",
    participants: [
      { role: "appointing_entity", entity_ref: { entity_id: "provisional:organization:mil", entity_type: "organization", canonical_name: "MI London" } },
      { role: "appointed_entity", entity_ref: { entity_id: "provisional:organization:tt", entity_type: "organization", canonical_name: "Ten Toes" } }
    ],
    attributes: [{ key: "appointment_role", value: "content agency" }],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  });

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
  assert.equal(det.candidates.length, 1);
  assert.deepEqual(det.candidates[0]?.relevant_functions, ["creative_content"]);
});

test("negative: partnership_formed -> 0 candidates, rejected reason partnership_requires_context", () => {
  const ev = ExternalEventV1Schema.parse({
    schema_version: "external_event_v1",
    event_id: "provisional_event:partnership_formed:ccc",
    event_type: "partnership_formed",
    participants: [
      { role: "party_a", entity_ref: { entity_id: "provisional:organization:a", entity_type: "organization", canonical_name: "A" } },
      { role: "party_b", entity_ref: { entity_id: "provisional:organization:b", entity_type: "organization", canonical_name: "B" } }
    ],
    attributes: [],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  });

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
  assert.equal(det.candidates.length, 0);
  assert.equal(det.audit.classification, "REJECTED_NO_OPPORTUNITY");
  assert.deepEqual(det.audit.reason_codes, ["partnership_requires_context"]);
});

test("negative: appointed tax auditor -> 0 candidates", () => {
  const ev = ExternalEventV1Schema.parse({
    schema_version: "external_event_v1",
    event_id: "provisional_event:entity_appointed_to_role:ddd",
    event_type: "entity_appointed_to_role",
    participants: [
      { role: "appointing_entity", entity_ref: { entity_id: "provisional:organization:x", entity_type: "organization", canonical_name: "X" } },
      { role: "appointed_entity", entity_ref: { entity_id: "provisional:organization:y", entity_type: "organization", canonical_name: "Y" } }
    ],
    attributes: [{ key: "appointment_role", value: "tax auditor" }],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  });

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
  assert.equal(det.candidates.length, 0);
  assert.deepEqual(det.audit.reason_codes, ["irrelevant_function"]);
});

test("determinism: role whitespace/case does not change candidate id", () => {
  const base = {
    schema_version: "external_event_v1" as const,
    event_type: "entity_appointed_to_role" as const,
    participants: [
      { role: "appointing_entity", entity_ref: { entity_id: "provisional:organization:pp", entity_type: "organization", canonical_name: "Premier Padel" } },
      { role: "appointed_entity", entity_ref: { entity_id: "provisional:organization:tt", entity_type: "organization", canonical_name: "Ten Toes" } }
    ],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified" as const,
    extraction_confidence: { level: "high" as const, reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  };

  const ev1 = ExternalEventV1Schema.parse({
    ...base,
    event_id: "provisional_event:entity_appointed_to_role:eee",
    attributes: [{ key: "appointment_role", value: "Lead   Digital   Marketing" }]
  });
  const ev2 = ExternalEventV1Schema.parse({
    ...base,
    event_id: "provisional_event:entity_appointed_to_role:eee",
    attributes: [{ key: "appointment_role", value: "lead digital marketing" }]
  });

  const d1 = detectOpportunityCandidatesFromEventV1({ event: ev1, event_version_ref: mkEventVersionRef(ev1.event_id) }).candidates[0];
  const d2 = detectOpportunityCandidatesFromEventV1({ event: ev2, event_version_ref: mkEventVersionRef(ev2.event_id) }).candidates[0];

  assert.ok(d1 && d2);
  assert.equal(d1.opportunity_candidate_id, d2.opportunity_candidate_id);
});
