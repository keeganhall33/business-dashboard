import "server-only";

import type { ExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/interfaces";
import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { ExternalSignalRepository } from "@/lib/external-intelligence/persistence/supabase/external-signal.repository";
import { ProvenanceRepository } from "@/lib/external-intelligence/persistence/supabase/provenance.repository";
import { LifecycleRepository } from "@/lib/external-intelligence/persistence/supabase/lifecycle.repository";
import { CorrectionRepository } from "@/lib/external-intelligence/persistence/supabase/correction.repository";
import { SourceContributionRepository } from "@/lib/external-intelligence/persistence/supabase/source-contribution.repository";
import { ProcessingRunRepository } from "@/lib/external-intelligence/persistence/supabase/processing-run.repository";

/**
 * Phase A6: dormant Supabase-backed store.
 *
 * IMPORTANT: Writes that span stable+version rows require a DB transaction.
 * Supabase PostgREST client cannot run multi-statement transactions.
 *
 * Therefore, Phase A6 write-paths remain blocked pending an explicit RPC function
 * (requires a new migration). Reads/redaction/provenance/run bookkeeping are implemented.
 */
export function createExternalIntelligenceSupabaseStore(): ExternalIntelligenceStore {
  const evidenceRepo = new EvidenceReferenceRepository();
  const claimRepo = new ClaimRepository();
  const signalRepo = new ExternalSignalRepository();
  const provenanceRepo = new ProvenanceRepository();
  const lifecycleRepo = new LifecycleRepository();
  const correctionRepo = new CorrectionRepository();
  const contributionRepo = new SourceContributionRepository();
  const runRepo = new ProcessingRunRepository();

  return {
    evidence: {
      upsertStable: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      upsertVersion: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      fetchVersion: async (ref) => evidenceRepo.getVersion(ref),
      listVersions: async (id) => evidenceRepo.listVersions(id)
    },
    claims: {
      upsertStable: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      upsertVersion: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      fetchVersion: async (ref) => claimRepo.getVersion(ref),
      listVersions: async (id) => claimRepo.listVersions(id)
    },
    signals: {
      upsertStable: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      upsertVersion: async () => {
        throw new Error("TransactionSupportBlocked: stable+version writes require RPC.");
      },
      fetchVersion: async (ref) => signalRepo.getVersion(ref),
      listVersions: async (id) => signalRepo.listVersions(id)
    },
    provenance: {
      upsertEdge: async (row) => provenanceRepo.upsertEdge(row),
      listEdgesFrom: async (from_ref) => provenanceRepo.listEdgesFrom(from_ref),
      listEdgesTo: async (to_ref) => provenanceRepo.listEdgesTo(to_ref)
    },
    lifecycle: {
      recordTransition: async (row) => lifecycleRepo.recordTransition(row),
      listTransitions: async (object_ref) => lifecycleRepo.listTransitions(object_ref)
    },
    corrections: {
      recordCorrection: async (row) => correctionRepo.recordCorrection(row),
      listCorrections: async (object_ref) => correctionRepo.listCorrections(object_ref)
    },
    source_contributions: {
      recordContribution: async (row) => contributionRepo.recordContribution(row),
      listContributions: async (target_ref) => contributionRepo.listContributions(target_ref)
    },
    runs: {
      upsertRun: async (row) => runRepo.upsertRun(row),
      fetchRun: async (run_id) => runRepo.fetch(run_id)
    },
    verifyWriteSetComplete: async () => {
      // Application-level completeness verification requires loading each ref.
      // Implemented in a later phase once the full write-path is available.
      throw new Error("NotImplemented: verifyWriteSetComplete in Supabase store is pending A6 completion.");
    }
  };
}
