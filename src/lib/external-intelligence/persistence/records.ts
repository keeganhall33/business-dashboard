import type { PolicyRef } from "@/lib/external-intelligence/contracts/policy-ref";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { ExternalSignal } from "@/lib/external-intelligence/contracts/external-signal";

/**
 * Phase A4: storage-record contracts (no DB implementation).
 *
 * Rule: immutable versions are stored as one row per (object_id, content_hash).
 * Stable tables are optional, but recommended for quick "current" resolution.
 */

/**
 * Stable-object row: mutable object-level state + pointer to current immutable version.
 *
 * Rule: stable rows MAY be updated; immutable rows MUST never be overwritten.
 */
export type StableObjectRecord = {
  /** stable identity; equals the domain-specific id (evidence_reference_id / claim_id / signal_id) */
  object_id: string;

  /** pointer to the latest immutable version row */
  current_content_hash: string;

  /** mutable lifecycle state/disposition (query-critical; must not be stored only in JSONB) */
  lifecycle_status: string | null;

  /** correction/retraction summary for fast current lookups */
  correction_status: "none" | "corrected" | "retracted" | "superseded";

  created_at: string; // ISO
  updated_at: string; // ISO
};

/**
 * Immutable version row: one row per (object_id, content_hash).
 *
 * A payload MAY later be legally redacted. When redacted, payload_json becomes null and
 * payload_available becomes false while preserving audit/provenance topology.
 */
export type ImmutableVersionRecord<TPayload> = {
  object_id: string;
  content_hash: string;
  schema_version: string;

  // Policy pinning
  policy_refs: PolicyRef[];

  created_at: string; // ISO
  effective_at: string | null; // ISO; nullable when unknown
  valid_from: string | null;
  valid_until: string | null;

  // Supersession
  supersedes_content_hashes: string[];
  superseded_by_content_hash: string | null;

  // Canonical payload bytes (JSON-serializable)
  payload_available: boolean;
  payload_json: TPayload | null;

  // Legal retention + redaction
  retention_policy: "retain" | "link_only" | "tombstone";
  retention_expires_at: string | null;
  legal_hold: boolean;
  access_revoked_at: string | null;
  content_redacted_at: string | null;
  redaction_reason: string | null;
};

export type EvidenceReferenceRecord = StableObjectRecord & {
  evidence_reference_id: string;
  source_id: string; // normalized for queryability
  source_config_version: string;

  /** pinned on stable row for audit/discovery, but also present on version rows */
  legal_policy_version: string;
};

export type EvidenceReferenceVersionRecord = ImmutableVersionRecord<EvidenceReference> & {
  evidence_reference_id: string;

  // Source pinning (immutable)
  source_id: string;
  source_config_version: string;

  // Policy pinning (immutable)
  legal_policy_version: string;
};

export type ClaimRecord = StableObjectRecord & {
  claim_id: string;
  interpretation_policy_version: string;
};

export type ClaimVersionRecord = ImmutableVersionRecord<Claim> & {
  claim_id: string;
  evidence_reference_version_ref: VersionRef;
  claim_fingerprint: string;

  // Policy pinning (immutable)
  interpretation_policy_version: string;
};

export type ExternalSignalRecord = StableObjectRecord & {
  signal_id: string;
  disposition: string | null;
  confidence_summary: { confidence_label: string; confidence_value: number } | null;
};

export type ExternalSignalVersionRecord = ImmutableVersionRecord<ExternalSignal> & {
  signal_id: string;
  signal_fingerprint: string;

  // Required pinned inputs
  claim_version_refs: VersionRef[];
  evidence_reference_version_refs: VersionRef[];

  // Policy versions that must be preserved for reconstruction
  interpretation_policy_version: string;
  confidence_policy_version: string;
  disposition_policy_version: string;
  entity_resolution_version: string;
  source_registry_version: string;
  legal_policy_version: string;
};

export type LinkRecord = {
  from_ref: VersionRef;
  to_ref: VersionRef;
  relation: string;
  policy_version: string; // the edge/graph policy version
  created_at: string;
};

export type ProvenanceEdgeRecord = LinkRecord;

export type LifecycleTransitionRecord = {
  object_ref: VersionRef;
  from_status: string;
  to_status: string;
  reason_codes: string[];
  policy_version: string;
  effective_at: string;
  created_at: string;
};

export type CorrectionRecord = {
  object_ref: VersionRef;
  correction_type: "correction" | "retraction" | "supersession";
  supersedes_ref: VersionRef | null;
  superseded_by_ref: VersionRef | null;
  reason: string;
  policy_version: string;
  created_at: string;
};

export type SourceContributionRecord = {
  target_ref: VersionRef;
  source_id: string;
  source_set_id: string | null;
  evidence_reference_version_ref: VersionRef;
  created_at: string;
};

export type ProcessingRunStatus =
  | "started"
  | "persisting"
  | "completed"
  | "no_output"
  | "blocked"
  | "failed"
  | "persistence_incomplete";

export type ProcessingRunRecord = {
  run_id: string;

  // idempotency identity
  input_set_fingerprint: string;
  source_registry_hash: string;
  source_sets_hash: string;
  policy_bundle_hash: string;
  policy_refs: PolicyRef[];
  engine_version: string;

  started_at: string;
  completed_at: string | null;
  status: ProcessingRunStatus;
  reason_codes: string[];

  /** write-set linkage for completeness verification */
  input_refs: VersionRef[];
  expected_output_count: number;
  output_refs: VersionRef[];
  persisted_output_count: number;

  /** required edges that must exist for the run's output set */
  required_provenance_edges: Array<Pick<ProvenanceEdgeRecord, "from_ref" | "to_ref" | "relation" | "policy_version">>;

  persistence_complete: boolean;
  validation_complete: boolean;
  validation_result: "ok" | "failed";
  persistence_completeness: "complete" | "incomplete";
  error_summary: string | null;
  retry_of_run_id: string | null;
};

