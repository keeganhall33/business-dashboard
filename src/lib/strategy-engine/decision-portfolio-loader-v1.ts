import "@/lib/server-only";
import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  DECISION_PORTFOLIO_POLICY_VERSION_V1,
  type DecisionPortfolioV1
} from "./decision-portfolio-v1";

export type DecisionPortfolioProjectionTruthStateV1 = "LIVE" | "STALE" | "UNVERIFIED";
export type DecisionPortfolioProjectionPersistStatusV1 = "PERSISTED" | "IDEMPOTENT" | "CONFLICTING";

export type DecisionPortfolioProjectionRowV1 = {
  portfolio_id: string;
  contract_version: string;
  policy_version: string;
  generated_at: string;
  content_hash: string;
  evidence_refs: readonly string[];
  source_refs: readonly string[];
  payload: unknown;
  persisted_at: string;
};

export type DecisionPortfolioProjectionInsertV1 = Omit<DecisionPortfolioProjectionRowV1, "persisted_at">;

export type DecisionPortfolioProjectionPersistResultV1 = {
  status: DecisionPortfolioProjectionPersistStatusV1;
  portfolioId: string;
  contentHash: string;
};

export interface DecisionPortfolioProjectionStoreV1 {
  persist(row: DecisionPortfolioProjectionInsertV1): Promise<DecisionPortfolioProjectionPersistResultV1>;
  findByPortfolioId(portfolioId: string): Promise<DecisionPortfolioProjectionRowV1 | null>;
  listRecent(limit: number): Promise<readonly DecisionPortfolioProjectionRowV1[]>;
}

export class DecisionPortfolioProjectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioProjectionError";
  }
}

type RecordLike = Record<string, unknown>;
const PORTFOLIO_ID_PATTERN = /^decision_portfolio_[a-f0-9]{20}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const OWNERS = new Set(["KEEGAN", "IOANA", "JEEVES"]);
const APPROVAL_CLASSES = new Set(["NONE", "REVIEW", "KEEGAN"]);
const EVIDENCE_STATES = new Set(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]);
const DISPOSITIONS = new Set(["SELECTED", "DEFERRED", "REJECTED", "INFORMATION_GAIN"]);

function record(value: unknown, label: string): RecordLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DecisionPortfolioProjectionError("INVALID_PAYLOAD", `${label} must be an object`);
  }
  return value as RecordLike;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionPortfolioProjectionError("INVALID_PAYLOAD", `${label} must be non-empty text`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): { value: string; ms: number } {
  const normalized = text(value, label);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    throw new DecisionPortfolioProjectionError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  }
  return { value: normalized, ms };
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new DecisionPortfolioProjectionError("INVALID_PAYLOAD", `${label} must be a finite non-negative number`);
  }
  return value;
}

function stringList(value: unknown, label: string, requireCanonical = false): string[] {
  if (!Array.isArray(value)) {
    throw new DecisionPortfolioProjectionError("INVALID_PAYLOAD", `${label} must be an array`);
  }
  const values = value.map((item, index) => text(item, `${label}[${index}]`));
  const canonicalValues = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  if (requireCanonical && (values.length !== canonicalValues.length || values.some((item, index) => item !== canonicalValues[index]))) {
    throw new DecisionPortfolioProjectionError("NON_CANONICAL_PAYLOAD", `${label} must be unique and canonically sorted`);
  }
  return values;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as RecordLike)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, canonical((value as RecordLike)[key])])
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assertCapacity(value: unknown, label: string): void {
  const capacity = record(value, label);
  nonNegativeNumber(capacity.keeganHours, `${label}.keeganHours`);
  nonNegativeNumber(capacity.ioanaHours, `${label}.ioanaHours`);
  nonNegativeNumber(capacity.jeevesHours, `${label}.jeevesHours`);
  nonNegativeNumber(capacity.cashCents, `${label}.cashCents`);
}

