import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { ClaimSchema } from "@/lib/external-intelligence/contracts/claim";
import { buildEventCandidatesFromClaimV1 } from "@/lib/external-intelligence/events/build-event-candidates-v1";

type ProductionClaimFixture = { payload_json: unknown };

function loadFixture(name: string): ProductionClaimFixture {
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "fixtures", "external-intelligence", "production-claims", name);
  return JSON.parse(readFileSync(p, "utf8")) as ProductionClaimFixture;
}

const claim1 = loadFixture("claim-1.json");
const claim2 = loadFixture("claim-2.json");
const claim3 = loadFixture("claim-3.json");

test("builder: partnership claim -> partnership_formed event", () => {
  const c = ClaimSchema.parse(claim1.payload_json) as Claim;
  const out = buildEventCandidatesFromClaimV1({ claim: c });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.event_type, "partnership_formed");
  assert.equal(out[0]?.participants.map((p) => p.role).sort().join(","), "party_a,party_b");
  assert.equal(out[0]?.attributes.length, 0);
});

test("identity: partnership is symmetric (party order reversal yields same event_id)", () => {
  const c = ClaimSchema.parse(claim1.payload_json) as Claim;
  const out1 = buildEventCandidatesFromClaimV1({ claim: c })[0];
  assert.ok(out1);

  // Reverse subject/object by swapping participant refs post-build and recompute via builder logic:
  // Here we simulate a reversed claim by swapping participants and rebuilding identity by re-running builder on a hacked claim.
  const hacked = structuredClone(c) as unknown as Record<string, unknown>;
  const origSubject = hacked.subject;
  const obj = hacked.object as unknown as { kind: string; entity: unknown };
  hacked.subject = obj.entity;
  obj.entity = origSubject;
  hacked.object = obj as unknown;

  const out2 = buildEventCandidatesFromClaimV1({ claim: ClaimSchema.parse(hacked) as Claim })[0];
  assert.ok(out2);
  assert.equal(out1.event_id, out2.event_id);
});

test("builder: appointment claim -> entity_appointed_to_role event with appointment_role", () => {
  const c = ClaimSchema.parse(claim2.payload_json) as Claim;
  const out = buildEventCandidatesFromClaimV1({ claim: c });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.event_type, "entity_appointed_to_role");
  const role = out[0]?.attributes.find((a) => a.key === "appointment_role")?.value;
  assert.equal(role, "lead digital marketing");
});

test("builder: second appointment claim -> entity_appointed_to_role event with appointment_role", () => {
  const c = ClaimSchema.parse(claim3.payload_json) as Claim;
  const out = buildEventCandidatesFromClaimV1({ claim: c });
  assert.equal(out.length, 1);
  const role = out[0]?.attributes.find((a) => a.key === "appointment_role")?.value;
  assert.equal(role, "content agency");
});

test("identity: appointment is directional (swap subject/object yields different event_id)", () => {
  const c = ClaimSchema.parse(claim2.payload_json) as Claim;
  const out1 = buildEventCandidatesFromClaimV1({ claim: c })[0];

  const hacked = structuredClone(c) as unknown as Record<string, unknown>;
  const origSubject = hacked.subject;
  const obj = hacked.object as unknown as { kind: string; entity: unknown };
  hacked.subject = obj.entity;
  obj.entity = origSubject;
  hacked.object = obj as unknown;

  const out2 = buildEventCandidatesFromClaimV1({ claim: ClaimSchema.parse(hacked) as Claim })[0];

  assert.ok(out1 && out2);
  assert.notEqual(out1.event_id, out2.event_id);
});

test("unsupported predicate -> no events", () => {
  const c = ClaimSchema.parse(claim1.payload_json) as unknown as Record<string, unknown>;
  c.predicate = "unsupported_predicate";
  const out = buildEventCandidatesFromClaimV1({ claim: ClaimSchema.parse(c) as Claim });
  assert.equal(out.length, 0);
});
