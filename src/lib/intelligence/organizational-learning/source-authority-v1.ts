import type { LearningTruthState } from "./learning-object-v1";

export const SOURCE_AUTHORITY_RESOLVER_VERSION = "SOURCE_AUTHORITY_V1" as const;
export const MAX_AUTHORITY_RECORDS = 100;
export const DEFAULT_MAX_SOURCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const authorityClasses = [
  "AUTHORITATIVE_DECISION",
  "REVIEWED_INTERNAL",
  "CANONICAL_OPERATIONAL",
  "VERIFIED_EXTERNAL",
  "INFERRED"
] as const;

export type AuthorityClassV1 = (typeof authorityClasses)[number];
export type AuthorityResolutionStateV1 =
  | "CANONICAL"
  | "CONFLICTED"
  | "UNKNOWN"
  | "STALE"
  | "SUPERSEDED";

export interface SourceAuthorityRecordV1 {
  record_id: string;
  source_id: string;
  source_lineage_id: string;
  domain: string;
  authority: AuthorityClassV1;
  value_fingerprint: string;
  observed_at: string;
  truth_state: LearningTruthState;
  supersedes_record_id?: string | null;
}

export interface SourceAuthorityPolicyV1 {
  domain: string;
  evaluatedAt: string;
  maxAgeMs?: number;
  authorityOrder?: readonly AuthorityClassV1[];
}

export interface SourceAuthorityResolutionV1 {
  version: typeof SOURCE_AUTHORITY_RESOLVER_VERSION;
  state: AuthorityResolutionStateV1;
  reasonCode:
    | "AUTHORITATIVE_RECORD_SELECTED"
    | "MATERIAL_AUTHORITY_CONFLICT"
    | "NO_DOMAIN_EVIDENCE"
    | "AUTHORITATIVE_RECORD_STALE"
    | "ALL_EVIDENCE_SUPERSEDED"
    | "INVALID_INPUT";
  canonicalRecord: Readonly<SourceAuthorityRecordV1> | null;
  evidenceLineage: readonly string[];
  conflictedRecordIds: readonly string[];
  supersededRecordIds: readonly string[];
  duplicateRecordIds: readonly string[];
}

const DEFAULT_AUTHORITY_ORDER: readonly AuthorityClassV1[] = authorityClasses;

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function freezeRecord(record: SourceAuthorityRecordV1): Readonly<SourceAuthorityRecordV1> {
  return Object.freeze({ ...record });
}

function result(
  state: AuthorityResolutionStateV1,
  reasonCode: SourceAuthorityResolutionV1["reasonCode"],
  input: {
    canonicalRecord?: SourceAuthorityRecordV1 | null;
    evidenceLineage?: string[];
    conflictedRecordIds?: string[];
    supersededRecordIds?: string[];
    duplicateRecordIds?: string[];
  } = {}
): SourceAuthorityResolutionV1 {
  return Object.freeze({
    version: SOURCE_AUTHORITY_RESOLVER_VERSION,
    state,
    reasonCode,
    canonicalRecord: input.canonicalRecord ? freezeRecord(input.canonicalRecord) : null,
    evidenceLineage: Object.freeze([...(input.evidenceLineage ?? [])].sort()),
    conflictedRecordIds: Object.freeze([...(input.conflictedRecordIds ?? [])].sort()),
    supersededRecordIds: Object.freeze([...(input.supersededRecordIds ?? [])].sort()),
    duplicateRecordIds: Object.freeze([...(input.duplicateRecordIds ?? [])].sort())
  });
}

function isValidRecord(record: SourceAuthorityRecordV1): boolean {
  return Boolean(
    validText(record?.record_id) &&
    validText(record.source_id) &&
    validText(record.source_lineage_id) &&
    validText(record.domain) &&
    validText(record.value_fingerprint) &&
    authorityClasses.includes(record.authority) &&
    Number.isFinite(Date.parse(record.observed_at))
  );
}

function deduplicate(records: readonly SourceAuthorityRecordV1[]): {
  records: SourceAuthorityRecordV1[];
  duplicateRecordIds: string[];
} {
  const byIdentity = new Map<string, SourceAuthorityRecordV1>();
  const duplicateRecordIds: string[] = [];
  for (const record of [...records].sort((a, b) => a.record_id.localeCompare(b.record_id))) {
    const key = `${record.source_lineage_id}:${record.value_fingerprint}:${record.observed_at}`;
    if (byIdentity.has(key)) duplicateRecordIds.push(record.record_id);
    else byIdentity.set(key, record);
  }
  return { records: [...byIdentity.values()], duplicateRecordIds };
}