export function validateDecisionPortfolioProjectionPayloadV1(value: unknown, now: string): DecisionPortfolioV1 {
  const nowMs = timestamp(now, "now").ms;
  const payload = record(value, "portfolio");
  if (payload.contractVersion !== "DecisionPortfolioV1") {
    throw new DecisionPortfolioProjectionError("CONTRACT_MISMATCH", "portfolio.contractVersion is not DecisionPortfolioV1");
  }
  if (payload.policyVersion !== DECISION_PORTFOLIO_POLICY_VERSION_V1) {
    throw new DecisionPortfolioProjectionError("POLICY_MISMATCH", "portfolio.policyVersion is not the current canonical policy");
  }

  const portfolioId = text(payload.portfolioId, "portfolio.portfolioId");
  if (!PORTFOLIO_ID_PATTERN.test(portfolioId)) {
    throw new DecisionPortfolioProjectionError("INVALID_IDENTITY", "portfolio.portfolioId is not canonical");
  }
  const generated = timestamp(payload.generatedAt, "portfolio.generatedAt");
  if (generated.ms > nowMs) {
    throw new DecisionPortfolioProjectionError("FUTURE_PORTFOLIO", "portfolio.generatedAt cannot be in the future");
  }

  if (!Array.isArray(payload.items)) {
    throw new DecisionPortfolioProjectionError("INVALID_PAYLOAD", "portfolio.items must be an array");
  }
  const selectedIds = stringList(payload.selectedIds, "portfolio.selectedIds", true);
  const selectedSet = new Set(selectedIds);
  const seen = new Set<string>();
  const candidateEvidenceRefs: string[] = [];
  const candidateSourceRefs: string[] = [];
  const selectedByRank: Array<{ id: string; owner: string; approvalClass: string }> = [];
  const informationGainByRank: string[] = [];

  payload.items.forEach((itemValue, index) => {
    const item = record(itemValue, `portfolio.items[${index}]`);
    const disposition = text(item.disposition, `portfolio.items[${index}].disposition`);
    if (!DISPOSITIONS.has(disposition)) {
      throw new DecisionPortfolioProjectionError("INVALID_DISPOSITION", `${disposition} is not a canonical disposition`);
    }
    const candidate = record(item.candidate, `portfolio.items[${index}].candidate`);
    const id = text(candidate.id, `portfolio.items[${index}].candidate.id`);
    if (seen.has(id)) {
      throw new DecisionPortfolioProjectionError("DUPLICATE_CANDIDATE", `candidate ${id} appears more than once`);
    }
    seen.add(id);

    const owner = text(candidate.owner, `${id}.owner`);
    const approvalClass = text(candidate.approvalClass, `${id}.approvalClass`);
    const evidenceState = text(candidate.evidenceState, `${id}.evidenceState`);
    if (!OWNERS.has(owner) || !APPROVAL_CLASSES.has(approvalClass) || !EVIDENCE_STATES.has(evidenceState)) {
      throw new DecisionPortfolioProjectionError("INVALID_CANDIDATE", `candidate ${id} has invalid governance metadata`);
    }

    const evidenceRefs = stringList(candidate.evidenceRefs, `${id}.evidenceRefs`, true);
    const sourceRefs = stringList(candidate.sourceRefs, `${id}.sourceRefs`, true);
    const blockers = stringList(candidate.blockers, `${id}.blockers`, true);
    candidateEvidenceRefs.push(...evidenceRefs);
    candidateSourceRefs.push(...sourceRefs);

    const selected = selectedSet.has(id);
    if ((disposition === "SELECTED") !== selected) {
      throw new DecisionPortfolioProjectionError("SELECTION_MISMATCH", `candidate ${id} selection metadata disagrees`);
    }
    if (selected) {
      if (evidenceState !== "KNOWN" && evidenceState !== "INFERRED") {
        throw new DecisionPortfolioProjectionError("UNSAFE_SELECTED_EVIDENCE", `selected candidate ${id} is not decision-grade`);
      }
      if (blockers.length > 0) {
        throw new DecisionPortfolioProjectionError("BLOCKED_SELECTION", `selected candidate ${id} still has blockers`);
      }
      if (evidenceRefs.length === 0 || sourceRefs.length === 0) {
        throw new DecisionPortfolioProjectionError("MISSING_LINEAGE", `selected candidate ${id} lacks evidence or source lineage`);
      }
      selectedByRank.push({ id, owner, approvalClass });
    }
    if (disposition === "INFORMATION_GAIN") informationGainByRank.push(id);
  });

  if (selectedIds.some((id) => !seen.has(id))) {
    throw new DecisionPortfolioProjectionError("SELECTION_MISMATCH", "portfolio.selectedIds contains a missing candidate");
  }

  const evidenceRefs = stringList(payload.evidenceRefs, "portfolio.evidenceRefs", true);
  const sourceRefs = stringList(payload.sourceRefs, "portfolio.sourceRefs", true);
  const expectedEvidenceRefs = [...new Set(candidateEvidenceRefs)].sort((a, b) => a.localeCompare(b));
  const expectedSourceRefs = [...new Set(candidateSourceRefs)].sort((a, b) => a.localeCompare(b));
  if (!sameList(evidenceRefs, expectedEvidenceRefs) || !sameList(sourceRefs, expectedSourceRefs)) {
    throw new DecisionPortfolioProjectionError("LINEAGE_MISMATCH", "portfolio lineage does not match candidate lineage");
  }

  const ownerQueues = record(payload.ownerQueues, "portfolio.ownerQueues");
  for (const owner of ["KEEGAN", "IOANA", "JEEVES"] as const) {
    const actual = stringList(ownerQueues[owner], `portfolio.ownerQueues.${owner}`);
    const expected = selectedByRank.filter((item) => item.owner === owner).map((item) => item.id);
    if (!sameList(actual, expected)) {
      throw new DecisionPortfolioProjectionError("OWNER_QUEUE_MISMATCH", `portfolio owner queue ${owner} disagrees with selected work`);
    }
  }

  const keeganDecisionIds = stringList(payload.keeganDecisionIds, "portfolio.keeganDecisionIds");
  const expectedKeeganDecisionIds = selectedByRank.filter((item) => item.approvalClass === "KEEGAN").map((item) => item.id);
  if (!sameList(keeganDecisionIds, expectedKeeganDecisionIds)) {
    throw new DecisionPortfolioProjectionError("APPROVAL_MISMATCH", "portfolio Keegan approval queue disagrees with selected work");
  }

  const informationGainIds = stringList(payload.informationGainIds, "portfolio.informationGainIds");
  if (!sameList(informationGainIds, informationGainByRank)) {
    throw new DecisionPortfolioProjectionError("INFORMATION_GAIN_MISMATCH", "portfolio information-gain queue disagrees with item dispositions");
  }

  assertCapacity(payload.usedCapacity, "portfolio.usedCapacity");
  assertCapacity(payload.remainingCapacity, "portfolio.remainingCapacity");
  const audit = record(payload.audit, "portfolio.audit");
  if (audit.exactOptimization !== true || audit.candidatesConsidered !== payload.items.length) {
    throw new DecisionPortfolioProjectionError("AUDIT_MISMATCH", "portfolio audit metadata is not canonical");
  }

  return cloneJson(value) as DecisionPortfolioV1;
}

