import "@/lib/server-only";

import {
  appendDecisionPortfolioProjectionV1,
  DecisionPortfolioProjectionError,
  loadDecisionPortfolioProjectionHistoryV1,
  verifyDecisionPortfolioProjectionRowV1,
  type DecisionPortfolioProjectionStoreV1
} from "./decision-portfolio-loader-v1";
import type { DecisionPortfolioV1 } from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_PERSISTENCE_CERTIFICATION_VERSION_V1 =
  "decision_portfolio_persistence_certification_v1.0.0" as const;

export type DecisionPortfolioPersistenceCertificationV1 = {
  contractVersion: typeof DECISION_PORTFOLIO_PERSISTENCE_CERTIFICATION_VERSION_V1;
  status: "VERIFIED" | "UNVERIFIED";
  scope: "PERSIST_RELOAD_EXACT_REPLAY_HISTORY";
  portfolioId: string;
  proofRef: string;
  evaluatedAt: string;
  firstWriteStatus: "APPENDED" | "REPLAY_NOOP" | null;
  replayStatus: "REPLAY_NOOP" | null;
  contentHash: string | null;
  persistedAt: string | null;
  historyMatchCount: number;
  decisionGrade: boolean;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  issues: readonly string[];
};

type CertificationOptionsV1 = {
  now: string;
  maxAgeMs: number;
  proofRef: string;
  historyLimit?: number;
};

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionPortfolioProjectionError("INVALID_CERTIFICATION_INPUT", `${label} must be non-empty text`);
  }
  return value.trim();
}

function timestamp(value: string, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new DecisionPortfolioProjectionError("INVALID_CERTIFICATION_INPUT", `${label} must be a valid timestamp`);
  }
  return normalized;
}

function freshness(value: number): number {
  if ((!Number.isFinite(value) && value !== Number.POSITIVE_INFINITY) || value < 0) {
    throw new DecisionPortfolioProjectionError(
      "INVALID_CERTIFICATION_INPUT",
      "maxAgeMs must be non-negative and finite or positive infinity"
    );
  }
  return value;
}

function historyLimit(value: number | undefined): number {
  const normalized = value ?? 100;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new DecisionPortfolioProjectionError("INVALID_CERTIFICATION_INPUT", "historyLimit must be an integer from 1 to 100");
  }
  return normalized;
}

function safeIssue(error: unknown): string {
  if (error instanceof DecisionPortfolioProjectionError) return error.code;
  return "CERTIFICATION_RUNTIME_FAILURE";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export async function certifyDecisionPortfolioPersistenceV1(
  store: DecisionPortfolioProjectionStoreV1,
  portfolio: DecisionPortfolioV1,
  options: CertificationOptionsV1
): Promise<DecisionPortfolioPersistenceCertificationV1> {
  const evaluatedAt = timestamp(options.now, "now");
  const maxAgeMs = freshness(options.maxAgeMs);
  const proofRef = text(options.proofRef, "proofRef");
  const limit = historyLimit(options.historyLimit);
  const evidenceRefs = uniqueSorted(Array.isArray(portfolio.evidenceRefs) ? portfolio.evidenceRefs : []);
  const sourceRefs = uniqueSorted(Array.isArray(portfolio.sourceRefs) ? portfolio.sourceRefs : []);
  const issues: string[] = [];

  let firstWriteStatus: "APPENDED" | "REPLAY_NOOP" | null = null;
  let replayStatus: "REPLAY_NOOP" | null = null;
  let contentHash: string | null = null;
  let persistedAt: string | null = null;
  let historyMatchCount = 0;
  let decisionGrade = false;

  if (!Array.isArray(portfolio.items) || portfolio.items.length === 0) issues.push("EMPTY_PORTFOLIO");
  if (evidenceRefs.length === 0) issues.push("NO_PORTFOLIO_EVIDENCE");
  if (sourceRefs.length === 0) issues.push("NO_PORTFOLIO_SOURCES");

  if (issues.length === 0) {
    try {
      const first = await appendDecisionPortfolioProjectionV1(store, portfolio, { now: evaluatedAt });
      firstWriteStatus = first.status;
      contentHash = first.row.content_hash;
      persistedAt = first.row.persisted_at;

      const replay = await appendDecisionPortfolioProjectionV1(store, portfolio, { now: evaluatedAt });
      if (replay.status !== "REPLAY_NOOP") {
        issues.push("EXACT_REPLAY_NOT_IDEMPOTENT");
      } else {
        replayStatus = replay.status;
      }
      if (replay.row.content_hash !== first.row.content_hash) issues.push("REPLAY_HASH_CHANGED");
      if (replay.row.persisted_at !== first.row.persisted_at) issues.push("REPLAY_MUTATED_PERSISTENCE_TIME");

      const directRow = await store.findByPortfolioId(portfolio.portfolioId);
      if (directRow == null) {
        issues.push("PERSISTED_ROW_MISSING");
      } else {
        const direct = verifyDecisionPortfolioProjectionRowV1(directRow, { now: evaluatedAt, maxAgeMs });
        if (direct.truthState !== "LIVE" || !direct.decisionGrade || direct.portfolio == null) {
          issues.push(...direct.issues.map((issue) => `DIRECT_${issue}`));
          if (direct.issues.length === 0) issues.push("DIRECT_PORTFOLIO_NOT_LIVE");
        } else {
          decisionGrade = true;
        }
      }

      const history = await loadDecisionPortfolioProjectionHistoryV1(store, {
        now: evaluatedAt,
        maxAgeMs,
        limit
      });
      historyMatchCount = history.entries.filter((entry) => entry.portfolioId === portfolio.portfolioId).length;
      if (historyMatchCount !== 1) issues.push("HISTORY_IDENTITY_COUNT_MISMATCH");
      if (history.truthState === "UNVERIFIED") {
        issues.push(...history.issues.map((issue) => `HISTORY_${issue}`));
      }
      const historyEntry = history.entries.find((entry) => entry.portfolioId === portfolio.portfolioId);
      if (historyEntry == null || historyEntry.truthState !== "LIVE" || !historyEntry.decisionGrade || historyEntry.portfolio == null) {
        issues.push("HISTORY_PORTFOLIO_NOT_LIVE");
      }
    } catch (error) {
      issues.push(safeIssue(error));
    }
  }

  const uniqueIssues = uniqueSorted(issues);
  return Object.freeze({
    contractVersion: DECISION_PORTFOLIO_PERSISTENCE_CERTIFICATION_VERSION_V1,
    status: uniqueIssues.length === 0 ? "VERIFIED" : "UNVERIFIED",
    scope: "PERSIST_RELOAD_EXACT_REPLAY_HISTORY",
    portfolioId: typeof portfolio.portfolioId === "string" && portfolio.portfolioId.trim() ? portfolio.portfolioId : "UNVERIFIED",
    proofRef,
    evaluatedAt,
    firstWriteStatus,
    replayStatus,
    contentHash,
    persistedAt,
    historyMatchCount,
    decisionGrade: uniqueIssues.length === 0 && decisionGrade,
    evidenceRefs,
    sourceRefs,
    issues: uniqueIssues
  });
}
