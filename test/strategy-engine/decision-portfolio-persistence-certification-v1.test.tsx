import assert from "node:assert/strict";
import test from "node:test";

import {
  certifyDecisionPortfolioPersistenceV1,
  DECISION_PORTFOLIO_PERSISTENCE_CERTIFICATION_VERSION_V1
} from "../../src/lib/strategy-engine/decision-portfolio-persistence-certification-v1";
import {
  type DecisionPortfolioProjectionInsertV1,
  type DecisionPortfolioProjectionPersistResultV1,
  type DecisionPortfolioProjectionRowV1,
  type DecisionPortfolioProjectionStoreV1
} from "../../src/lib/strategy-engine/decision-portfolio-loader-v1";
import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionPortfolioV1
} from "../../src/lib/strategy-engine/decision-portfolio-v1";

const generatedAt = "2026-09-19T03:00:00.000Z";
const freshNow = "2026-09-19T03:05:00.000Z";

function candidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: `Candidate ${id}`,
    candidateType: "DECISION",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    monetaryCase: null,
    value: {
      strategicFit: 70,
      compoundingAdvantage: 60,
      relationshipAccess: 50,
      futureOptions: 60,
      learningValue: 70,
      urgency: 50,
      reversibility: 80
    },
    risk: { execution: 10, reputation: 10, rights: 10 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: `Prepare ${id}`,
    successMetric: `Observe ${id}`,
    evaluationWindow: { start: "2026-09-19", end: "2026-10-19" },
    ...overrides
  };
}

function portfolio(): DecisionPortfolioV1 {
  return buildDecisionPortfolioV1({
    candidates: [
      candidate("jeeves"),
      candidate("keegan", {
        owner: "KEEGAN",
        approvalClass: "KEEGAN",
        resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 0, cashCents: 0 }
      })
    ],
    capacity: {
      keeganHours: 2,
      ioanaHours: 1,
      jeevesHours: 4,
      cashCents: 0,
      maxSelected: 2,
      maxKeeganDecisions: 1
    },
    generatedAt
  });
}

class InMemoryStore implements DecisionPortfolioProjectionStoreV1 {
  protected readonly rows = new Map<string, DecisionPortfolioProjectionRowV1>();

  async persist(row: DecisionPortfolioProjectionInsertV1): Promise<DecisionPortfolioProjectionPersistResultV1> {
    const existing = this.rows.get(row.portfolio_id);
    if (existing) {
      return {
        status: existing.content_hash === row.content_hash ? "IDEMPOTENT" : "CONFLICTING",
        portfolioId: row.portfolio_id,
        contentHash: existing.content_hash
      };
    }
    this.rows.set(row.portfolio_id, {
      ...structuredClone(row),
      persisted_at: generatedAt
    });
    return { status: "PERSISTED", portfolioId: row.portfolio_id, contentHash: row.content_hash };
  }

  async findByPortfolioId(portfolioId: string): Promise<DecisionPortfolioProjectionRowV1 | null> {
    const row = this.rows.get(portfolioId);
    return row == null ? null : structuredClone(row);
  }

  async listRecent(limit: number): Promise<readonly DecisionPortfolioProjectionRowV1[]> {
    return [...this.rows.values()]
      .sort((left, right) => Date.parse(right.generated_at) - Date.parse(left.generated_at))
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }
}

class ReplayMutatingStore extends InMemoryStore {
  private writes = 0;

  override async persist(row: DecisionPortfolioProjectionInsertV1): Promise<DecisionPortfolioProjectionPersistResultV1> {
    this.writes += 1;
    const result = await super.persist(row);
    if (this.writes > 1 && result.status === "IDEMPOTENT") {
      const existing = this.rows.get(row.portfolio_id)!;
      this.rows.set(row.portfolio_id, { ...existing, persisted_at: "2026-09-19T03:01:00.000Z" });
    }
    return result;
  }
}

class DuplicateHistoryStore extends InMemoryStore {
  override async listRecent(limit: number): Promise<readonly DecisionPortfolioProjectionRowV1[]> {
    const rows = await super.listRecent(limit);
    if (rows.length === 0) return rows;
    return [structuredClone(rows[0]), structuredClone(rows[0])];
  }
}

