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

test("normalizeMetaActions ignores duplicate purchase entries", () => {
  const result = normalizeMetaActions(
    actionsFixture.duplicatePurchase.actions,
    actionsFixture.duplicatePurchase.action_values
  );
  assert.equal(result.values.purchases, 5);
  assert.equal(result.aliasMap.purchases, "offsite_conversion.fb_pixel_purchase");
});

test("normalizeMetaActions drops conflicting purchase aliases", () => {
  const result = normalizeMetaActions(
    actionsFixture.purchaseAliasConflict.actions,
    actionsFixture.purchaseAliasConflict.action_values
  );
  assert.equal(result.values.purchases, null);
  assert.ok(result.warnings.some((warning) => warning.includes("Conflicting values for purchases")));
});

test("normalizeMetaActions enforces purchase count/value parity", () => {
  const result = normalizeMetaActions(
    actionsFixture.purchaseValueMismatch.actions,
    actionsFixture.purchaseValueMismatch.action_values
  );
  assert.equal(result.values.purchases, null);
  assert.equal(result.values.purchase_value, null);
});

test("normalizeMetaActions handles missing actions", () => {
  const result = normalizeMetaActions(actionsFixture.missing.actions, actionsFixture.missing.action_values);
  assert.equal(result.values.purchases, null);
  assert.equal(result.values.add_to_cart, null);
});

test("normalizeMetaActions selects known alias fallbacks", () => {
  const result = normalizeMetaActions(actionsFixture.aliasCoverage.actions, actionsFixture.aliasCoverage.action_values);
  assert.equal(result.aliasMap.add_to_cart, "add_to_cart");
  assert.equal(result.aliasMap.initiate_checkout, "onsite_conversion.initiate_checkout");
  assert.equal(result.aliasMap.landing_page_views, "landing_page_views");
});

test("normalizeCreative strips query strings and marks ephemeral assets", () => {
  const normalized = normalizeCreative(creativeFixture);
  assert.equal(normalized.destinationPath, "/collectors/welcome");
  assert.equal(normalized.thumbnailUrl?.includes("?"), false);
  assert.equal(normalized.assetUrlEphemeral, true, "expected CDN asset to be flagged ephemeral");
  assert.equal(normalized.normalizedContent.carouselCards?.[0]?.destinationPath, "/drop/card-a");
  assert.equal(
    normalized.normalizedContent.templateUrl,
    normalized.destinationDomain ? `https://${normalized.destinationDomain}${normalized.destinationPath}` : null
  );
});

test("normalizeCreative hash changes only when content changes", () => {
  const baseline = normalizeCreative(creativeFixture);
  const mutated = JSON.parse(JSON.stringify(creativeFixture));
  mutated.object_story_spec.link_data.message = "Changed message";
  const changed = normalizeCreative(mutated);
  assert.notEqual(changed.contentHash, baseline.contentHash);
});

test("normalizeCreative strips fragments and preserves stable hash for key order", () => {
  const baseline = normalizeCreative(creativeFixture);
  const withFragment = JSON.parse(JSON.stringify(creativeFixture));
  withFragment.object_story_spec.link_data.link = `${withFragment.object_story_spec.link_data.link}#hero`;
  const fragmentNormalized = normalizeCreative(withFragment);
  assert.equal(fragmentNormalized.destinationPath, baseline.destinationPath);
  const reordered = JSON.parse(JSON.stringify(creativeFixture));
  if (reordered.object_story_spec.link_data.child_attachments) {
    reordered.object_story_spec.link_data.child_attachments = [
      ...reordered.object_story_spec.link_data.child_attachments
    ].reverse();
  }
  const reorderedNormalized = normalizeCreative(reordered);
  assert.equal(reorderedNormalized.contentHash, baseline.contentHash);
});
