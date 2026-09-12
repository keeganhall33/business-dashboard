import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateKnowledgeIntegrityV1,
  type KnowledgeIntegrityFindingType,
  type KnowledgeIntegrityObservationV1
} from "@/lib/intelligence/knowledge-compilation/knowledge-integrity-v1";

const observedAt = "2026-09-12T20:00:00Z";

function observation(
  findingType: KnowledgeIntegrityFindingType,
  overrides: Partial<KnowledgeIntegrityObservationV1> = {}
): KnowledgeIntegrityObservationV1 {
  return {
    observation_id: `obs:${findingType.toLowerCase()}`,
    finding_type: findingType,
    affected_canonical_ids: ["entity:1"],
    evidence_refs: ["evidence:1"],
    source_lineage_refs: ["source:1"],
    truth_state: "KNOWN",
    freshness_state: "FRESH",
    business_impact: "NONE",
    time_state: "NOT_TIME_SENSITIVE",
    direct_evidence: true,
    first_seen: "2026-09-12T19:00:00Z",
    observed_at: observedAt,
    ...overrides
  };
}

const allFindingTypes: readonly KnowledgeIntegrityFindingType[] = [
  "DUPLICATE_ENTITY_CANDIDATE",
  "CONTRADICTORY_FACT",
  "STALE_CANONICAL_OBJECT",
  "MISSING_PROVENANCE",
  "ORPHANED_RELATIONSHIP",
  "ORPHANED_OPPORTUNITY",
  "MISSING_NEXT_ACTION",
  "OVERDUE_COMMITMENT",
  "UNRESOLVED_REFERENCE",
  "AMBIGUOUS_ENTITY_RESOLUTION",
  "STALE_DERIVED_SUMMARY",
  "UNRESOLVED_LEARNING_REVIEW",
  "SILENT_SUPERSESSION_RISK",
  "DUPLICATE_SOURCE_LINEAGE",
  "UNKNOWN_OWNER",
  "INVALID_TEMPORAL_ORDER"
];

test("clean bounded input produces no findings", () => {
  const findings = evaluateKnowledgeIntegrityV1({ observations: [] });
  assert.deepEqual(findings, []);
  assert.ok(Object.isFrozen(findings));
});

test("every required integrity finding class produces bounded structured output", () => {
  const findings = evaluateKnowledgeIntegrityV1({
    observations: allFindingTypes.map((findingType, index) =>
      observation(findingType, {
        observation_id: `obs:${index}`,
        affected_canonical_ids: [`entity:${index}`],
        source_lineage_refs: [`source:${index}`]
      })
    )
  });

  assert.equal(findings.length, allFindingTypes.length);
  assert.deepEqual(
    [...findings.map((finding) => finding.finding_type)].sort(),
    [...allFindingTypes].sort()
  );
  for (const finding of findings) {
    assert.equal(finding.contract_version, "KNOWLEDGE_INTEGRITY_V1");
    assert.match(finding.finding_id, /^integrity:[0-9a-f]{8}$/);
    assert.ok(finding.reason_code.length > 0);
    assert.ok(finding.recommended_next_step.length > 0);
    assert.ok(Object.isFrozen(finding));
    assert.ok(Object.isFrozen(finding.affected_canonical_ids));
  }
});

test("direct conflicting evidence affecting an active decision is blocking", () => {
  const [finding] = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("CONTRADICTORY_FACT", {
        truth_state: "CONFLICTED",
        business_impact: "ACTIVE_DECISION",
        direct_evidence: true
      })
    ]
  });

  assert.equal(finding.severity, "BLOCKING");
  assert.equal(finding.review_required, true);
  assert.equal(finding.recommended_next_step, "REVIEW_CONFLICT");
});

test("ordinary stale housekeeping does not become a blocking failure", () => {
  const [finding] = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("STALE_CANONICAL_OBJECT", {
        truth_state: "STALE",
        freshness_state: "STALE",
        business_impact: "NONE",
        direct_evidence: false
      })
    ]
  });

  assert.equal(finding.severity, "REVIEW");
  assert.equal(finding.review_required, false);
});

test("same underlying duplicate source lineage produces one finding instead of confidence inflation", () => {
  const findings = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("DUPLICATE_SOURCE_LINEAGE", {
        observation_id: "obs:copy-a",
        affected_canonical_ids: ["fact:a"],
        source_lineage_refs: ["origin:press-release:42"]
      }),
      observation("DUPLICATE_SOURCE_LINEAGE", {
        observation_id: "obs:copy-b",
        affected_canonical_ids: ["fact:b"],
        source_lineage_refs: ["origin:press-release:42"]
      })
    ]
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].finding_type, "DUPLICATE_SOURCE_LINEAGE");
  assert.equal(findings[0].severity, "INFO");
});

test("contradictory direct evidence outranks ordinary missing metadata", () => {
  const findings = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("UNKNOWN_OWNER", {
        observation_id: "obs:owner",
        source_lineage_refs: ["source:owner"],
        observed_at: "2026-09-12T20:30:00Z"
      }),
      observation("CONTRADICTORY_FACT", {
        observation_id: "obs:conflict",
        source_lineage_refs: ["source:conflict"],
        truth_state: "CONFLICTED",
        business_impact: "ACTIVE_DECISION",
        observed_at: "2026-09-12T19:30:00Z"
      })
    ]
  });

  assert.equal(findings[0].finding_type, "CONTRADICTORY_FACT");
  assert.equal(findings[0].severity, "BLOCKING");
});

