import test from "node:test";
import assert from "node:assert/strict";

import { adaptInternalConfidenceToConfidenceAxes } from "@/lib/external-intelligence/adapters/intelligence-v1/confidence.adapter";

test("legacy confidence maps to overall only; other axes remain unknown", () => {
  const out = adaptInternalConfidenceToConfidenceAxes({
    confidence: { level: "likely", reasons: ["x"] }
  });

  assert.equal(out.confidence.overall.level, "likely");
  assert.equal(out.confidence.evidence.level, "unknown");
  assert.ok(out.confidence.overall.reasons.some((r) => r.includes("mapped_from_legacy_confidence")));
});
