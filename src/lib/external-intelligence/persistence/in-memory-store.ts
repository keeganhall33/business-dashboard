import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import type {
  EvidenceReferenceRecord,
  EvidenceReferenceVersionRecord,
  ClaimRecord,
  ClaimVersionRecord,
  ExternalSignalRecord,
  ExternalSignalVersionRecord,
  ProvenanceEdgeRecord,
  LifecycleTransitionRecord,
  CorrectionRecord,
  SourceContributionRecord,
  ProcessingRunRecord
} from "@/lib/external-intelligence/persistence/records";
import type { ExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/interfaces";
import {
  PersistenceCompletenessError,
  PersistenceNotFoundError
} from "@/lib/external-intelligence/persistence/errors";
import { provenanceEdgeIdempotencyKey } from "@/lib/external-intelligence/persistence/idempotency";

function keyForVersion(ref: VersionRef) {
  return `${ref.object_type}::${ref.object_id}::${ref.content_hash}`;
}

export class InMemoryExternalIntelligenceStore implements ExternalIntelligenceStore {
  private evidenceStable = new Map<string, EvidenceReferenceRecord>();
  private evidenceVersions = new Map<string, EvidenceReferenceVersionRecord>();

  private claimStable = new Map<string, ClaimRecord>();
  private claimVersions = new Map<string, ClaimVersionRecord>();

  private signalStable = new Map<string, ExternalSignalRecord>();
  private signalVersions = new Map<string, ExternalSignalVersionRecord>();

  private edges = new Map<string, ProvenanceEdgeRecord>();
  private transitionsByVersionKey = new Map<string, LifecycleTransitionRecord[]>();
  private correctionsByVersionKey = new Map<string, CorrectionRecord[]>();
  private contributionsByVersionKey = new Map<string, SourceContributionRecord[]>();
  private runsById = new Map<string, ProcessingRunRecord>();

  evidence = {
    upsertStable: async (row: EvidenceReferenceRecord) => {
      if (row.object_id !== row.evidence_reference_id) {
        throw new Error("EvidenceReference stable row must use object_id === evidence_reference_id");
      }
      this.evidenceStable.set(row.evidence_reference_id, row);
    },
    upsertVersion: async (row: EvidenceReferenceVersionRecord) => {
      if (row.object_id !== row.evidence_reference_id) {
        throw new Error("EvidenceReference version row must use object_id === evidence_reference_id");
      }
      const k = `${row.evidence_reference_id}::${row.content_hash}`;
      const existing = this.evidenceVersions.get(k);
      if (existing && JSON.stringify(existing.payload_json) !== JSON.stringify(row.payload_json)) {
        throw new Error("same content_hash cannot map to different payload");
      }
      this.evidenceVersions.set(k, row);
    },
    fetchVersion: async (ref: VersionRef) => {
      const k = `${ref.object_id}::${ref.content_hash}`;
      const v = this.evidenceVersions.get(k);
      if (!v) throw new PersistenceNotFoundError(`EvidenceReference version not found: ${k}`);
      return v;
    },
    listVersions: async (evidence_reference_id: string) => {
      return [...this.evidenceVersions.values()].filter((v) => v.evidence_reference_id === evidence_reference_id);
    }
  };

  claims = {
    upsertStable: async (row: ClaimRecord) => {
      if (row.object_id !== row.claim_id) {
        throw new Error("Claim stable row must use object_id === claim_id");
      }
      this.claimStable.set(row.claim_id, row);
    },
    upsertVersion: async (row: ClaimVersionRecord) => {
      if (row.object_id !== row.claim_id) {
        throw new Error("Claim version row must use object_id === claim_id");
      }
      const k = `${row.claim_id}::${row.content_hash}`;
      const existing = this.claimVersions.get(k);
      if (existing && JSON.stringify(existing.payload_json) !== JSON.stringify(row.payload_json)) {
        throw new Error("same content_hash cannot map to different payload");
      }
      this.claimVersions.set(k, row);
    },
    fetchVersion: async (ref: VersionRef) => {
      const k = `${ref.object_id}::${ref.content_hash}`;
      const v = this.claimVersions.get(k);
      if (!v) throw new PersistenceNotFoundError(`Claim version not found: ${k}`);
      return v;
    },
    listVersions: async (claim_id: string) => {
      return [...this.claimVersions.values()].filter((v) => v.claim_id === claim_id);
    }
  };

  signals = {
    upsertStable: async (row: ExternalSignalRecord) => {
      if (row.object_id !== row.signal_id) {
        throw new Error("Signal stable row must use object_id === signal_id");
      }
      this.signalStable.set(row.signal_id, row);
    },
    upsertVersion: async (row: ExternalSignalVersionRecord) => {
      if (row.object_id !== row.signal_id) {
        throw new Error("Signal version row must use object_id === signal_id");
      }
      const k = `${row.signal_id}::${row.content_hash}`;
      const existing = this.signalVersions.get(k);
      if (existing && JSON.stringify(existing.payload_json) !== JSON.stringify(row.payload_json)) {
        throw new Error("same content_hash cannot map to different payload");
      }
      this.signalVersions.set(k, row);
    },
    fetchVersion: async (ref: VersionRef) => {
      const k = `${ref.object_id}::${ref.content_hash}`;
      const v = this.signalVersions.get(k);
      if (!v) throw new PersistenceNotFoundError(`Signal version not found: ${k}`);
      return v;
    },
    listVersions: async (signal_id: string) => {
      return [...this.signalVersions.values()].filter((v) => v.signal_id === signal_id);
    }
  };

  provenance = {
    upsertEdge: async (row: ProvenanceEdgeRecord) => {
      const k = provenanceEdgeIdempotencyKey({
        from_ref: row.from_ref,
        to_ref: row.to_ref,
        relation: row.relation,
        policy_version: row.policy_version
      });
      this.edges.set(k, row);
    },
    listEdgesFrom: async (from_ref: VersionRef) => {
      const k = `${from_ref.object_type}::${from_ref.object_id}::${from_ref.content_hash}`;
      return [...this.edges.values()].filter((e) => keyForVersion(e.from_ref) === k);
    },
    listEdgesTo: async (to_ref: VersionRef) => {
      const k = `${to_ref.object_type}::${to_ref.object_id}::${to_ref.content_hash}`;
      return [...this.edges.values()].filter((e) => keyForVersion(e.to_ref) === k);
    }
  };

  lifecycle = {
    recordTransition: async (row: LifecycleTransitionRecord) => {
      const k = keyForVersion(row.object_ref);
      const list = this.transitionsByVersionKey.get(k) ?? [];
      this.transitionsByVersionKey.set(k, [...list, row]);
    },
    listTransitions: async (object_ref: VersionRef) => {
      return this.transitionsByVersionKey.get(keyForVersion(object_ref)) ?? [];
    }
  };

  corrections = {
    recordCorrection: async (row: CorrectionRecord) => {
      const k = keyForVersion(row.object_ref);
      const list = this.correctionsByVersionKey.get(k) ?? [];
      this.correctionsByVersionKey.set(k, [...list, row]);
    },
    listCorrections: async (object_ref: VersionRef) => {
      return this.correctionsByVersionKey.get(keyForVersion(object_ref)) ?? [];
    }
  };

  source_contributions = {
    recordContribution: async (row: SourceContributionRecord) => {
      const k = keyForVersion(row.target_ref);
      const list = this.contributionsByVersionKey.get(k) ?? [];
      this.contributionsByVersionKey.set(k, [...list, row]);
    },
    listContributions: async (target_ref: VersionRef) => {
      return this.contributionsByVersionKey.get(keyForVersion(target_ref)) ?? [];
    }
  };

  runs = {
    upsertRun: async (row: ProcessingRunRecord) => {
      // Enforce completion invariants in-memory (fail closed).
      if (row.status === "completed") {
        if (!row.persistence_complete || !row.validation_complete) {
          throw new Error("cannot mark run completed unless persistence_complete and validation_complete");
        }
        if (row.persisted_output_count !== row.expected_output_count) {
          throw new Error("cannot mark run completed unless persisted_output_count === expected_output_count");
        }

        // All output VersionRefs must resolve.
        await this.verifyWriteSetComplete({ expected_version_refs: row.output_refs, required_edges: row.required_provenance_edges });
      }
      this.runsById.set(row.run_id, row);
    },
    fetchRun: async (run_id: string) => {
      const r = this.runsById.get(run_id);
      if (!r) throw new PersistenceNotFoundError(`Run not found: ${run_id}`);
      return r;
    }
  };

  verifyWriteSetComplete = async (input: {
    expected_version_refs: VersionRef[];
    required_edges?: Array<Pick<ProvenanceEdgeRecord, "from_ref" | "to_ref" | "relation" | "policy_version">>;
  }) => {
    for (const ref of input.expected_version_refs) {
      if (ref.object_type === "evidence_reference") await this.evidence.fetchVersion(ref);
      else if (ref.object_type === "claim") await this.claims.fetchVersion(ref);
      else if (ref.object_type === "signal") await this.signals.fetchVersion(ref);
      else throw new PersistenceCompletenessError(`unsupported object_type in completeness check: ${ref.object_type}`);
    }

    if (input.required_edges) {
      for (const edge of input.required_edges) {
        const k = provenanceEdgeIdempotencyKey({
          from_ref: edge.from_ref,
          to_ref: edge.to_ref,
          relation: edge.relation,
          policy_version: edge.policy_version
        });
        if (!this.edges.has(k)) {
          throw new PersistenceCompletenessError(`missing required provenance edge: ${k}`);
        }
      }
    }
  };
}
