import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FunnelKitCampaignReviewCard,
  buildFunnelKitCampaignReviewFixtureV1
} from "@/components/vertical-slice/FunnelKitCampaignReviewCard";

function render() {
  return renderToStaticMarkup(
    <FunnelKitCampaignReviewCard campaign={buildFunnelKitCampaignReviewFixtureV1()} />
  );
}

test("review card is explicitly read-only draft/test and shows LIVE SEND disabled", () => {
  const html = render();

  assert.ok(html.includes("Read-only review surface"));
  assert.ok(html.includes("LIVE SEND: DISABLED"));
  assert.ok(html.includes("Mode:"));
});

test("review card keeps unknowns and blockers visible", () => {
  const html = render();
  assert.ok(html.includes("Blockers"));
  assert.ok(html.includes("Unknowns"));
});

export {};
