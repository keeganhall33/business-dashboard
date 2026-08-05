import fs from "node:fs";

import {
  createProductionSourceRegistryHash,
  parseProductionSourceRegistryFile
} from "@/lib/external-intelligence/config/production-source-registry.contract";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import { SourceGovernanceConfigInvalidError, SourceGovernanceConfigNotFoundError } from "@/lib/external-intelligence/config/source-governance-errors";

const PRODUCTION_SOURCE_REGISTRY_PATH = "config/source-registry/v1/source_registry.production.json";

export type LoadedProductionSourceRegistry = {
  file: ReturnType<typeof parseProductionSourceRegistryFile>;
  registry_hash: string;
};

export function loadProductionSourceRegistryV1(): LoadedProductionSourceRegistry {
  let raw: string;
  try {
    raw = fs.readFileSync(PRODUCTION_SOURCE_REGISTRY_PATH, "utf8");
  } catch {
    throw new SourceGovernanceConfigNotFoundError(`production source registry not found: ${PRODUCTION_SOURCE_REGISTRY_PATH}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new SourceGovernanceConfigInvalidError("production source registry JSON parse failed");
  }

  const file = parseProductionSourceRegistryFile(json);

  // Fail-closed: uniqueness.
  const seen = new Set<string>();
  for (const s of file.sources) {
    if (seen.has(s.source_id)) throw new SourceGovernanceConfigInvalidError(`duplicate source_id: ${s.source_id}`);
    seen.add(s.source_id);
  }

  const registry_hash = createProductionSourceRegistryHash(file);

  return deepFreeze({ file, registry_hash });
}
