import fs from "node:fs";

import { SourceSetsFileSchema, assertUniqueIds } from "@/lib/external-intelligence/config/contracts";
import { SOURCE_SETS_V1_PATH } from "@/lib/external-intelligence/config/paths";
import { createSourceSetsContentHash } from "@/lib/external-intelligence/config/hashing";
import { deepFreeze } from "@/lib/external-intelligence/config/freeze";

export type LoadedSourceSets = {
  sets: ReturnType<typeof SourceSetsFileSchema.parse>;
  source_sets_content_hash: string;
};

export function loadSourceSetsV1(input: { knownSourceIds: string[] }): LoadedSourceSets {
  const raw = fs.readFileSync(SOURCE_SETS_V1_PATH, "utf8");
  const json = JSON.parse(raw) as unknown;
  const sets = SourceSetsFileSchema.parse(json);

  assertUniqueIds({ kind: "source_set_id", ids: sets.source_sets.map((s) => s.source_set_id) });

  const known = new Set(input.knownSourceIds);

  for (const ss of sets.source_sets) {
    // Cap must not be violated by declared membership.
    if (ss.member_source_ids.length > ss.maximum_active_members) {
      throw new Error(`source_set exceeds maximum_active_members: ${ss.source_set_id}`);
    }

    // All referenced source ids must exist.
    for (const sid of ss.member_source_ids) {
      if (!known.has(sid)) throw new Error(`unknown source_id in member_source_ids: ${sid} (set=${ss.source_set_id})`);
    }
  }

  // Membership entries must reference known sources and known sets.
  const setIds = new Set(sets.source_sets.map((s) => s.source_set_id));
  const membershipKey = (m: { source_set_id: string; source_id: string }) => `${m.source_set_id}::${m.source_id}`;
  const seen = new Set<string>();

  for (const m of sets.memberships) {
    if (!setIds.has(m.source_set_id)) throw new Error(`unknown source_set_id in memberships: ${m.source_set_id}`);
    if (!known.has(m.source_id)) throw new Error(`unknown source_id in memberships: ${m.source_id}`);

    const key = membershipKey(m);
    if (seen.has(key)) throw new Error(`duplicate membership: ${key}`);
    seen.add(key);
  }

  // Deterministic ordering.
  sets.source_sets.sort((a, b) => a.source_set_id.localeCompare(b.source_set_id));
  sets.memberships.sort((a, b) => membershipKey(a).localeCompare(membershipKey(b)));

  const source_sets_content_hash = createSourceSetsContentHash(sets);

  return deepFreeze({ sets, source_sets_content_hash });
}
