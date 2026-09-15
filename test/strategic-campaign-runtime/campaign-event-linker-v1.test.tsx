import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCampaignSteeringSnapshotV1, waitCampaignV1 } from "@/lib/strategic-campaign-runtime/campaign-steering-v1";
import { createLongHorizonGoalRunV1, transitionGoalRunV1 } from "@/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";
import {
  CampaignEventLinkError,
  linkCampaignCanonicalEventV1,
  type CampaignCanonicalEventV1
} from "@/lib/strategic-campaign-runtime/campaign-event-linker-v1";

const draft = createLongHorizonGoalRunV1({
  owner: "KEEGAN",
  objective: "Secure one differentiated 2027 partnership",
  initialPlan: ["research", "prepare"],
  successConditions: [{ metric: "signed_agreement", operator: "gte", value: 1 }],
  killConditions: [{ metric: "rights_unavailable", operator: "gte", value: 1 }],
  createdAt: "2026-09-01T16:00:00Z"
});
const run = transitionGoalRunV1(draft, "ACTIVE", { actor: "KEEGAN", at: "2026-09-01T16:01:00Z" });
const waiting = waitCampaignV1(createCampaignSteeringSnapshotV1(run), {
  actor: "JEEVES",
  at: "2026-09-10T16:00:00Z",
  reason: "Awaiting response",
  wakeClass: "EVENT",
  triggerValue: "event:touch_1"
});

function event(overrides: Partial<CampaignCanonicalEventV1> = {}): CampaignCanonicalEventV1 {
  return {
    eventId: "touch_1",
    source: "CRM",
    sourceRecordId: "crm_activity_9",
    occurredAt: "2026-09-15T03:00:00Z",
    campaignId: run.id,
    linkKeys: ["relationship:person_1"],
    evidenceRefs: ["evidence:email_9"],
    freshness: "CURRENT",
    confidence: "HIGH",
    materialChange: "Contact asked for a proposal",
    relationship: {
      relationshipId: "person_1",
      accessPathId: "direct_email",
      isPrimaryPath: true,
      state: "STRATEGIC_WAIT",
      authority: ["INTRODUCE", "REVIEW_PROPOSAL"]
    },
    proposedOutboundAction: { actionId: "draft_proposal", approvalClass: "KEEGAN" },
    ...overrides
  };
}

const base = {
  snapshot: waiting,
  campaignLinkKeys: ["relationship:person_1", "opportunity:opp_1"],
  knownAuthorityByRelationship: { person_1: ["INTRODUCE", "REVIEW_PROPOSAL"] }
};

describe("campaign canonical event linker v1", () => {
  it("links a material canonical event to the existing waiting campaign", () => {
    const result = linkCampaignCanonicalEventV1({ ...base, event: event() });
    assert.equal(result.disposition, "UPDATE_EXISTING");
    assert.equal(result.campaignId, run.id);
    assert.equal(result.steeringWake?.triggerValue, "event:touch_1");
    assert.deepEqual(result.evidenceRefs, ["evidence:email_9"]);
    assert.equal(result.outboundApproval?.approvalClass, "KEEGAN");
    assert.equal(result.externalSideEffects, 0);
    assert.equal(result.writesPerformed, 0);
  });

  it("suppresses duplicate events and duplicate outreach", () => {
    const result = linkCampaignCanonicalEventV1({ ...base, event: event(), appliedEventIds: ["touch_1"] });
    assert.equal(result.disposition, "DUPLICATE");
    assert.equal(result.steeringWake, null);
    assert.equal(result.duplicateOutreachCreated, false);
  });

  it("does not fuzzy-link unrelated people or evidence", () => {
    const result = linkCampaignCanonicalEventV1({
      ...base,
      event: event({ campaignId: "another_campaign", linkKeys: ["relationship:similar_name"] })
    });
    assert.equal(result.disposition, "UNRELATED");
    assert.equal(result.duplicateCampaignCreated, false);
  });

  it("keeps stale, weak, and unknown evidence at review", () => {
    for (const overrides of [
      { freshness: "STALE" as const },
      { freshness: "UNKNOWN" as const },
      { confidence: "LOW" as const },
      { confidence: "UNKNOWN" as const }
    ]) {
      assert.equal(linkCampaignCanonicalEventV1({ ...base, event: event(overrides) }).disposition, "REVIEW_REQUIRED");
    }
  });

  it("distinguishes all relationship waiting and loss states", () => {
    for (const state of ["NO_RESPONSE", "STRATEGIC_WAIT", "BLOCKED_ACCESS", "LOST_OPPORTUNITY"] as const) {
      const result = linkCampaignCanonicalEventV1({
        ...base,
        event: event({ relationship: { ...event().relationship!, state } })
      });
      assert.equal(result.relationship?.state, state);
    }
  });

  it("rejects access-path authority inflation", () => {
    assert.throws(
      () => linkCampaignCanonicalEventV1({
        ...base,
        event: event({ relationship: { ...event().relationship!, authority: ["INTRODUCE", "SIGN_CONTRACT"] } })
      }),
      (error: unknown) => error instanceof CampaignEventLinkError && error.code === "ACCESS_PATH_AUTHORITY_INFLATION"
    );
  });

  it("classifies a related event without material change as no change", () => {
    const result = linkCampaignCanonicalEventV1({ ...base, event: event({ materialChange: "" }) });
    assert.equal(result.disposition, "NO_MATERIAL_CHANGE");
    assert.equal(result.steeringWake, null);
  });

  it("is deterministic, sorted, immutable, and preserves the primary path", () => {
    const input = { ...base, event: event({ evidenceRefs: ["evidence:z", "evidence:a", "evidence:z"] }) };
    const first = linkCampaignCanonicalEventV1(input);
    const second = linkCampaignCanonicalEventV1(structuredClone(input));
    assert.deepEqual(first, second);
    assert.deepEqual(first.evidenceRefs, ["evidence:a", "evidence:z"]);
    assert.equal(first.primaryPathPreserved, true);
    assert.equal(first.authorityExpanded, false);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.relationship), true);
  });
});