export function prepareDecisionPortfolioProjectionV1(
  portfolio: DecisionPortfolioV1,
  options: { now: string }
): DecisionPortfolioProjectionInsertV1 {
  const validated = validateDecisionPortfolioProjectionPayloadV1(portfolio, options.now);
  return {
    portfolio_id: validated.portfolioId,
    contract_version: validated.contractVersion,
    policy_version: validated.policyVersion,
    generated_at: validated.generatedAt,
    content_hash: contentHash(validated),
    evidence_refs: [...validated.evidenceRefs],
    source_refs: [...validated.sourceRefs],
    payload: validated
  };
}

function safeStoreCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /^[A-Za-z0-9_]+$/.test(code) ? code : "UNKNOWN";
}

function storeError(operation: string, error: unknown): DecisionPortfolioProjectionError {
  return new DecisionPortfolioProjectionError("STORE_FAILURE", `${operation} failed (${safeStoreCode(error)})`);
}

function normalizeRow(value: unknown): DecisionPortfolioProjectionRowV1 {
  const row = record(value, "projection row");
  return {
    portfolio_id: text(row.portfolio_id, "row.portfolio_id"),
    contract_version: text(row.contract_version, "row.contract_version"),
    policy_version: text(row.policy_version, "row.policy_version"),
    generated_at: text(row.generated_at, "row.generated_at"),
    content_hash: text(row.content_hash, "row.content_hash"),
    evidence_refs: stringList(row.evidence_refs, "row.evidence_refs", true),
    source_refs: stringList(row.source_refs, "row.source_refs", true),
    payload: row.payload,
    persisted_at: text(row.persisted_at, "row.persisted_at")
  };
}