function supersededIds(records: readonly SourceAuthorityRecordV1[]): Set<string> {
  const ids = new Set(records.map((record) => record.record_id));
  const superseded = new Set<string>();
  for (const record of records) {
    if (record.supersedes_record_id && ids.has(record.supersedes_record_id)) {
      superseded.add(record.supersedes_record_id);
    }
  }
  return superseded;
}

export function resolveSourceAuthorityV1(
  records: readonly SourceAuthorityRecordV1[],
  policy: SourceAuthorityPolicyV1
): SourceAuthorityResolutionV1 {
  const evaluatedAt = Date.parse(policy?.evaluatedAt);
  const maxAgeMs = policy?.maxAgeMs ?? DEFAULT_MAX_SOURCE_AGE_MS;
  const order = policy?.authorityOrder ?? DEFAULT_AUTHORITY_ORDER;
  const validOrder =
    order.length === authorityClasses.length &&
    new Set(order).size === authorityClasses.length &&
    order.every((item) => authorityClasses.includes(item));

  if (
    !Array.isArray(records) ||
    records.length > MAX_AUTHORITY_RECORDS ||
    !validText(policy?.domain) ||
    !Number.isFinite(evaluatedAt) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 0 ||
    !validOrder ||
    records.some((record) => !isValidRecord(record))
  ) {
    return result("UNKNOWN", "INVALID_INPUT");
  }

  const domainRecords = records.filter((record) => record.domain === policy.domain);
  if (domainRecords.length === 0) return result("UNKNOWN", "NO_DOMAIN_EVIDENCE");

  const deduped = deduplicate(domainRecords);
  const superseded = supersededIds(deduped.records);
  const active = deduped.records.filter((record) => !superseded.has(record.record_id));
  const lineage = deduped.records.map((record) => record.source_lineage_id);
  const supersededRecordIds = [...superseded];

  if (active.length === 0) {
    return result("SUPERSEDED", "ALL_EVIDENCE_SUPERSEDED", {
      evidenceLineage: lineage,
      supersededRecordIds,
      duplicateRecordIds: deduped.duplicateRecordIds
    });
  }

  const authorityRank = new Map(order.map((value, index) => [value, index]));
  const bestRank = Math.min(...active.map((record) => authorityRank.get(record.authority) ?? Number.MAX_SAFE_INTEGER));
  const strongest = active.filter((record) => authorityRank.get(record.authority) === bestRank);
  const fingerprints = new Set(strongest.map((record) => record.value_fingerprint));
  const hasUnsafeTruth = strongest.some((record) => record.truth_state === "CONFLICTED");

  if (fingerprints.size > 1 || hasUnsafeTruth) {
    return result("CONFLICTED", "MATERIAL_AUTHORITY_CONFLICT", {
      evidenceLineage: lineage,
      conflictedRecordIds: strongest.map((record) => record.record_id),
      supersededRecordIds,
      duplicateRecordIds: deduped.duplicateRecordIds
    });
  }

  const selected = [...strongest].sort((a, b) => {
    const time = Date.parse(b.observed_at) - Date.parse(a.observed_at);
    return time || a.record_id.localeCompare(b.record_id);
  })[0];
  const ageMs = evaluatedAt - Date.parse(selected.observed_at);
  const stale =
    selected.truth_state === "STALE" ||
    selected.truth_state === "UNKNOWN" ||
    ageMs < 0 ||
    ageMs > maxAgeMs;

  if (stale) {
    return result("STALE", "AUTHORITATIVE_RECORD_STALE", {
      canonicalRecord: selected,
      evidenceLineage: lineage,
      supersededRecordIds,
      duplicateRecordIds: deduped.duplicateRecordIds
    });
  }

  return result("CANONICAL", "AUTHORITATIVE_RECORD_SELECTED", {
    canonicalRecord: selected,
    evidenceLineage: lineage,
    supersededRecordIds,
    duplicateRecordIds: deduped.duplicateRecordIds
  });
}
