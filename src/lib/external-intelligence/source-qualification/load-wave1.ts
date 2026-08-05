import fs from "node:fs";
import path from "node:path";

import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { loadProductionSourceSetsV1 } from "@/lib/external-intelligence/config/load-production-source-sets";
import { SourceGovernanceConfigInvalidError } from "@/lib/external-intelligence/config/source-governance-errors";
import {
  computeQualificationContentHash,
  parseWave1QualificationRecord,
  type Wave1QualificationRecord
} from "@/lib/external-intelligence/source-qualification/contracts";

const WAVE1_DIR = "config/source-qualification/v1/wave1";

const WAVE1_SOURCE_IDS = [
  "sports.major_leagues.official",
  "calendar.sports.milestones",
  "search.google_trends",
  "economics.fred",
  "licensing.uspto.trademarks",
  "ops.shipping.alerts",
  "sports_business.boardroom"
] as const;

export type LoadedWave1Qualifications = {
  records: Wave1QualificationRecord[];
  wave1_source_ids: readonly string[];
};

export function loadWave1QualificationRecordsV1(): LoadedWave1Qualifications {
  const { file: registry, registry_hash } = loadProductionSourceRegistryV1();
  const { source_sets_hash } = loadProductionSourceSetsV1({ knownSourceIds: registry.sources.map((s) => s.source_id) });

  const files = fs
    .readdirSync(WAVE1_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(WAVE1_DIR, f));

  const records: Wave1QualificationRecord[] = [];
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(f, "utf8")) as unknown;
    const parsed = parseWave1QualificationRecord(json);

    // Fail-closed: qualification must pin current registry and sets hashes.
    if (parsed.registry_hash !== registry_hash) {
      throw new SourceGovernanceConfigInvalidError(`qualification pins wrong registry_hash: ${parsed.source_id}`);
    }
    if (parsed.source_sets_hash !== source_sets_hash) {
      throw new SourceGovernanceConfigInvalidError(`qualification pins wrong source_sets_hash: ${parsed.source_id}`);
    }

    // Fail-closed: content hash must match semantic projection.
    const { qualification_content_hash, ...rest } = parsed;
    const expected = computeQualificationContentHash(rest);
    if (qualification_content_hash !== expected) {
      throw new SourceGovernanceConfigInvalidError(`qualification_content_hash mismatch: ${parsed.source_id}`);
    }

    records.push(parsed);
  }

  // Fail-closed: must have exactly one record per Wave 1 source.
  const byId = new Map(records.map((r) => [r.source_id, r] as const));
  for (const id of WAVE1_SOURCE_IDS) {
    if (!byId.has(id)) throw new SourceGovernanceConfigInvalidError(`missing wave1 qualification record: ${id}`);
  }

  if (records.length !== WAVE1_SOURCE_IDS.length) {
    throw new SourceGovernanceConfigInvalidError(`unexpected qualification records count: ${records.length}`);
  }

  return deepFreeze({
    records: records.slice().sort((a, b) => a.source_id.localeCompare(b.source_id)),
    wave1_source_ids: WAVE1_SOURCE_IDS
  });
}
