import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import {
  FunnelKitCampaignReviewCard,
  buildFunnelKitCampaignReviewFixtureV1
} from "@/components/vertical-slice/FunnelKitCampaignReviewCard";

function render() {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<FunnelKitCampaignReviewCard campaign={buildFunnelKitCampaignReviewFixtureV1()} />);
  });
  return renderer!;
}

test("review card is explicitly read-only draft/test and shows LIVE SEND disabled", () => {
  const renderer = render();
  const text = renderer.toJSON();
  const flat = JSON.stringify(text);

  assert.ok(flat.includes("Read-only review surface"));
  assert.ok(flat.includes("LIVE SEND: DISABLED"));
  assert.ok(flat.includes("Mode:"));
});

test("review card keeps unknowns and blockers visible", () => {
  const renderer = render();
  const flat = JSON.stringify(renderer.toJSON());
  assert.ok(flat.includes("Blockers"));
  assert.ok(flat.includes("Unknowns"));
});

export {};
