import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeMetaActions } from "../src/lib/meta-intel/action-normalization.ts";
import { normalizeCreative } from "../src/lib/meta-intel/creative-normalization.ts";

const actionsFixture = JSON.parse(
  readFileSync(new URL("./fixtures/meta-history/actions.json", import.meta.url), "utf8")
);
const creativeFixture = JSON.parse(
  readFileSync(new URL("./fixtures/meta-history/creative.json", import.meta.url), "utf8")
);

test("normalizeMetaActions selects canonical aliases", () => {
  const result = normalizeMetaActions(actionsFixture.baseline.actions, actionsFixture.baseline.action_values);
  assert.equal(result.values.purchases, 12);
  assert.equal(result.aliasMap.purchases, "offsite_conversion.fb_pixel_purchase");
  assert.equal(result.values.purchase_value, 1200.5);
  assert.equal(result.aliasMap.purchase_value, "offsite_conversion.fb_pixel_purchase");
  assert.equal(result.values.add_to_cart, 30);
  assert.equal(result.values.landing_page_views, 150);
  assert.equal(result.values.video_views, 25);
  assert.equal(result.warnings.length, 0);
});

test("normalizeMetaActions drops conflicting aliases", () => {
  const result = normalizeMetaActions(actionsFixture.conflict.actions, actionsFixture.conflict.action_values);
  assert.equal(result.values.add_to_cart, null);
  assert.ok(result.warnings.some((warning) => warning.includes("add_to_cart")));
});

test("normalizeMetaActions enforces purchase alias parity", () => {
  const result = normalizeMetaActions(actionsFixture.mismatch.actions, actionsFixture.mismatch.action_values);
  assert.equal(result.values.purchases, null);
  assert.equal(result.values.purchase_value, null);
  assert.ok(result.warnings.some((warning) => warning.includes("Purchase count/value")));
});

test("normalizeCreative strips query strings and marks ephemeral assets", () => {
  const normalized = normalizeCreative(creativeFixture);
  assert.equal(normalized.destinationPath, "/collectors/welcome");
  assert.equal(normalized.thumbnailUrl?.includes("?"), false);
  assert.equal(normalized.assetUrlEphemeral, true, "expected CDN asset to be flagged ephemeral");
  assert.equal(normalized.normalizedContent.carouselCards?.[0]?.destinationPath, "/drop/card-a");
  assert.equal(normalized.normalizedContent.templateUrl, normalized.destinationDomain ? `https://${normalized.destinationDomain}${normalized.destinationPath}` : null);
});

test("normalizeCreative hash changes only when content changes", () => {
  const baseline = normalizeCreative(creativeFixture);
  const mutated = JSON.parse(JSON.stringify(creativeFixture));
  mutated.object_story_spec.link_data.message = "Changed message";
  const changed = normalizeCreative(mutated);
  assert.notEqual(changed.contentHash, baseline.contentHash);
});
