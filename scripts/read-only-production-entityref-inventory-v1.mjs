#!/usr/bin/env node
/*
Read-only production EntityRef inventory for Entity Resolution V1.

- Does not write to Supabase.
- Uses Supabase CLI linked session (no credentials printed).

Output: JSON to stdout.
*/

import { execFileSync } from "node:child_process";

const SUPABASE = "/opt/homebrew/bin/supabase";

function query(sql) {
  const out = execFileSync(SUPABASE, ["db", "query", "--linked", "--output", "json", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return JSON.parse(out);
}

function normalizeWhitespace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOrgCompareKey(name) {
  const collapsed = normalizeWhitespace(name).toLowerCase();
  const noPunct = collapsed.replace(/[^\p{L}\p{N}\s]+/gu, "");
  const parts = noPunct.split(" ").filter(Boolean);
  const legal = new Set(["inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "sa", "bv"]);
  while (parts.length && legal.has(parts[parts.length - 1].replace(/\.+$/g, ""))) parts.pop();
  return parts.join(" ");
}

const claims = query("select claim_id, content_hash, schema_version, payload_json, created_at from public.external_claim_versions_v1 order by created_at asc;");

const entities = new Map();

function addRef(ref, ctx) {
  if (!ref || typeof ref !== "object") return;
  const entity_id = String(ref.entity_id ?? "");
  if (!entity_id) return;

  const canonical_name = String(ref.canonical_name ?? "");
  const entity_type = String(ref.entity_type ?? "");

  const key = entity_id;
  const entry = entities.get(key) ?? {
    provisional_entity_id: entity_id,
    entity_type,
    canonical_name,
    occurrences: [],
    sources: new Set(),
    evidence_reference_ids: new Set()
  };

  entry.occurrences.push(ctx);

  for (const ap of Array.isArray(ref.alias_provenance) ? ref.alias_provenance : []) {
    if (ap?.source_id) entry.sources.add(String(ap.source_id));
    if (ap?.evidence_reference_id) entry.evidence_reference_ids.add(String(ap.evidence_reference_id));
  }

  entities.set(key, entry);
}

for (const row of claims) {
  const payload = row.payload_json;
  addRef(payload?.subject, { claim_id: row.claim_id, role: "subject", schema_version: row.schema_version });
  addRef(payload?.object?.entity, { claim_id: row.claim_id, role: "object.entity", schema_version: row.schema_version });
}

const inventory = Array.from(entities.values()).map((e) => {
  const name = e.canonical_name;
  const exact_key = normalizeWhitespace(name);
  const normalized_key = normalizeOrgCompareKey(name);
  return {
    provisional_entity_id: e.provisional_entity_id,
    entity_type: e.entity_type,
    canonical_name: name,
    exact_name_key: exact_key,
    normalized_name_key: normalized_key,
    occurrence_count: e.occurrences.length,
    occurrences: e.occurrences,
    sources: Array.from(e.sources).sort(),
    evidence_reference_ids: Array.from(e.evidence_reference_ids).sort()
  };
});

const groupsExact = new Map();
const groupsNorm = new Map();
for (const e of inventory) {
  const a = groupsExact.get(e.exact_name_key) ?? [];
  a.push(e.provisional_entity_id);
  groupsExact.set(e.exact_name_key, a);

  const b = groupsNorm.get(e.normalized_name_key) ?? [];
  b.push(e.provisional_entity_id);
  groupsNorm.set(e.normalized_name_key, b);
}

function toGroups(map) {
  return Array.from(map.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, provisional_entity_ids: ids.sort() }))
    .sort((x, y) => y.provisional_entity_ids.length - x.provisional_entity_ids.length);
}

const output = {
  generated_at: new Date().toISOString(),
  counts: {
    claims_versions: claims.length,
    unique_provisional_entities: inventory.length
  },
  entities: inventory.sort((a, b) => b.occurrence_count - a.occurrence_count),
  exact_name_match_groups: toGroups(groupsExact),
  normalized_name_match_groups: toGroups(groupsNorm)
};

process.stdout.write(JSON.stringify(output, null, 2));
