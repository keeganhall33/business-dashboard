import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AUTHORITY_RECORDS,
  resolveSourceAuthorityV1,
  type SourceAuthorityRecordV1
} from "@/lib/intelligence/organizational-learning/source-authority-v1";

const now = "2026-09-13T23:00:00.000Z";

function record(overrides: Partial<SourceAuthorityRecordV1> = {}): SourceAuthorityRecordV1 {
  return {
    record_id: "record:1",
    source_id: "source:crm",
    source_lineage_id: "lineage:crm:1",
    domain: "crm.owner",
    authority: "CANONICAL_OPERATIONAL",
    value_fingerprint: "owner:operations",
    observed_at: "2026-09-13T22:00:00.000Z",
    truth_state: "KNOWN",
    supersedes_record_id: null,
    ...overrides
  };
}

function resolve(records: readonly SourceAuthorityRecordV1[], overrides: Record<string, unknown> = {}) {
  return resolveSourceAuthorityV1(records, {
    domain: "crm.owner",
    evaluatedAt: now,
    ...overrides
  });
}

test("selects the strongest domain-authoritative record without mutating input", () => {
  const records = [
    record({ record_id: "external", authority: "VERIFIED_EXTERNAL", value_fingerprint: "owner:sales" }),
    record({ record_id: "decision", authority: "AUTHORITATIVE_DECISION" })
  ];
  const before = structuredClone(records);
  const output = resolve(records);
  assert.equal(output.state, "CANONICAL");
  assert.equal(output.reasonCode, "AUTHORITATIVE_RECORD_SELECTED");
  assert.equal(output.canonicalRecord?.record_id, "decision");
  assert.deepEqual(records, before);
  assert.ok(Object.isFrozen(output));
  assert.ok(Object.isFrozen(output.canonicalRecord));
});

test("preserves a direct conflict between equally authoritative values", () => {
  const output = resolve([
    record({ record_id: "a", authority: "REVIEWED_INTERNAL", value_fingerprint: "value:a" }),
    record({ record_id: "b", authority: "REVIEWED_INTERNAL", value_fingerprint: "value:b" })
  ]);
  assert.equal(output.state, "CONFLICTED");
  assert.equal(output.reasonCode, "MATERIAL_AUTHORITY_CONFLICT");
  assert.deepEqual(output.conflictedRecordIds, ["a", "b"]);
  assert.equal(output.canonicalRecord, null);
});

test("does not let recency override a stronger authority class", () => {
  const output = resolve([
    record({ record_id: "decision", authority: "AUTHORITATIVE_DECISION", observed_at: "2026-09-10T00:00:00.000Z" }),
    record({ record_id: "new-inference", authority: "INFERRED", observed_at: "2026-09-13T22:59:00.000Z", value_fingerprint: "other" })
  ]);
  assert.equal(output.canonicalRecord?.record_id, "decision");
});

test("deduplicates copied lineage so repetition cannot inflate authority", () => {
  const output = resolve([
    record({ record_id: "original" }),
    record({ record_id: "copy" }),
    record({ record_id: "external", authority: "VERIFIED_EXTERNAL", source_lineage_id: "external:1", value_fingerprint: "other" })
  ]);
  assert.equal(output.state, "CANONICAL");
  assert.deepEqual(output.duplicateRecordIds, ["original"]);
  assert.equal(output.canonicalRecord?.record_id, "copy");
});

test("preserves stale authoritative evidence instead of falling through to weaker current evidence", () => {
  const output = resolve([
    record({ record_id: "old-decision", authority: "AUTHORITATIVE_DECISION", observed_at: "2026-01-01T00:00:00.000Z" }),
    record({ record_id: "current-external", authority: "VERIFIED_EXTERNAL", observed_at: "2026-09-13T22:00:00.000Z" })
  ]);
  assert.equal(output.state, "STALE");
  assert.equal(output.reasonCode, "AUTHORITATIVE_RECORD_STALE");
  assert.equal(output.canonicalRecord?.record_id, "old-decision");
});

test("tracks explicit supersession and excludes the predecessor", () => {
  const output = resolve([
    record({ record_id: "old", observed_at: "2026-09-01T00:00:00.000Z" }),
    record({ record_id: "new", observed_at: "2026-09-13T22:00:00.000Z", supersedes_record_id: "old" })
  ]);
  assert.equal(output.state, "CANONICAL");
  assert.equal(output.canonicalRecord?.record_id, "new");
  assert.deepEqual(output.supersededRecordIds, ["old"]);
});

test("returns UNKNOWN when the requested domain has no evidence", () => {
  const output = resolve([record({ domain: "other.domain" })]);
  assert.equal(output.state, "UNKNOWN");
  assert.equal(output.reasonCode, "NO_DOMAIN_EVIDENCE");
});

test("supports explicit domain authority policy without silent rank changes", () => {
  const output = resolve([
    record({ record_id: "internal", authority: "REVIEWED_INTERNAL" }),
    record({ record_id: "operational", authority: "CANONICAL_OPERATIONAL", value_fingerprint: "other" })
  ], {
    authorityOrder: ["CANONICAL_OPERATIONAL", "AUTHORITATIVE_DECISION", "REVIEWED_INTERNAL", "VERIFIED_EXTERNAL", "INFERRED"]
  });
  assert.equal(output.canonicalRecord?.record_id, "operational");
});

test("fails closed on conflicted truth even when fingerprints match", () => {
  const output = resolve([record({ truth_state: "CONFLICTED" })]);
  assert.equal(output.state, "CONFLICTED");
  assert.equal(output.canonicalRecord, null);
});

test("enforces bounded and valid inputs", () => {
  assert.equal(resolve(Array.from({ length: MAX_AUTHORITY_RECORDS + 1 }, (_, index) => record({ record_id: `r:${index}`, source_lineage_id: `l:${index}` }))).reasonCode, "INVALID_INPUT");
  assert.equal(resolve([record({ observed_at: "not-a-date" })]).reasonCode, "INVALID_INPUT");
  assert.equal(resolve([record()], { maxAgeMs: -1 }).reasonCode, "INVALID_INPUT");
  assert.equal(resolve([record()], { authorityOrder: ["INFERRED"] }).reasonCode, "INVALID_INPUT");
});

test("returns deterministic lineage and conflict order", () => {
  const records = [
    record({ record_id: "z", source_lineage_id: "z", value_fingerprint: "z" }),
    record({ record_id: "a", source_lineage_id: "a", value_fingerprint: "a" })
  ];
  assert.deepEqual(resolve(records), resolve([...records].reverse()));
  assert.deepEqual(resolve(records).evidenceLineage, ["a", "z"]);
});
