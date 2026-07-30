import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_DEDUPE_STATUSES,
  isPermanentlySuppressed,
  shouldBlockReconsiderationAfterRejection
} from "@/lib/actions/suppression-logic";

test("active dedupe statuses do not treat rejected as active", () => {
  assert.equal((ACTIVE_DEDUPE_STATUSES as readonly string[]).includes("rejected"), false);
});

test("permanent suppression blocks equivalent fingerprints", () => {
  assert.equal(isPermanentlySuppressed({ suppressed: true }), true);
  assert.equal(isPermanentlySuppressed({ suppressed: false }), false);
  assert.equal(isPermanentlySuppressed(null), false);
});

test("temporary rejection allows reconsideration only when evidence hash changes", () => {
  assert.equal(
    shouldBlockReconsiderationAfterRejection({ previousRejectedEvidenceHash: "abc", newEvidenceHash: "abc" }),
    true
  );
  assert.equal(
    shouldBlockReconsiderationAfterRejection({ previousRejectedEvidenceHash: "abc", newEvidenceHash: "def" }),
    false
  );
  assert.equal(
    shouldBlockReconsiderationAfterRejection({ previousRejectedEvidenceHash: null, newEvidenceHash: "def" }),
    false
  );
});
