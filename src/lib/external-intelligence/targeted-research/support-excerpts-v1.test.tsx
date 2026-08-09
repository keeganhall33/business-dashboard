import assert from "node:assert";
import test from "node:test";

import {
  SUPPORT_EXCERPT_LIMITS_V1,
  buildSupportExcerptsV1,
  normalizeExcerptTextV1
} from "@/lib/external-intelligence/targeted-research/support-excerpts-v1";

test("support-excerpts-v1: normalizes whitespace deterministically", () => {
  assert.equal(normalizeExcerptTextV1("  a\n\n b\t c  "), "a b c");
});

test("support-excerpts-v1: dedupes duplicate excerpts deterministically", () => {
  const r = buildSupportExcerptsV1({ locator_type: "text_excerpt", texts: ["Hello\nworld", "Hello world"] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.excerpts.length, 1);
});

test("support-excerpts-v1: rejects too many excerpts", () => {
  const texts = Array.from({ length: SUPPORT_EXCERPT_LIMITS_V1.max_excerpts + 1 }, (_, i) => `ex${i}`);
  const r = buildSupportExcerptsV1({ locator_type: "text_excerpt", texts });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, "too_many_excerpts");
});

test("support-excerpts-v1: rejects excerpt too long", () => {
  const long = "x".repeat(SUPPORT_EXCERPT_LIMITS_V1.max_chars_per_excerpt + 1);
  const r = buildSupportExcerptsV1({ locator_type: "text_excerpt", texts: [long] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, "excerpt_too_long");
});

test("support-excerpts-v1: rejects total chars exceeded", () => {
  const a = "a".repeat(600);
  const b = "b".repeat(600);
  const r = buildSupportExcerptsV1({ locator_type: "text_excerpt", texts: [a, b] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, "total_excerpt_chars_exceeded");
});
