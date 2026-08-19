import {
  canonicalExternalFusionContextToCandidates,
  type CanonicalExternalFusionContextV1
} from "@/lib/fusion-v1/production/adapters/external-knowledge";
import { loadLatestEligibleExternalFusionContexts, type ExternalFusionContextLoadResult } from "@/lib/fusion-v1/production/external-fusion-context-loader";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

export type ExternalKnowledgeSynthesisCandidateLoadResult = {
  candidates: FusionCandidate[];
  candidate_meta_by_id: Record<string, { source: string; freshness: "fresh" | "monitor_only" }>;
  sources_inspected: string[];
  sources_empty: string[];
  sources_stale: string[];
  sources_skipped: Array<{ source: string; reason: string }>;
  freshness_notes: Array<Record<string, unknown>>;
};

export async function loadExternalKnowledgeSynthesisCandidates(input: {
  nowIso: string;
  external_fusion_contexts?: CanonicalExternalFusionContextV1[];
  external_fusion_context_loader?: (input: { nowIso: string }) => Promise<ExternalFusionContextLoadResult>;
}): Promise<ExternalKnowledgeSynthesisCandidateLoadResult> {
  const candidates: FusionCandidate[] = [];
  const candidate_meta_by_id: ExternalKnowledgeSynthesisCandidateLoadResult["candidate_meta_by_id"] = {};
  const sources_inspected = ["external_knowledge_synthesis"];
  const sources_empty: string[] = [];
  const sources_stale: string[] = [];
  const sources_skipped: ExternalKnowledgeSynthesisCandidateLoadResult["sources_skipped"] = [];
  const freshness_notes: ExternalKnowledgeSynthesisCandidateLoadResult["freshness_notes"] = [];

  const loadedExternalContexts = input.external_fusion_contexts
    ? {
        contexts: input.external_fusion_contexts,
        unavailable: false,
        source: "external_knowledge_synthesis",
        inspected_at: input.nowIso,
        skipped: []
      }
    : await (input.external_fusion_context_loader ?? loadLatestEligibleExternalFusionContexts)({ nowIso: input.nowIso });
  const externalContexts = loadedExternalContexts.contexts;
  if (!externalContexts.length) sources_empty.push("external_knowledge_synthesis");
  if (loadedExternalContexts.unavailable) sources_skipped.push({ source: "external_knowledge_synthesis", reason: "canonical_external_fusion_context_store_unavailable" });
  for (const skipped of loadedExternalContexts.skipped) {
    sources_skipped.push({ source: `external_knowledge_synthesis:${skipped.id}`, reason: skipped.reason });
  }
  for (const context of externalContexts) {
    const res = canonicalExternalFusionContextToCandidates({ nowIso: input.nowIso, context });
    freshness_notes.push({
      source: "external_knowledge_synthesis",
      fusion_context_id: context.fusion_context_id,
      freshness: context.freshness_summary,
      rejected: res.rejected
    });
    if (!res.candidates.length && res.rejected.length) {
      sources_skipped.push({
        source: `external_knowledge_synthesis:${context.fusion_context_id}`,
        reason: res.rejected.map((item) => item.reason).join(",")
      });
      if (context.freshness_summary.status === "stale") sources_stale.push(`external_knowledge_synthesis:${context.fusion_context_id}`);
    }
    for (const candidate of res.candidates) {
      candidates.push(candidate);
      candidate_meta_by_id[candidate.candidate_id] = {
        source: `external_knowledge_synthesis:${context.fusion_context_id}`,
        freshness: context.freshness_summary.status === "fresh" ? "fresh" : "monitor_only"
      };
    }
  }

  return { candidates, candidate_meta_by_id, sources_inspected, sources_empty, sources_stale, sources_skipped, freshness_notes };
}