test("active high-value overdue commitment outranks a dormant low-risk orphan", () => {
  const findings = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("ORPHANED_OPPORTUNITY", {
        observation_id: "obs:orphan",
        source_lineage_refs: ["source:orphan"],
        business_impact: "NONE"
      }),
      observation("OVERDUE_COMMITMENT", {
        observation_id: "obs:commitment",
        source_lineage_refs: ["source:commitment"],
        business_impact: "ACTIVE_HIGH_VALUE_OPPORTUNITY",
        time_state: "OVERDUE"
      })
    ]
  });

  assert.equal(findings[0].finding_type, "OVERDUE_COMMITMENT");
  assert.equal(findings[0].severity, "IMPORTANT");
});

test("unsupported importance never turns missing provenance into fabricated blocking urgency", () => {
  const [finding] = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("MISSING_PROVENANCE", {
        evidence_refs: [],
        source_lineage_refs: [],
        business_impact: "ACTIVE_HIGH_VALUE_OPPORTUNITY",
        time_state: "NOT_TIME_SENSITIVE"
      })
    ]
  });

  assert.equal(finding.severity, "IMPORTANT");
  assert.notEqual(finding.severity, "BLOCKING");
  assert.equal(finding.time_state, "NOT_TIME_SENSITIVE");
});

test("output ordering is deterministic regardless of observation order", () => {
  const observations = [
    observation("UNRESOLVED_REFERENCE", {
      observation_id: "obs:reference",
      affected_canonical_ids: ["ref:1"],
      source_lineage_refs: ["source:reference"],
      truth_state: "UNKNOWN"
    }),
    observation("OVERDUE_COMMITMENT", {
      observation_id: "obs:overdue",
      affected_canonical_ids: ["commitment:1"],
      source_lineage_refs: ["source:overdue"],
      business_impact: "ACTIVE_DECISION",
      time_state: "OVERDUE"
    }),
    observation("STALE_DERIVED_SUMMARY", {
      observation_id: "obs:summary",
      affected_canonical_ids: ["summary:1"],
      source_lineage_refs: ["source:summary"],
      truth_state: "STALE",
      freshness_state: "STALE"
    })
  ] as const;

  const forward = evaluateKnowledgeIntegrityV1({ observations });
  const reverse = evaluateKnowledgeIntegrityV1({ observations: [...observations].reverse() });
  assert.deepEqual(forward, reverse);
});

test("UNKNOWN remains explicit rather than becoming healthy, false, or known", () => {
  const [finding] = evaluateKnowledgeIntegrityV1({
    observations: [
      observation("UNRESOLVED_REFERENCE", {
        truth_state: "UNKNOWN",
        freshness_state: "UNKNOWN",
        direct_evidence: false
      })
    ]
  });

  assert.equal(finding.truth_state, "UNKNOWN");
  assert.equal(finding.freshness_state, "UNKNOWN");
  assert.equal(finding.severity, "REVIEW");
});

test("evaluation cannot mutate supplied observations and returned findings are immutable", () => {
  const mutable = {
    observation_id: "obs:immutability",
    finding_type: "UNKNOWN_OWNER" as const,
    affected_canonical_ids: ["opportunity:1"],
    evidence_refs: ["evidence:1"],
    source_lineage_refs: ["source:1"],
    truth_state: "UNKNOWN" as const,
    freshness_state: "FRESH" as const,
    business_impact: "ACTIVE_DECISION" as const,
    time_state: "NOT_TIME_SENSITIVE" as const,
    direct_evidence: false,
    first_seen: null,
    observed_at: observedAt
  };
  const snapshot = structuredClone(mutable);

  const [finding] = evaluateKnowledgeIntegrityV1({ observations: [mutable] });
  assert.deepEqual(mutable, snapshot);
  assert.ok(Object.isFrozen(finding));
  assert.ok(Object.isFrozen(finding.evidence_refs));
  assert.throws(() => {
    (finding.affected_canonical_ids as string[]).push("entity:mutated");
  });
});

test("bounded input rejects raw payloads, secret-like fields, and oversized arrays", () => {
  const raw = {
    ...observation("CONTRADICTORY_FACT"),
    source_body: "raw private source text"
  } as unknown as KnowledgeIntegrityObservationV1;
  assert.throws(
    () => evaluateKnowledgeIntegrityV1({ observations: [raw] }),
    /RAW_OR_SECRET_FIELD_FORBIDDEN/
  );

  const secret = {
    ...observation("MISSING_PROVENANCE"),
    credential_token: "must-not-survive"
  } as unknown as KnowledgeIntegrityObservationV1;
  assert.throws(
    () => evaluateKnowledgeIntegrityV1({ observations: [secret] }),
    /RAW_OR_SECRET_FIELD_FORBIDDEN/
  );

  assert.throws(
    () => evaluateKnowledgeIntegrityV1({
      observations: [
        observation("UNKNOWN_OWNER", {
          affected_canonical_ids: Array.from({ length: 17 }, (_, index) => `entity:${index}`)
        })
      ]
    }),
    /AFFECTED_CANONICAL_IDS_TOO_MANY/
  );
});

test("malformed canonical metadata fails closed", () => {
  assert.throws(
    () => evaluateKnowledgeIntegrityV1({
      observations: [
        observation("UNKNOWN_OWNER", { observed_at: "not-a-timestamp" })
      ]
    }),
    /OBSERVED_AT_INVALID/
  );

  const unsupported = {
    ...observation("UNKNOWN_OWNER"),
    finding_type: "MAGIC_HEALTHY"
  } as unknown as KnowledgeIntegrityObservationV1;
  assert.throws(
    () => evaluateKnowledgeIntegrityV1({ observations: [unsupported] }),
    /FINDING_TYPE_INVALID/
  );
});