/**
 * Phase A4 migration design (proposal only; do not write migrations in A4).
 */
export const PROPOSED_PHASE_A5_MIGRATIONS = {
  forward: "supabase/migrations/YYYYMMDD_external_intelligence_phase_a5.sql",
  rollback: "supabase/migrations/YYYYMMDD_external_intelligence_phase_a5.rollback.sql"
} as const;

export const PROPOSED_EXTERNAL_INTELLIGENCE_TABLES = [
  "external_evidence_references_v1",
  "external_evidence_reference_versions_v1",
  "external_claims_v1",
  "external_claim_versions_v1",
  "external_signals_v1",
  "external_signal_versions_v1",
  "external_provenance_edges_v1",
  "external_lifecycle_transitions_v1",
  "external_corrections_v1",
  "external_source_contributions_v1",
  "external_processing_runs_v1"
] as const;

/**
 * Phase A4 requirement: complete migration specification (typed; no SQL files).
 *
 * This is intentionally implementation-ready: exact columns, constraints, indexes,
 * creation/rollback ordering, and safety rules.
 */

export type SqlPrimitiveType =
  | "uuid"
  | "text"
  | "boolean"
  | "timestamptz"
  | "bigint"
  | "integer"
  | "jsonb";

export type SqlColumnSpec = {
  name: string;
  type: SqlPrimitiveType;
  nullable: boolean;
  /** SQL literal default (e.g. "now()" or "false"), or null when no default */
  default: string | null;
  /** human note about mutability (not enforced by DB) */
  mutability: "immutable" | "mutable";
  purpose: string;
};

export type SqlForeignKeySpec = {
  name: string;
  columns: string[];
  references: { table: string; columns: string[] };
  onDelete: "restrict" | "cascade" | "set null";
  deferrable: boolean;
  purpose: string;
};

export type SqlUniqueSpec = {
  name: string;
  columns: string[];
  where: string | null;
  purpose: string;
};

export type SqlCheckSpec = {
  name: string;
  expression: string;
  purpose: string;
};

export type SqlIndexSpec = {
  name: string;
  columns: string[];
  unique: boolean;
  using: "btree" | "gin";
  where: string | null;
  purpose: string;
};

export type SqlTableSpec = {
  name: (typeof PROPOSED_EXTERNAL_INTELLIGENCE_TABLES)[number];
  purpose: string;
  growth: "low-volume" | "medium-volume" | "high-volume";
  columns: SqlColumnSpec[];
  primaryKey: { name: string; columns: string[] };
  uniques: SqlUniqueSpec[];
  foreignKeys: SqlForeignKeySpec[];
  checks: SqlCheckSpec[];
  indexes: SqlIndexSpec[];
  jsonbColumns: Array<{ name: string; indexedPaths: string[]; purpose: string }>;
  retentionRedactionNotes: string[];
};

export type MigrationSafetySpec = {
  forwardMigrationFilename: string;
  rollbackMigrationFilename: string;
  createOrder: (typeof PROPOSED_EXTERNAL_INTELLIGENCE_TABLES)[number][];
  rollbackOrder: (typeof PROPOSED_EXTERNAL_INTELLIGENCE_TABLES)[number][];
  reservedWordAudit: { riskyIdentifiers: string[]; safeNameNotes: string[] };
  namingCollisionAudit: { namespace: string; notes: string[] };
  idempotentCreateStrategy: string[];
  partialApplicationDetection: string[];
  rerunSafety: string[];
  noDestructiveChanges: string[];
  dormantUntilMigrationExists: string[];
  migrationBeforeDeploy: string[];
  schemaSqlMirrorRequirements: string[];
  rollbackLimitations: string[];
};

export type ExternalIntelligenceMigrationSpecV1 = {
  schemaVersion: "external-intelligence-persistence/v1";
  safety: MigrationSafetySpec;
  tables: SqlTableSpec[];
};

const COMMON_REDaction_COLUMNS: SqlColumnSpec[] = [
  {
    name: "retention_policy",
    type: "text",
    nullable: false,
    default: "'retain'",
    mutability: "mutable",
    purpose: "Retention class: retain | link_only | tombstone. May change due to policy/legal action."
  },
  {
    name: "retention_expires_at",
    type: "timestamptz",
    nullable: true,
    default: null,
    mutability: "mutable",
    purpose: "When retention allows redaction/tombstoning."
  },
  {
    name: "legal_hold",
    type: "boolean",
    nullable: false,
    default: "false",
    mutability: "mutable",
    purpose: "If true, retention-based redaction is blocked."
  },
  {
    name: "access_revoked_at",
    type: "timestamptz",
    nullable: true,
    default: null,
    mutability: "mutable",
    purpose: "Time when access was revoked by source/legal."
  },
  {
    name: "content_redacted_at",
    type: "timestamptz",
    nullable: true,
    default: null,
    mutability: "mutable",
    purpose: "Time when canonical payload was removed/redacted."
  },
  {
    name: "redaction_reason",
    type: "text",
    nullable: true,
    default: null,
    mutability: "mutable",
    purpose: "Human/audit reason for redaction."
  },
  {
    name: "payload_available",
    type: "boolean",
    nullable: false,
    default: "true",
    mutability: "mutable",
    purpose: "When false, payload_json is null and reconstruction returns a tombstone."
  }
];