test("certifies persist, reload, exact replay and history without inventing business outcomes", async () => {
  const result = await certifyDecisionPortfolioPersistenceV1(new InMemoryStore(), portfolio(), {
    now: freshNow,
    maxAgeMs: 60 * 60 * 1000,
    proofRef: "test://authorized-runtime-proof"
  });

  assert.equal(result.contractVersion, DECISION_PORTFOLIO_PERSISTENCE_CERTIFICATION_VERSION_V1);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.firstWriteStatus, "APPENDED");
  assert.equal(result.replayStatus, "REPLAY_NOOP");
  assert.equal(result.historyMatchCount, 1);
  assert.equal(result.decisionGrade, true);
  assert.equal(result.proofRef, "test://authorized-runtime-proof");
  assert.ok(result.contentHash);
  assert.ok(result.persistedAt);
  assert.deepEqual(result.issues, []);
});

test("can re-certify an already persisted canonical portfolio without creating history", async () => {
  const store = new InMemoryStore();
  const input = portfolio();
  const options = { now: freshNow, maxAgeMs: 60 * 60 * 1000, proofRef: "test://repeat-proof" };

  const first = await certifyDecisionPortfolioPersistenceV1(store, input, options);
  const second = await certifyDecisionPortfolioPersistenceV1(store, input, options);

  assert.equal(first.status, "VERIFIED");
  assert.equal(second.status, "VERIFIED");
  assert.equal(second.firstWriteStatus, "REPLAY_NOOP");
  assert.equal(second.replayStatus, "REPLAY_NOOP");
  assert.equal(second.historyMatchCount, 1);
  assert.equal(second.persistedAt, first.persistedAt);
});

test("fails certification if an idempotent replay mutates persisted state", async () => {
  const result = await certifyDecisionPortfolioPersistenceV1(new ReplayMutatingStore(), portfolio(), {
    now: freshNow,
    maxAgeMs: 60 * 60 * 1000,
    proofRef: "test://replay-mutation"
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.decisionGrade, false);
  assert.ok(result.issues.includes("REPLAY_MUTATED_PERSISTENCE_TIME"));
});

test("fails certification when persisted history contains duplicate canonical identity", async () => {
  const result = await certifyDecisionPortfolioPersistenceV1(new DuplicateHistoryStore(), portfolio(), {
    now: freshNow,
    maxAgeMs: 60 * 60 * 1000,
    proofRef: "test://duplicate-history"
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.decisionGrade, false);
  assert.ok(result.issues.includes("HISTORY_IDENTITY_COUNT_MISMATCH"));
  assert.ok(result.issues.includes("HISTORY_DUPLICATE_PERSISTED_IDENTITY"));
});

test("refuses to certify a stale portfolio as current decision-grade truth", async () => {
  const result = await certifyDecisionPortfolioPersistenceV1(new InMemoryStore(), portfolio(), {
    now: "2026-09-19T05:05:00.000Z",
    maxAgeMs: 60 * 60 * 1000,
    proofRef: "test://stale-proof"
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.decisionGrade, false);
  assert.ok(result.issues.includes("DIRECT_PORTFOLIO_STALE"));
  assert.ok(result.issues.includes("HISTORY_PORTFOLIO_NOT_LIVE"));
});

test("refuses empty or lineage-free portfolios instead of manufacturing a successful proof", async () => {
  const empty = buildDecisionPortfolioV1({
    candidates: [],
    capacity: {
      keeganHours: 0,
      ioanaHours: 0,
      jeevesHours: 0,
      cashCents: 0,
      maxSelected: 0,
      maxKeeganDecisions: 0
    },
    generatedAt
  });

  const result = await certifyDecisionPortfolioPersistenceV1(new InMemoryStore(), empty, {
    now: freshNow,
    maxAgeMs: 60 * 60 * 1000,
    proofRef: "test://empty-proof"
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.firstWriteStatus, null);
  assert.equal(result.replayStatus, null);
  assert.equal(result.historyMatchCount, 0);
  assert.deepEqual(result.issues, ["EMPTY_PORTFOLIO", "NO_PORTFOLIO_EVIDENCE", "NO_PORTFOLIO_SOURCES"]);
});
