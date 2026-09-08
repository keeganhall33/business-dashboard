import fs from "node:fs";

import { parseIngestionManifest, type IngestionManifest } from "@/lib/data-plane/ingestion/manifest-contract";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";

export const INGESTION_MANIFEST_PATH = "config/data-plane/ingestion_manifest.v1.json";

export class IngestionManifestError extends Error {
  override readonly name = "IngestionManifestError";
}

function parseJsonFile(path: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch {
    throw new IngestionManifestError(`ingestion manifest not found: ${path}`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new IngestionManifestError(`ingestion manifest JSON parse failed: ${path}`);
  }
}

export function validateRegistryCoverage(manifest: IngestionManifest): void {
  const registry = loadProductionSourceRegistryV1().file;
  const sourceSets = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((source) => source.source_id) }).file;
  const byRegistryId = new Map(
    manifest.sources.filter((source) => source.registry_source_id).map((source) => [source.registry_source_id, source])
  );

  for (const registeredSource of registry.sources) {
    const source = byRegistryId.get(registeredSource.source_id);
    if (!source) throw new IngestionManifestError(`missing governed registry source: ${registeredSource.source_id}`);
    if (source?.registry_source_id !== source.source_id) {
      throw new IngestionManifestError(`external source_id must preserve canonical registry identity: ${registeredSource.source_id}`);
    }

    const expectedSets = [...registeredSource.source_sets].sort();
    const actualSets = [...(source?.registry_source_set_ids ?? [])].sort();
    if (JSON.stringify(expectedSets) !== JSON.stringify(actualSets)) {
      throw new IngestionManifestError(`registry source-set mismatch: ${registeredSource.source_id}`);
    }

    if (registeredSource.enabled === false && source?.connection_state === "CONNECTED_AND_INGESTING") {
      throw new IngestionManifestError(`disabled registry source cannot claim active ingestion: ${registeredSource.source_id}`);
    }
  }

  const referencedSets = new Set(manifest.sources.flatMap((source) => source.registry_source_set_ids));
  for (const sourceSet of sourceSets.source_sets) {
    if (!referencedSets.has(sourceSet.source_set_id)) {
      throw new IngestionManifestError(`missing governed source set: ${sourceSet.source_set_id}`);
    }
  }
}

export function loadIngestionManifest(path = INGESTION_MANIFEST_PATH): IngestionManifest {
  const parsed = parseIngestionManifest(parseJsonFile(path));
  validateRegistryCoverage(parsed);
  return Object.freeze(parsed);
}

export function evaluateSourceDecisionEligibility(input: {
  source: IngestionManifest["sources"][number];
  quality_state: string;
  source_as_of: string | null;
  now: string;
  required_fields_complete: boolean;
  reconciled: boolean;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sourceAsOf = input.source_as_of ? Date.parse(input.source_as_of) : Number.NaN;
  const now = Date.parse(input.now);

  if (!input.source.downstream.decision_eligible_states.includes(input.quality_state as never)) reasons.push("QUALITY_STATE_BLOCKED");
  if (!Number.isFinite(sourceAsOf) || !Number.isFinite(now)) reasons.push("SOURCE_AS_OF_UNKNOWN");
  if (Number.isFinite(sourceAsOf) && Number.isFinite(now) && now - sourceAsOf > input.source.maximum_decision_staleness_seconds * 1000) {
    reasons.push("SOURCE_TOO_STALE");
  }
  if (!input.required_fields_complete) reasons.push("REQUIRED_FIELDS_INCOMPLETE");
  if (!input.reconciled) reasons.push("RECONCILIATION_INCOMPLETE");
  if (!["INTERNAL_AUTHORIZED", "APPROVED", "APPROVED_WITH_RESTRICTIONS"].includes(input.source.legal_access.status)) {
    reasons.push("ACCESS_NOT_APPROVED");
  }

  return { eligible: reasons.length === 0, reasons };
}