export const EXTERNAL_INTELLIGENCE_MIGRATION_SPEC_V1: ExternalIntelligenceMigrationSpecV1 = {
  schemaVersion: "external-intelligence-persistence/v1",
  safety: {
    forwardMigrationFilename: PROPOSED_PHASE_A5_MIGRATIONS.forward,
    rollbackMigrationFilename: PROPOSED_PHASE_A5_MIGRATIONS.rollback,
    createOrder: [
      "external_evidence_references_v1",
      "external_evidence_reference_versions_v1",
      "external_claims_v1",
      "external_claim_versions_v1",
      "external_signals_v1",
      "external_signal_versions_v1",
      "external_provenance_edges_v1",
      "external_lifecycle_transitions_v1",
      "external_corrections_v1",
      "external_source_contributions_v1",
      "external_processing_runs_v1"
    ],
    rollbackOrder: [
      "external_processing_runs_v1",
      "external_source_contributions_v1",
      "external_corrections_v1",
      "external_lifecycle_transitions_v1",
      "external_provenance_edges_v1",
      "external_signal_versions_v1",
      "external_signals_v1",
      "external_claim_versions_v1",
      "external_claims_v1",
      "external_evidence_reference_versions_v1",
      "external_evidence_references_v1"
    ],
    reservedWordAudit: {
      riskyIdentifiers: ["window", "references", "user", "order", "status"],
      safeNameNotes: [
        "Use valid_from/valid_until instead of window.",
        "Use evidence_reference_* not references.",
        "Use lifecycle_status/disposition not status.",
        "Avoid column named order; use sequence_index if needed."
      ]
    },
    namingCollisionAudit: {
      namespace: "public",
      notes: [
        "All tables are prefixed external_ to avoid collisions with intelligence_v1 tables.",
        "All constraints/indexes use external_*_v1__* names to stay unique across schema.sql."
      ]
    },
    idempotentCreateStrategy: [
      "Use CREATE TABLE IF NOT EXISTS for forward migration.",
      "Use CREATE INDEX IF NOT EXISTS for indexes.",
      "Use ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS where supported; otherwise guard by checking pg_constraint."
    ],
    partialApplicationDetection: [
      "Migration should validate that all required tables exist with expected columns before marking complete.",
      "On Supabase, enforce a schema.sql mirror update for deterministic review of the resulting schema."
    ],
    rerunSafety: [
      "Forward migration must be re-runnable: all CREATE statements are IF NOT EXISTS.",
      "Rollback migration is best-effort and should refuse to run if foreign-key dependencies remain."
    ],
    noDestructiveChanges: [
      "Phase A5 migration must not ALTER or DROP existing intelligence-v1 or Fusion tables.",
      "All work is additive in new external_* tables."
    ],
    dormantUntilMigrationExists: [
      "No production code may import or write to these tables before the migration exists.",
      "All Phase A4 code remains contract + in-memory reference store only."
    ],
    migrationBeforeDeploy: [
      "Deploy ordering: migration must be applied before enabling any production writes.",
      "Rollback of app code must precede rollback of schema when data exists."
    ],
    schemaSqlMirrorRequirements: [
      "schema.sql must mirror the exact table/constraint/index set after migration authoring.",
      "Any change to the spec requires updating schema.sql in the same PR as SQL."
    ],
    rollbackLimitations: [
      "After production data exists, DROP TABLE rollback is unsafe and may be disallowed.",
      "Rollback should be limited to disabling writers and leaving schema in place if data is present."
    ]
  },
  tables: [
    {
      name: "external_evidence_references_v1",
      purpose:
        "Stable EvidenceReference row: mutable lifecycle + pointer to current immutable version. No payload stored here.",
      growth: "medium-volume",
      columns: [
        {
          name: "evidence_reference_id",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Stable external evidence reference id (string; not UUID)."
        },
        {
          name: "current_content_hash",
          type: "text",
          nullable: false,
          default: null,
          mutability: "mutable",
          purpose: "Pointer to current version row's content_hash."
        },
        {
          name: "lifecycle_status",
          type: "text",
          nullable: true,
          default: null,
          mutability: "mutable",
          purpose: "Lifecycle state (query-critical)."
        },
        {
          name: "correction_status",
          type: "text",
          nullable: false,
          default: "'none'",
          mutability: "mutable",
          purpose: "Summary: none | corrected | retracted | superseded."
        },
        {
          name: "source_id",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Normalized for fast queries by source."
        },
        {
          name: "source_config_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned source config version for audit."
        },
        {
          name: "legal_policy_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Legal/access policy version in effect at creation."
        },
        {
          name: "created_at",
          type: "timestamptz",
          nullable: false,
          default: "now()",
          mutability: "immutable",
          purpose: "Row creation time."
        },
        {
          name: "updated_at",
          type: "timestamptz",
          nullable: false,
          default: "now()",
          mutability: "mutable",
          purpose: "Row last update time."
        }
      ],
      primaryKey: { name: "external_evidence_references_v1__pk", columns: ["evidence_reference_id"] },
      uniques: [],
      foreignKeys: [
        {
          name: "external_evidence_references_v1__current_version_fk",
          columns: ["evidence_reference_id", "current_content_hash"],
          references: {
            table: "external_evidence_reference_versions_v1",
            columns: ["evidence_reference_id", "content_hash"]
          },
          onDelete: "restrict",
          deferrable: true,
          purpose: "Stable row must point to an existing version row."
        }
      ],
      checks: [
        {
          name: "external_evidence_references_v1__correction_status_check",
          expression: "correction_status in ('none','corrected','retracted','superseded')",
          purpose: "Prevent invalid correction summaries."
        }
      ],
      indexes: [
        {
          name: "external_evidence_references_v1__source_id_idx",
          columns: ["source_id"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Query current evidence by source."
        },
        {
          name: "external_evidence_references_v1__lifecycle_status_idx",
          columns: ["lifecycle_status"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Query by lifecycle status."
        }
      ],
      jsonbColumns: [],
      retentionRedactionNotes: [
        "Stable rows are never deleted for audit; retention affects only version payloads.",
        "current_content_hash may continue to point to a redacted version; reconstruction returns tombstone."
      ]
    },
    {
      name: "external_evidence_reference_versions_v1",
      purpose:
        "Immutable EvidenceReference versions (one per evidence_reference_id + content_hash). Payload may be redacted.",
      growth: "high-volume",
      columns: [
        {
          name: "evidence_reference_id",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Stable object id (FK)."
        },
        {
          name: "content_hash",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Immutable content hash; identifies canonical payload."
        },
        {
          name: "schema_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Contract schema version for EvidenceReference payload."
        },
        {
          name: "source_id",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned source id for audit."
        },
        {
          name: "source_config_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned source config version."
        },
        {
          name: "legal_policy_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned legal/access policy version."
        },
        {
          name: "policy_refs_json",
          type: "jsonb",
          nullable: false,
          default: "'[]'::jsonb",
          mutability: "immutable",
          purpose: "Pinned PolicyRefs for reconstruction."
        },
        {
          name: "effective_at",
          type: "timestamptz",
          nullable: true,
          default: null,
          mutability: "immutable",
          purpose: "When the evidence was effective (nullable if unknown)."
        },
        {
          name: "valid_from",
          type: "timestamptz",
          nullable: true,
          default: null,
          mutability: "immutable",
          purpose: "Start of validity window."
        },
        {
          name: "valid_until",
          type: "timestamptz",
          nullable: true,
          default: null,
          mutability: "immutable",
          purpose: "End of validity window."
        },
        {
          name: "supersedes_content_hashes",
          type: "jsonb",
          nullable: false,
          default: "'[]'::jsonb",
          mutability: "immutable",
          purpose: "List of prior content_hash values superseded by this version."
        },
        {
          name: "superseded_by_content_hash",
          type: "text",
          nullable: true,
          default: null,
          mutability: "mutable",
          purpose: "Forward pointer populated when a superseding version is written."
        },
        {
          name: "payload_json",
          type: "jsonb",
          nullable: true,
          default: null,
          mutability: "mutable",
          purpose: "Canonical payload; nullable when redacted."
        },
        ...COMMON_REDaction_COLUMNS,
        {
          name: "created_at",
          type: "timestamptz",
          nullable: false,
          default: "now()",
          mutability: "immutable",
          purpose: "Version row creation time."
        }
      ],
      primaryKey: {
        name: "external_evidence_reference_versions_v1__pk",
        columns: ["evidence_reference_id", "content_hash"]
      },
      uniques: [
        {
          name: "external_evidence_reference_versions_v1__id_hash_uniq",
          columns: ["evidence_reference_id", "content_hash"],
          where: null,
          purpose: "Immutable uniqueness key: one row per (id, hash)."
        }
      ],
      foreignKeys: [
        {
          name: "external_evidence_reference_versions_v1__evidence_fk",
          columns: ["evidence_reference_id"],
          references: { table: "external_evidence_references_v1", columns: ["evidence_reference_id"] },
          onDelete: "restrict",
          deferrable: false,
          purpose: "Version rows require a stable object row."
        }
      ],
      checks: [
        {
          name: "external_evidence_reference_versions_v1__payload_consistency_check",
          expression: "(payload_available = true and payload_json is not null) or (payload_available = false and payload_json is null)",
          purpose: "If payload is unavailable, payload_json must be null."
        }
      ],
      indexes: [
        {
          name: "external_evidence_reference_versions_v1__content_hash_idx",
          columns: ["content_hash"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Lookup by content hash."
        },
        {
          name: "external_evidence_reference_versions_v1__source_id_idx",
          columns: ["source_id"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Query versions by source id."
        },
        {
          name: "external_evidence_reference_versions_v1__created_at_idx",
          columns: ["created_at"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Version history ordering."
        }
      ],
      jsonbColumns: [
        { name: "payload_json", indexedPaths: [], purpose: "Canonical payload (unindexed by default)." },
        { name: "policy_refs_json", indexedPaths: [], purpose: "PolicyRefs bundle." },
        {
          name: "supersedes_content_hashes",
          indexedPaths: [],
          purpose: "Supersession references; not indexed by default."
        }
      ],
      retentionRedactionNotes: [
        "Redaction may null payload_json while retaining identity, hashes, source, timestamps, and topology.",
        "Reconstruction must return a typed tombstone when payload_available=false."
      ]
    },

    {
      name: "external_claims_v1",
      purpose: "Stable Claim row: mutable lifecycle/verification state + pointer to current version.",
      growth: "medium-volume",
      columns: [
        { name: "claim_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Stable claim id." },
        {
          name: "current_content_hash",
          type: "text",
          nullable: false,
          default: null,
          mutability: "mutable",
          purpose: "Pointer to current claim version."
        },
        { name: "lifecycle_status", type: "text", nullable: true, default: null, mutability: "mutable", purpose: "Lifecycle/verification state." },
        { name: "correction_status", type: "text", nullable: false, default: "'none'", mutability: "mutable", purpose: "none|corrected|retracted|superseded" },
        {
          name: "interpretation_policy_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned on stable row for audit; also present on versions."
        },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Creation time." },
        { name: "updated_at", type: "timestamptz", nullable: false, default: "now()", mutability: "mutable", purpose: "Update time." }
      ],
      primaryKey: { name: "external_claims_v1__pk", columns: ["claim_id"] },
      uniques: [],
      foreignKeys: [
        {
          name: "external_claims_v1__current_version_fk",
          columns: ["claim_id", "current_content_hash"],
          references: { table: "external_claim_versions_v1", columns: ["claim_id", "content_hash"] },
          onDelete: "restrict",
          deferrable: true,
          purpose: "Stable row must point to existing claim version."
        }
      ],
      checks: [
        { name: "external_claims_v1__correction_status_check", expression: "correction_status in ('none','corrected','retracted','superseded')", purpose: "Valid correction summaries." }
      ],
      indexes: [
        { name: "external_claims_v1__lifecycle_status_idx", columns: ["lifecycle_status"], unique: false, using: "btree", where: null, purpose: "Query by claim lifecycle." },
        { name: "external_claims_v1__updated_at_idx", columns: ["updated_at"], unique: false, using: "btree", where: null, purpose: "Recent updates." }
      ],
      jsonbColumns: [],
      retentionRedactionNotes: ["Stable claim rows are retained for audit even if versions are redacted."]
    },

    {
      name: "external_claim_versions_v1",
      purpose:
        "Immutable Claim versions (one per claim_id + content_hash). Pins exact EvidenceReference VersionRef(s).",
      growth: "high-volume",
      columns: [
        { name: "claim_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Stable claim id (FK)." },
        { name: "content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Canonical content hash." },
        { name: "schema_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Claim contract schema version." },
        { name: "claim_fingerprint", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic semantic fingerprint." },
        {
          name: "interpretation_policy_version",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Pinned interpretation policy for fingerprint semantics."
        },
        {
          name: "interpretation_policy_hash",
          type: "text",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Hash of the interpretation policy bundle used for normalization."
        },
        {
          name: "evidence_reference_version_ref_json",
          type: "jsonb",
          nullable: false,
          default: null,
          mutability: "immutable",
          purpose: "Exact pinned EvidenceReference VersionRef (object_type,id,hash,schema,policy)."
        },
        { name: "policy_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Pinned PolicyRefs." },
        { name: "effective_at", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Effective time." },
        { name: "valid_from", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Validity window start." },
        { name: "valid_until", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Validity window end." },
        { name: "supersedes_content_hashes", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Prior hashes superseded." },
        { name: "superseded_by_content_hash", type: "text", nullable: true, default: null, mutability: "mutable", purpose: "Forward pointer set when superseded." },
        { name: "payload_json", type: "jsonb", nullable: true, default: null, mutability: "mutable", purpose: "Canonical claim payload; nullable when redacted." },
        ...COMMON_REDaction_COLUMNS,
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Version creation time." }
      ],
      primaryKey: { name: "external_claim_versions_v1__pk", columns: ["claim_id", "content_hash"] },
      uniques: [
        { name: "external_claim_versions_v1__id_hash_uniq", columns: ["claim_id", "content_hash"], where: null, purpose: "Immutable uniqueness key." },
        {
          name: "external_claim_versions_v1__fingerprint_policy_uniq",
          columns: ["claim_fingerprint", "interpretation_policy_hash"],
          where: "payload_available = true",
          purpose:
            "Semantic uniqueness: same fingerprint under same interpretation policy hash is the same claim meaning."
        }
      ],
      foreignKeys: [
        {
          name: "external_claim_versions_v1__claim_fk",
          columns: ["claim_id"],
          references: { table: "external_claims_v1", columns: ["claim_id"] },
          onDelete: "restrict",
          deferrable: false,
          purpose: "Version rows require a stable claim row."
        }
      ],
      checks: [
        {
          name: "external_claim_versions_v1__payload_consistency_check",
          expression: "(payload_available = true and payload_json is not null) or (payload_available = false and payload_json is null)",
          purpose: "Payload availability consistency."
        }
      ],
      indexes: [
        { name: "external_claim_versions_v1__content_hash_idx", columns: ["content_hash"], unique: false, using: "btree", where: null, purpose: "Lookup by hash." },
        { name: "external_claim_versions_v1__fingerprint_idx", columns: ["claim_fingerprint"], unique: false, using: "btree", where: null, purpose: "Lookup by fingerprint." },
        { name: "external_claim_versions_v1__created_at_idx", columns: ["created_at"], unique: false, using: "btree", where: null, purpose: "History ordering." }
      ],
      jsonbColumns: [
        { name: "payload_json", indexedPaths: [], purpose: "Canonical claim payload (unindexed by default)." },
        { name: "evidence_reference_version_ref_json", indexedPaths: [], purpose: "Pinned VersionRef." },
        { name: "policy_refs_json", indexedPaths: [], purpose: "PolicyRefs bundle." }
      ],
      retentionRedactionNotes: [
        "Claim versions may be redacted while retaining fingerprint, hashes, and pinned evidence references for audit.",
        "Reconstruction returns tombstone when payload unavailable."
      ]
    },

    {
      name: "external_signals_v1",
      purpose: "Stable ExternalSignal row: mutable lifecycle, disposition, confidence summary + pointer to current version.",
      growth: "medium-volume",
      columns: [
        { name: "signal_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Stable signal id." },
        { name: "current_content_hash", type: "text", nullable: false, default: null, mutability: "mutable", purpose: "Pointer to current signal version." },
        { name: "lifecycle_status", type: "text", nullable: true, default: null, mutability: "mutable", purpose: "Lifecycle status." },
        { name: "correction_status", type: "text", nullable: false, default: "'none'", mutability: "mutable", purpose: "none|corrected|retracted|superseded" },
        { name: "disposition",
          type: "text",
          nullable: true,
          default: null,
          mutability: "mutable",
          purpose: "Current disposition label (query-critical)." },
        {
          name: "confidence_summary_json",
          type: "jsonb",
          nullable: true,
          default: null,
          mutability: "mutable",
          purpose: "Current confidence summary (label/value), not full structure."
        },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." },
        { name: "updated_at", type: "timestamptz", nullable: false, default: "now()", mutability: "mutable", purpose: "Updated." }
      ],
      primaryKey: { name: "external_signals_v1__pk", columns: ["signal_id"] },
      uniques: [],
      foreignKeys: [
        {
          name: "external_signals_v1__current_version_fk",
          columns: ["signal_id", "current_content_hash"],
          references: { table: "external_signal_versions_v1", columns: ["signal_id", "content_hash"] },
          onDelete: "restrict",
          deferrable: true,
          purpose: "Stable row points to existing version row."
        }
      ],
      checks: [
        { name: "external_signals_v1__correction_status_check", expression: "correction_status in ('none','corrected','retracted','superseded')", purpose: "Valid correction summaries." }
      ],
      indexes: [
        { name: "external_signals_v1__lifecycle_status_idx", columns: ["lifecycle_status"], unique: false, using: "btree", where: null, purpose: "Query by lifecycle." },
        { name: "external_signals_v1__disposition_idx", columns: ["disposition"], unique: false, using: "btree", where: null, purpose: "Query by disposition." }
      ],
      jsonbColumns: [
        { name: "confidence_summary_json", indexedPaths: [], purpose: "Small summary for UI/query; not indexed by default." }
      ],
      retentionRedactionNotes: ["Stable signal rows are retained for audit."]
    },

    {
      name: "external_signal_versions_v1",
      purpose:
        "Immutable ExternalSignal versions. Pins exact Claim + EvidenceReference VersionRefs and policy versions.",
      growth: "high-volume",
      columns: [
        { name: "signal_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Stable signal id (FK)." },
        { name: "content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Canonical content hash." },
        { name: "schema_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Signal schema version." },
        { name: "signal_fingerprint", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Semantic fingerprint." },
        { name: "interpretation_policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned policy version." },
        { name: "interpretation_policy_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned policy hash." },
        { name: "confidence_policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned policy version." },
        { name: "disposition_policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned policy version." },
        { name: "entity_resolution_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned entity-resolution version." },
        { name: "source_registry_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned source registry version." },
        { name: "legal_policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned legal policy version." },
        { name: "policy_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "PolicyRefs bundle." },
        { name: "claim_version_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Pinned claim VersionRefs (exact)." },
        { name: "evidence_reference_version_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Pinned evidence VersionRefs (exact)." },
        { name: "effective_at", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Effective time." },
        { name: "valid_from", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Relevance window start." },
        { name: "valid_until", type: "timestamptz", nullable: true, default: null, mutability: "immutable", purpose: "Relevance window end." },
        { name: "supersedes_content_hashes", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Supersession list." },
        { name: "superseded_by_content_hash", type: "text", nullable: true, default: null, mutability: "mutable", purpose: "Forward pointer when superseded." },
        { name: "payload_json", type: "jsonb", nullable: true, default: null, mutability: "mutable", purpose: "Canonical signal payload; nullable when redacted." },
        ...COMMON_REDaction_COLUMNS,
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." }
      ],
      primaryKey: { name: "external_signal_versions_v1__pk", columns: ["signal_id", "content_hash"] },
      uniques: [
        { name: "external_signal_versions_v1__id_hash_uniq", columns: ["signal_id", "content_hash"], where: null, purpose: "Immutable uniqueness key." },
        {
          name: "external_signal_versions_v1__fingerprint_policy_er_uniq",
          columns: ["signal_fingerprint", "interpretation_policy_hash", "entity_resolution_version"],
          where: "payload_available = true",
          purpose:
            "Semantic uniqueness: signal fingerprint under interpretation policy hash and entity resolution version."
        }
      ],
      foreignKeys: [
        {
          name: "external_signal_versions_v1__signal_fk",
          columns: ["signal_id"],
          references: { table: "external_signals_v1", columns: ["signal_id"] },
          onDelete: "restrict",
          deferrable: false,
          purpose: "Version rows require stable signal row."
        }
      ],
      checks: [
        {
          name: "external_signal_versions_v1__payload_consistency_check",
          expression: "(payload_available = true and payload_json is not null) or (payload_available = false and payload_json is null)",
          purpose: "Payload availability consistency."
        }
      ],
      indexes: [
        { name: "external_signal_versions_v1__content_hash_idx", columns: ["content_hash"], unique: false, using: "btree", where: null, purpose: "Lookup by hash." },
        { name: "external_signal_versions_v1__fingerprint_idx", columns: ["signal_fingerprint"], unique: false, using: "btree", where: null, purpose: "Lookup by fingerprint." },
        { name: "external_signal_versions_v1__created_at_idx", columns: ["created_at"], unique: false, using: "btree", where: null, purpose: "History ordering." }
      ],
      jsonbColumns: [
        { name: "payload_json", indexedPaths: [], purpose: "Canonical payload." },
        { name: "claim_version_refs_json", indexedPaths: [], purpose: "Pinned claim refs." },
        { name: "evidence_reference_version_refs_json", indexedPaths: [], purpose: "Pinned evidence refs." },
        { name: "policy_refs_json", indexedPaths: [], purpose: "Policy refs." }
      ],
      retentionRedactionNotes: [
        "Signals may be redacted while preserving identity, hashes, fingerprints, and pinned refs.",
        "Reconstruction returns tombstone when payload unavailable."
      ]
    },

    {
      name: "external_provenance_edges_v1",
      purpose: "Provenance edges pin exact from/to immutable versions. Polymorphic VersionRefs (not FK-enforced).",
      growth: "high-volume",
      columns: [
        { name: "edge_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic idempotency key (sha256)." },
        { name: "from_object_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned from object_type." },
        { name: "from_object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned from id." },
        { name: "from_content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned from hash." },
        { name: "to_object_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned to type." },
        { name: "to_object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned to id." },
        { name: "to_content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned to hash." },
        { name: "relation", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Relation type." },
        { name: "policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Edge policy version." },
        { name: "policy_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Hash of edge policy bundle." },
        { name: "from_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Full pinned VersionRef (for reconstruction)." },
        { name: "to_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Full pinned VersionRef." },
        { name: "metadata_json", type: "jsonb", nullable: false, default: "'{}'::jsonb", mutability: "immutable", purpose: "Edge metadata; unindexed." },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." }
      ],
      primaryKey: { name: "external_provenance_edges_v1__pk", columns: ["edge_id"] },
      uniques: [
        {
          name: "external_provenance_edges_v1__deterministic_uniq",
          columns: [
            "from_object_type",
            "from_object_id",
            "from_content_hash",
            "to_object_type",
            "to_object_id",
            "to_content_hash",
            "relation",
            "policy_hash"
          ],
          where: null,
          purpose: "Deterministic uniqueness over pinned endpoints + relation + policy."
        }
      ],
      foreignKeys: [],
      checks: [
        {
          name: "external_provenance_edges_v1__no_self_cycle_check",
          expression: "not (from_object_type = to_object_type and from_object_id = to_object_id and from_content_hash = to_content_hash and relation = 'supersedes')",
          purpose: "Prevent trivial self-supersession edges."
        }
      ],
      indexes: [
        {
          name: "external_provenance_edges_v1__from_idx",
          columns: ["from_object_type", "from_object_id", "from_content_hash"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Traverse edges from a version."
        },
        {
          name: "external_provenance_edges_v1__to_idx",
          columns: ["to_object_type", "to_object_id", "to_content_hash"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Traverse edges to a version."
        },
        {
          name: "external_provenance_edges_v1__relation_idx",
          columns: ["relation"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Query by relation type."
        }
      ],
      jsonbColumns: [
        { name: "from_ref_json", indexedPaths: [], purpose: "Pinned VersionRef." },
        { name: "to_ref_json", indexedPaths: [], purpose: "Pinned VersionRef." },
        { name: "metadata_json", indexedPaths: [], purpose: "Edge metadata." }
      ],
      retentionRedactionNotes: [
        "Edges are retained indefinitely for audit/topology even if payloads are redacted.",
        "Polymorphic refs are not FK-enforced; application-level completeness verification is required."
      ]
    },

    {
      name: "external_lifecycle_transitions_v1",
      purpose: "Lifecycle transitions pinned to a specific immutable VersionRef (polymorphic).",
      growth: "high-volume",
      columns: [
        { name: "transition_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic idempotency key (sha256)." },
        { name: "object_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned object_type." },
        { name: "object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned object_id." },
        { name: "content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned content_hash." },
        { name: "object_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Full VersionRef." },
        { name: "from_status", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "From state." },
        { name: "to_status", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "To state." },
        { name: "effective_at", type: "timestamptz", nullable: false, default: null, mutability: "immutable", purpose: "Effective time." },
        { name: "reason_codes", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Reason codes." },
        { name: "policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Transition policy version." },
        { name: "policy_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Transition policy hash." },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." }
      ],
      primaryKey: { name: "external_lifecycle_transitions_v1__pk", columns: ["transition_id"] },
      uniques: [
        {
          name: "external_lifecycle_transitions_v1__deterministic_uniq",
          columns: ["object_type", "object_id", "content_hash", "from_status", "to_status", "effective_at", "policy_hash"],
          where: null,
          purpose: "Deterministic identity over version ref + transition semantics + policy."
        }
      ],
      foreignKeys: [],
      checks: [],
      indexes: [
        {
          name: "external_lifecycle_transitions_v1__object_idx",
          columns: ["object_type", "object_id", "content_hash"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "List transitions for a version."
        },
        {
          name: "external_lifecycle_transitions_v1__effective_at_idx",
          columns: ["effective_at"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Time-based queries."
        }
      ],
      jsonbColumns: [
        { name: "object_ref_json", indexedPaths: [], purpose: "Pinned VersionRef." },
        { name: "reason_codes", indexedPaths: [], purpose: "Reason code list." }
      ],
      retentionRedactionNotes: ["Transitions are retained for audit; payload redaction does not remove transitions."]
    },

    {
      name: "external_corrections_v1",
      purpose:
        "Correction/retraction/supersession records pinned to a specific immutable VersionRef. Prevent cycles via application validation.",
      growth: "medium-volume",
      columns: [
        { name: "correction_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic idempotency key (sha256)." },
        { name: "object_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned object_type." },
        { name: "object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned object_id." },
        { name: "content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned content_hash." },
        { name: "object_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Pinned VersionRef." },
        { name: "correction_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "correction | retraction | supersession" },
        { name: "supersedes_ref_json", type: "jsonb", nullable: true, default: null, mutability: "immutable", purpose: "Pinned VersionRef superseded." },
        { name: "superseded_by_ref_json", type: "jsonb", nullable: true, default: null, mutability: "mutable", purpose: "Forward pointer when superseded." },
        { name: "reason", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Reason." },
        { name: "policy_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Correction policy version." },
        { name: "policy_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Correction policy hash." },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." }
      ],
      primaryKey: { name: "external_corrections_v1__pk", columns: ["correction_id"] },
      uniques: [
        {
          name: "external_corrections_v1__deterministic_uniq",
          columns: ["object_type", "object_id", "content_hash", "correction_type", "policy_hash"],
          where: null,
          purpose: "Deterministic identity; prevents duplicates."
        }
      ],
      foreignKeys: [],
      checks: [
        {
          name: "external_corrections_v1__correction_type_check",
          expression: "correction_type in ('correction','retraction','supersession')",
          purpose: "Valid correction types."
        }
      ],
      indexes: [
        { name: "external_corrections_v1__object_idx", columns: ["object_type", "object_id", "content_hash"], unique: false, using: "btree", where: null, purpose: "List corrections for a version." },
        { name: "external_corrections_v1__type_idx", columns: ["correction_type"], unique: false, using: "btree", where: null, purpose: "Query by correction type." }
      ],
      jsonbColumns: [
        { name: "object_ref_json", indexedPaths: [], purpose: "Pinned ref." },
        { name: "supersedes_ref_json", indexedPaths: [], purpose: "Supersedes ref." },
        { name: "superseded_by_ref_json", indexedPaths: [], purpose: "Superseded-by ref." }
      ],
      retentionRedactionNotes: [
        "Corrections remain even if payloads are redacted.",
        "Cycle prevention is application-level: reject if a new supersedes edge introduces a cycle."
      ]
    },

    {
      name: "external_source_contributions_v1",
      purpose: "Records which sources contributed which exact immutable versions.",
      growth: "high-volume",
      columns: [
        { name: "contribution_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic idempotency key (sha256)." },
        { name: "target_object_type", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned target type." },
        { name: "target_object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned target id." },
        { name: "target_content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned target hash." },
        { name: "target_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Pinned VersionRef." },
        { name: "source_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Source id." },
        { name: "source_set_id", type: "text", nullable: true, default: null, mutability: "immutable", purpose: "Optional source set id." },
        { name: "evidence_reference_object_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned evidence id." },
        { name: "evidence_reference_content_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Pinned evidence hash." },
        { name: "evidence_reference_version_ref_json", type: "jsonb", nullable: false, default: null, mutability: "immutable", purpose: "Pinned evidence VersionRef." },
        { name: "created_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Created." }
      ],
      primaryKey: { name: "external_source_contributions_v1__pk", columns: ["contribution_id"] },
      uniques: [
        {
          name: "external_source_contributions_v1__deterministic_uniq",
          columns: ["target_object_type", "target_object_id", "target_content_hash", "source_id", "evidence_reference_object_id", "evidence_reference_content_hash"],
          where: null,
          purpose: "Deterministic uniqueness for idempotent inserts."
        }
      ],
      foreignKeys: [],
      checks: [],
      indexes: [
        { name: "external_source_contributions_v1__target_idx", columns: ["target_object_type", "target_object_id", "target_content_hash"], unique: false, using: "btree", where: null, purpose: "List contributions for a version." },
        { name: "external_source_contributions_v1__source_id_idx", columns: ["source_id"], unique: false, using: "btree", where: null, purpose: "Query contributions by source." }
      ],
      jsonbColumns: [
        { name: "target_ref_json", indexedPaths: [], purpose: "Pinned target ref." },
        { name: "evidence_reference_version_ref_json", indexedPaths: [], purpose: "Pinned evidence ref." }
      ],
      retentionRedactionNotes: ["Contribution records remain for audit/topology even if payloads are redacted."]
    },

    {
      name: "external_processing_runs_v1",
      purpose:
        "Processing runs: idempotent run identity + completeness markers + input/output linkage. Completeness is fail-closed.",
      growth: "medium-volume",
      columns: [
        { name: "run_id", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Stable run id (uuid string or deterministic hash)." },
        { name: "retry_of_run_id", type: "text", nullable: true, default: null, mutability: "immutable", purpose: "Optional retry linkage." },
        { name: "input_set_fingerprint", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Deterministic fingerprint of input set." },
        { name: "source_registry_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Hash of source registry content." },
        { name: "source_sets_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Hash of source set selection." },
        { name: "policy_bundle_hash", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Hash of policy bundle." },
        { name: "engine_version", type: "text", nullable: false, default: null, mutability: "immutable", purpose: "Engine/app version." },
        { name: "policy_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Pinned PolicyRefs." },
        { name: "status", type: "text", nullable: false, default: "'started'", mutability: "mutable", purpose: "started|persisting|completed|no_output|blocked|failed|persistence_incomplete" },
        { name: "reason_codes", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "mutable", purpose: "Reason/blocker codes." },
        { name: "started_at", type: "timestamptz", nullable: false, default: "now()", mutability: "immutable", purpose: "Start time." },
        { name: "completed_at", type: "timestamptz", nullable: true, default: null, mutability: "mutable", purpose: "Completion time." },
        { name: "input_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Pinned run input VersionRefs." },
        { name: "output_refs_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "mutable", purpose: "Pinned output VersionRefs." },
        { name: "expected_output_count", type: "integer", nullable: false, default: "0", mutability: "immutable", purpose: "Expected outputs for completeness check." },
        { name: "persisted_output_count", type: "integer", nullable: false, default: "0", mutability: "mutable", purpose: "Count of outputs persisted." },
        { name: "required_provenance_edges_json", type: "jsonb", nullable: false, default: "'[]'::jsonb", mutability: "immutable", purpose: "Edge descriptors required for completion." },
        { name: "persistence_complete", type: "boolean", nullable: false, default: "false", mutability: "mutable", purpose: "All writes + required edges persisted." },
        { name: "validation_complete", type: "boolean", nullable: false, default: "false", mutability: "mutable", purpose: "All validations performed." },
        { name: "validation_result", type: "text", nullable: false, default: "'ok'", mutability: "mutable", purpose: "ok|failed" },
        { name: "error_summary", type: "text", nullable: true, default: null, mutability: "mutable", purpose: "Human summary of failure." }
      ],
      primaryKey: { name: "external_processing_runs_v1__pk", columns: ["run_id"] },
      uniques: [
        {
          name: "external_processing_runs_v1__idempotency_uniq",
          columns: ["input_set_fingerprint", "source_registry_hash", "policy_bundle_hash", "engine_version"],
          where: null,
          purpose: "Idempotent run uniqueness under same inputs/policy/engine."
        }
      ],
      foreignKeys: [
        {
          name: "external_processing_runs_v1__retry_fk",
          columns: ["retry_of_run_id"],
          references: { table: "external_processing_runs_v1", columns: ["run_id"] },
          onDelete: "restrict",
          deferrable: false,
          purpose: "Retry links to prior run."
        }
      ],
      checks: [
        {
          name: "external_processing_runs_v1__counts_check",
          expression: "persisted_output_count <= expected_output_count",
          purpose: "Persisted outputs cannot exceed expected."
        }
      ],
      indexes: [
        {
          name: "external_processing_runs_v1__status_idx",
          columns: ["status"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Query runs by status for operations."
        },
        {
          name: "external_processing_runs_v1__idempotency_lookup_idx",
          columns: ["input_set_fingerprint", "source_registry_hash", "policy_bundle_hash", "engine_version"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Lookup the logical run by idempotency identity."
        },
        {
          name: "external_processing_runs_v1__started_at_idx",
          columns: ["started_at"],
          unique: false,
          using: "btree",
          where: null,
          purpose: "Time ordering."
        }
      ],
      jsonbColumns: [
        { name: "policy_refs_json", indexedPaths: [], purpose: "Policy refs." },
        { name: "reason_codes", indexedPaths: [], purpose: "Reason codes." },
        { name: "input_refs_json", indexedPaths: [], purpose: "Input refs." },
        { name: "output_refs_json", indexedPaths: [], purpose: "Output refs." },
        { name: "required_provenance_edges_json", indexedPaths: [], purpose: "Required edge list." }
      ],
      retentionRedactionNotes: [
        "Run rows retained for audit; do not delete. Error summaries may be redacted separately if they contain protected content.",
        "A run cannot be marked completed unless persistence_complete=true and validation_complete=true."
      ]
    }
  ]
};