export function createSupabaseDecisionPortfolioProjectionStoreV1(
  client = getSupabaseServerClient()
): DecisionPortfolioProjectionStoreV1 {
  return {
    async persist(row) {
      const { data, error } = await client.rpc("persist_decision_portfolio_projection_v1", {
        in_portfolio_id: row.portfolio_id,
        in_contract_version: row.contract_version,
        in_policy_version: row.policy_version,
        in_generated_at: row.generated_at,
        in_content_hash: row.content_hash,
        in_evidence_refs: [...row.evidence_refs],
        in_source_refs: [...row.source_refs],
        in_payload: row.payload
      });
      if (error) throw storeError("Decision portfolio projection persistence", error);
      const result = record(Array.isArray(data) ? data[0] : data, "persistence result");
      const status = text(result.status, "persistence result.status") as DecisionPortfolioProjectionPersistStatusV1;
      if (!new Set(["PERSISTED", "IDEMPOTENT", "CONFLICTING"]).has(status)) {
        throw new DecisionPortfolioProjectionError("STORE_PROTOCOL", "Persistence returned an unknown status");
      }
      return {
        status,
        portfolioId: text(result.portfolio_id, "persistence result.portfolio_id"),
        contentHash: text(result.content_hash, "persistence result.content_hash")
      };
    },
    async findByPortfolioId(portfolioId) {
      const { data, error } = await client
        .from("decision_portfolio_projection_v1")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (error) throw storeError("Decision portfolio projection read", error);
      return data == null ? null : normalizeRow(data);
    },
    async listRecent(limit) {
      const { data, error } = await client
        .from("decision_portfolio_projection_v1")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(limit);
      if (error) throw storeError("Decision portfolio projection history read", error);
      return Array.isArray(data) ? data.map(normalizeRow) : [];
    }
  };
}

export async function appendDecisionPortfolioProjectionV1(
  store: DecisionPortfolioProjectionStoreV1,
  portfolio: DecisionPortfolioV1,
  options: { now: string }
): Promise<{ status: "APPENDED" | "REPLAY_NOOP"; row: DecisionPortfolioProjectionRowV1 }> {
  const projection = prepareDecisionPortfolioProjectionV1(portfolio, options);
  const persisted = await store.persist(projection);
  if (persisted.portfolioId !== projection.portfolio_id) {
    throw new DecisionPortfolioProjectionError("STORE_PROTOCOL", "Persistence returned the wrong portfolio identity");
  }
  if (persisted.status === "CONFLICTING" || persisted.contentHash !== projection.content_hash) {
    throw new DecisionPortfolioProjectionError("CONFLICTING_IDENTITY", "A different payload already exists for this portfolio identity");
  }
  const row = await store.findByPortfolioId(projection.portfolio_id);
  if (!row) throw new DecisionPortfolioProjectionError("STORE_PROTOCOL", "Persisted portfolio could not be re-read");
  const verified = verifyDecisionPortfolioProjectionRowV1(row, { now: options.now, maxAgeMs: Number.POSITIVE_INFINITY });
  if (verified.truthState === "UNVERIFIED" || verified.portfolio == null) {
    throw new DecisionPortfolioProjectionError("STORE_INTEGRITY", "Persisted portfolio failed integrity verification");
  }
  return { status: persisted.status === "PERSISTED" ? "APPENDED" : "REPLAY_NOOP", row: cloneJson(row) };
}

export type VerifiedDecisionPortfolioProjectionV1 = {
  portfolioId: string;
  truthState: DecisionPortfolioProjectionTruthStateV1;
  decisionGrade: boolean;
  portfolio: DecisionPortfolioV1 | null;
  issues: readonly string[];
  generatedAt: string | null;
  persistedAt: string | null;
};

