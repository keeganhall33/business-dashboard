import assert from "node:assert";
import test from "node:test";

import { extractAgencyScopeSupportExcerptsFromHtmlV1 } from "@/lib/external-intelligence/targeted-research/agency-scope-support-extractor-v1";

test("agency-scope-support-extractor-v1: extracts key remit sentences from HTML", () => {
  const html = `
    <html><body>
      <p>Ten Toes will be tasked with delivering a comprehensive content and channel strategy in order to guide growth.</p>
      <p>Ten Toes will provide always-on strategic support and dedicated campaign delivery across key moments.</p>
      <p>The agency will also lead campaign planning and execution across activations throughout 2026 and 2027.</p>
    </body></html>
  `;

  const ex = extractAgencyScopeSupportExcerptsFromHtmlV1({ html });
  assert.match(String(ex.content_and_channel), /content and channel strategy/i);
  assert.match(String(ex.campaign_delivery), /campaign delivery/i);
  assert.match(String(ex.campaign_planning_execution), /campaign planning and execution/i);
});
