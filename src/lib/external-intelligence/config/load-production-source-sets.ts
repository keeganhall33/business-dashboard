import fs from "node:fs";

import {
  createProductionSourceSetsHash,
  parseProductionSourceSetsFile
} from "@/lib/external-intelligence/config/production-source-sets.contract";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { SourceGovernanceConfigInvalidError, SourceGovernanceConfigNotFoundError } from "@/lib/external-intelligence/config/source-governance-errors";

const PRODUCTION_SOURCE_SETS_PATH = "config/source-registry/v1/source_sets.production.json";

export type LoadedProductionSourceSets = {
  file: ReturnType<typeof parseProductionSourceSetsFile>;
  source_sets_hash: string;
};

export function loadProductionSourceSetsV1(input: { knownSourceIds: string[] }): LoadedProductionSourceSets {
  let raw: string;
  try {
    raw = fs.readFileSync(PRODUCTION_SOURCE_SETS_PATH, "utf8");
  } catch {
    throw new SourceGovernanceConfigNotFoundError(`production source sets not found: ${PRODUCTION_SOURCE_SETS_PATH}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new SourceGovernanceConfigInvalidError("production source sets JSON parse failed");
  }

  const file = parseProductionSourceSetsFile(json);

  const known = new Set(input.knownSourceIds);

  // Fail-closed: source sets must not reference unknown sources.
  for (const set of file.source_sets) {
    for (const m of set.members) {
      if (!known.has(m.source_id)) {
        throw new SourceGovernanceConfigInvalidError(`unknown source_id referenced by source set ${set.source_set_id}: ${m.source_id}`);
      }
    }

    // Fail-closed: cap.
    if (set.members.length > set.maximum_active_members) {
      throw new SourceGovernanceConfigInvalidError(`source set cap exceeded: ${set.source_set_id}`);
    }

    // Fail-closed: roles must be declared.
    const roles = new Set(set.member_roles);
    for (const m of set.members) {
      if (!roles.has(m.role)) throw new SourceGovernanceConfigInvalidError(`unknown member role: ${set.source_set_id}:${m.role}`);
    }
  }

  const source_sets_hash = createProductionSourceSetsHash(file);

  return deepFreeze({ file, source_sets_hash });
}