export function verifyDecisionPortfolioProjectionRowV1(
  rowValue: unknown,
  options: { now: string; maxAgeMs: number }
): VerifiedDecisionPortfolioProjectionV1 {
  const nowMs = timestamp(options.now, "now").ms;
  if (!Number.isFinite(options.maxAgeMs) && options.maxAgeMs !== Number.POSITIVE_INFINITY) {
    throw new DecisionPortfolioProjectionError("INVALID_FRESHNESS_POLICY", "maxAgeMs must be finite or positive infinity");
  }
  if (options.maxAgeMs < 0) {
    throw new DecisionPortfolioProjectionError("INVALID_FRESHNESS_POLICY", "maxAgeMs cannot be negative");
  }

  try {
    const row = normalizeRow(rowValue);
    const generated = timestamp(row.generated_at, "row.generated_at");
    const persisted = timestamp(row.persisted_at, "row.persisted_at");
    if (generated.ms > nowMs || persisted.ms > nowMs || persisted.ms < generated.ms) {
      throw new DecisionPortfolioProjectionError("INVALID_CHRONOLOGY", "Projection chronology is impossible");
    }
    if (!PORTFOLIO_ID_PATTERN.test(row.portfolio_id) || !HASH_PATTERN.test(row.content_hash)) {
      throw new DecisionPortfolioProjectionError("INVALID_IDENTITY", "Projection identity or content hash is invalid");
    }

    const portfolio = validateDecisionPortfolioProjectionPayloadV1(row.payload, options.now);
    if (
      row.portfolio_id !== portfolio.portfolioId ||
      row.contract_version !== portfolio.contractVersion ||
      row.policy_version !== portfolio.policyVersion ||
      Date.parse(row.generated_at) !== Date.parse(portfolio.generatedAt) ||
      row.content_hash !== contentHash(portfolio) ||
      !sameList(row.evidence_refs, portfolio.evidenceRefs) ||
      !sameList(row.source_refs, portfolio.sourceRefs)
    ) {
      throw new DecisionPortfolioProjectionError("ROW_PAYLOAD_MISMATCH", "Projection row metadata disagrees with its canonical payload");
    }

    const stale = nowMs - generated.ms > options.maxAgeMs;
    return {
      portfolioId: row.portfolio_id,
      truthState: stale ? "STALE" : "LIVE",
      decisionGrade: !stale,
      portfolio,
      issues: stale ? ["PORTFOLIO_STALE"] : [],
      generatedAt: portfolio.generatedAt,
      persistedAt: row.persisted_at
    };
  } catch (error) {
    const code = error instanceof DecisionPortfolioProjectionError ? error.code : "UNVERIFIED_PROJECTION";
    const raw = rowValue && typeof rowValue === "object" && "portfolio_id" in rowValue ? String((rowValue as RecordLike).portfolio_id ?? "") : "";
    return {
      portfolioId: PORTFOLIO_ID_PATTERN.test(raw) ? raw : "UNVERIFIED",
      truthState: "UNVERIFIED",
      decisionGrade: false,
      portfolio: null,
      issues: [code],
      generatedAt: null,
      persistedAt: null
    };
  }
}

export type DecisionPortfolioProjectionHistoryV1 = {
  truthState: DecisionPortfolioProjectionTruthStateV1;
  decisionGrade: boolean;
  latestPortfolio: DecisionPortfolioV1 | null;
  entries: readonly VerifiedDecisionPortfolioProjectionV1[];
  issues: readonly string[];
};

export async function loadDecisionPortfolioProjectionHistoryV1(
  store: DecisionPortfolioProjectionStoreV1,
  options: { now: string; maxAgeMs: number; limit?: number }
): Promise<DecisionPortfolioProjectionHistoryV1> {
  timestamp(options.now, "now");
  if (!Number.isInteger(options.limit ?? 20) || (options.limit ?? 20) < 1 || (options.limit ?? 20) > 100) {
    throw new DecisionPortfolioProjectionError("INVALID_LIMIT", "limit must be an integer between 1 and 100");
  }
  if ((!Number.isFinite(options.maxAgeMs) && options.maxAgeMs !== Number.POSITIVE_INFINITY) || options.maxAgeMs < 0) {
    throw new DecisionPortfolioProjectionError("INVALID_FRESHNESS_POLICY", "maxAgeMs is invalid");
  }

  const rows = await store.listRecent(options.limit ?? 20);
  if (rows.length === 0) {
    return { truthState: "UNVERIFIED", decisionGrade: false, latestPortfolio: null, entries: [], issues: ["NO_PERSISTED_PORTFOLIOS"] };
  }

  const seen = new Set<string>();
  const entries = rows.map((row) => {
    const entry = verifyDecisionPortfolioProjectionRowV1(row, options);
    if (seen.has(entry.portfolioId)) {
      return { ...entry, truthState: "UNVERIFIED" as const, decisionGrade: false, portfolio: null, issues: ["DUPLICATE_PERSISTED_IDENTITY"], generatedAt: null, persistedAt: null };
    }
    seen.add(entry.portfolioId);
    return entry;
  });
  const integrityIssues = entries.flatMap((entry) => entry.truthState === "UNVERIFIED" ? entry.issues : []);
  if (integrityIssues.length > 0) {
    return { truthState: "UNVERIFIED", decisionGrade: false, latestPortfolio: null, entries, issues: [...new Set(integrityIssues)] };
  }

  const latest = entries[0];
  return {
    truthState: latest.truthState,
    decisionGrade: latest.decisionGrade,
    latestPortfolio: latest.portfolio,
    entries,
    issues: latest.issues
  };
}

export async function loadLiveDecisionPortfolioProjectionHistoryV1(options: {
  now: string;
  maxAgeMs: number;
  limit?: number;
}): Promise<DecisionPortfolioProjectionHistoryV1> {
  return loadDecisionPortfolioProjectionHistoryV1(createSupabaseDecisionPortfolioProjectionStoreV1(), options);
}
