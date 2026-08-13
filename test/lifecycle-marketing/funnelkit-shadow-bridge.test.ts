import assert from "node:assert/strict";
import test from "node:test";

import { buildFunnelKitShadowPayloadV1 } from "@/lib/lifecycle-marketing/funnelkit/shadow-bridge/contact-decision-profile-mapper";
import type { ContactDecisionProfileV1 } from "@/lib/lifecycle-marketing/funnelkit/shadow-bridge/contact-decision-profile.contract";

test("shadow payload is deterministic and never enables live send", () => {
  const profile: ContactDecisionProfileV1 = {
    contact_id: "c_001",
    email: "vip@example.com",
    first_name: "Keegan",
    last_name: "Hall",
    decision_tags: ["collector_vip", "past_buyer"],
    preferred_segments: ["vip"],
    last_purchase_at: "2026-08-01T00:00:00Z",
    custom_fields: { source: "manual", spend_usd: 12000, opted_in: true }
  };

  const out = buildFunnelKitShadowPayloadV1(profile);
  assert.equal(out.mode, "SHADOW");
  assert.equal(out.live_send_enabled, false);
  assert.equal(out.meta.schema_version, "funnelkit_shadow_payload_v1");
  assert.equal(out.meta.contact_id, "c_001");
  assert.equal(out.fields["decision.tags"], "collector_vip,past_buyer");
  assert.equal(out.fields["custom.spend_usd"], "12000");
  assert.equal(out.fields["custom.opted_in"], "true");
});

test("missing critical profile data remains explicit UNKNOWN (not fabricated)", () => {
  const profile: ContactDecisionProfileV1 = {
    contact_id: "c_002",
    email: null,
    first_name: null,
    last_name: null,
    decision_tags: null,
    preferred_segments: null,
    last_purchase_at: null,
    custom_fields: null
  };

  const out = buildFunnelKitShadowPayloadV1(profile);
  assert.equal(out.live_send_enabled, false);
  assert.ok(out.meta.unknowns.includes("contact.email"));
  assert.ok(out.meta.unknowns.includes("decision.tags"));
  assert.ok(out.meta.unknowns.includes("commerce.last_purchase_at"));
  assert.ok(out.meta.unknowns.includes("custom_fields"));
  // Must not synthesize fake email/name fields.
  assert.equal(Object.prototype.hasOwnProperty.call(out.fields, "contact.email"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out.fields, "contact.first_name"), false);
});

export {};
