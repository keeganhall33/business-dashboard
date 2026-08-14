import test from "node:test";
import assert from "node:assert/strict";

import { CampaignDefinitionV1Schema } from "../../src/lib/lifecycle-marketing/campaign-definition-v1";
import { DRAFT_CAMPAIGNS_V1 } from "../../src/lib/lifecycle-marketing/draft-campaigns-v1";

test("exactly two deterministic draft/test campaigns validate against CampaignDefinitionV1", () => {
  assert.equal(DRAFT_CAMPAIGNS_V1.length, 2);
  for (const c of DRAFT_CAMPAIGNS_V1) {
    const parsed = CampaignDefinitionV1Schema.parse(c);
    assert.equal(parsed.live_send_enabled, false);
    assert.ok(parsed.state === "DRAFT" || parsed.state === "TEST");
  }
});

