import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDecisionPortfolioProjectionV1,
  DecisionPortfolioProjectionError,
  loadDecisionPortfolioProjectionHistoryV1,
  prepareDecisionPortfolioProjectionV1,
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

const generatedAt = "2026-09-18T13:00:00.000Z";
const freshNow = "2026-09-18T13:05:00.000Z";

function candidate(id: string, overrides: Partial<DecisionCandidateV1> = {}): DecisionCandidateV1 {
  return {
    id,
    title: id,
    candidateType: "OPPORTUNITY",
    owner: "JEEVES",
    approvalClass: "NONE",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${id}`],
    sourceRefs: [`source:${id}`],
    monetaryCase: null,
    value: { strategicFit: 70, compoundingAdvantage: 70, relationshipAccess: 70, futureOptions: 70, learningValue: 70, urgency: 70, reversibility: 70 },
    risk: { execution: 10, reputation: 10, rights: 10 },
    resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 1, cashCents: 0 },
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: `Prepare ${id}`,
    successMetric: `Measure ${id}`,
    evaluationWindow: { start: "2026-09-18", end: "2026-10-18" },
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
    capacity: { keeganHours: 2, ioanaHours: 2, jeevesHours: 4, cashCents: 100_000, maxSelected: 2, maxKeeganDecisions: 1 },
    generatedAt
  });
}

class InMemoryStore implements DecisionPortfolioProjectionStoreV1 {
  private readonly rows = new Map<string, DecisionPortfolioProjectionRowV1>();

  async persist(row: DecisionPortfolioProjectionInsertV1): Promise<DecisionPortfolioProjectionPersistResultV1> {
    const existing = this.rows.get(row.portfolio_id);
    if (existing) {
      return {
        status: existing.content_hash === row.content_hash ? "IDEMPOTENT" : "CONFLICTING",
        portfolioId: row.portfolio_id,
        contentHash: existing.content_hash
      };
    }
    this.rows.set(row.portfolio_id, { ...structuredClone(row), persisted_at: row.generated_at });
    return { status: "PERSISTED", portfolioId: row.portfolio_id, contentHash: row.content_hash };
  }

  async findByPortfolioId(portfolioId: string): Promise<DecisionPortfolioProjectionRowV1 | null> {
    const row = this.rows.get(portfolioId);
    return row ? structuredClone(row) : null;
  }

  async listRecent(limit: number): Promise<readonly DecisionPortfolioProjectionRowV1[]> {
    return [...this.rows.values()]
      .sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at))
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  put(row: DecisionPortfolioProjectionRowV1): void {
    this.rows.set(row.portfolio_id, structuredClone(row));
  }
}

test("persists the exact canonical portfolio and treats an exact replay as a no-op", async () => {
  const store = new InMemoryStore();
  const input = portfolio();
  const snapshot = structuredClone(input);

  const first = await appendDecisionPortfolioProjectionV1(store, input, { now: freshNow });
  const replay = await appendDecisionPortfolioProjectionV1(store, input, { now: freshNow });

  assert.equal(first.status, "APPENDED");
  assert.equal(replay.status, "REPLAY_NOOP");
  assert.equal(first.row.content_hash, replay.row.content_hash);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(first.row.payload, input);
  assert.deepEqual(Object.keys(prepareDecisionPortfolioProjectionV1(input, { now: freshNow })).sort(), [
    "content_hash", "contract_version", "evidence_refs", "generated_at", "payload", "policy_version", "portfolio_id", "source_refs"
  ]);
});

test("fails closed when the same portfolio identity is replayed with different content", async () => {
  const store = new InMemoryStore();
  const original = portfolio();
  await appendDecisionPortfolioProjectionV1(store, original, { now: freshNow });

  const changed = structuredClone(original);
  changed.items[0].rationale = "Caller-supplied replacement rationale";

  await assert.rejects(
    appendDecisionPortfolioProjectionV1(store, changed, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "CONFLICTING_IDENTITY"
  );
});

test("refuses selected work without evidence/source lineage or with non-decision-grade evidence", () => {
  const missingLineage = structuredClone(portfolio());
  const selected = missingLineage.items.find((item) => item.disposition === "SELECTED")!;
  selected.candidate.evidenceRefs = [];
  selected.candidate.sourceRefs = [];
  missingLineage.evidenceRefs = missingLineage.items.flatMap((item) => item.candidate.evidenceRefs).filter((value, index, all) => all.indexOf(value) === index).sort();
  missingLineage.sourceRefs = missingLineage.items.flatMap((item) => item.candidate.sourceRefs).filter((value, index, all) => all.indexOf(value) === index).sort();

  assert.throws(
    () => prepareDecisionPortfolioProjectionV1(missingLineage, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "MISSING_LINEAGE"
  );

  const unknown = structuredClone(portfolio());
  unknown.items.find((item) => item.disposition === "SELECTED")!.candidate.evidenceState = "UNKNOWN";
  assert.throws(
    () => prepareDecisionPortfolioProjectionV1(unknown, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "UNSAFE_SELECTED_EVIDENCE"
  );
});

test("refuses approval and owner-queue metadata that disagrees with selected work", () => {
  const approvalMismatch = structuredClone(portfolio());
  approvalMismatch.keeganDecisionIds = [];
  assert.throws(
    () => prepareDecisionPortfolioProjectionV1(approvalMismatch, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "APPROVAL_MISMATCH"
  );

  const ownerMismatch = structuredClone(portfolio());
  ownerMismatch.ownerQueues.JEEVES = [];
  assert.throws(
    () => prepareDecisionPortfolioProjectionV1(ownerMismatch, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "OWNER_QUEUE_MISMATCH"
  );
});

test("loads fresh history as decision-grade and stale history explicitly as non-decision-grade", async () => {
  const store = new InMemoryStore();
  const canonical = portfolio();
  await appendDecisionPortfolioProjectionV1(store, canonical, { now: freshNow });

  const fresh = await loadDecisionPortfolioProjectionHistoryV1(store, { now: freshNow, maxAgeMs: 60 * 60 * 1000 });
  assert.equal(fresh.truthState, "LIVE");
  assert.equal(fresh.decisionGrade, true);
  assert.equal(fresh.latestPortfolio?.portfolioId, canonical.portfolioId);

  const stale = await loadDecisionPortfolioProjectionHistoryV1(store, { now: "2026-09-20T13:05:00.000Z", maxAgeMs: 60 * 60 * 1000 });
  assert.equal(stale.truthState, "STALE");
  assert.equal(stale.decisionGrade, false);
  assert.equal(stale.latestPortfolio?.portfolioId, canonical.portfolioId);
  assert.deepEqual(stale.issues, ["PORTFOLIO_STALE"]);
});

test("returns UNVERIFIED instead of surfacing tampered stored history", async () => {
  const store = new InMemoryStore();
  const canonical = portfolio();
  const prepared = prepareDecisionPortfolioProjectionV1(canonical, { now: freshNow });
  store.put({ ...structuredClone(prepared), content_hash: "0".repeat(64), persisted_at: generatedAt });

  const history = await loadDecisionPortfolioProjectionHistoryV1(store, { now: freshNow, maxAgeMs: 60 * 60 * 1000 });
  assert.equal(history.truthState, "UNVERIFIED");
  assert.equal(history.decisionGrade, false);
  assert.equal(history.latestPortfolio, null);
  assert.ok(history.issues.includes("ROW_PAYLOAD_MISMATCH"));
});

test("fails the whole history closed when any persisted entry has impossible chronology", async () => {
  const store = new InMemoryStore();
  const canonical = portfolio();
  const prepared = prepareDecisionPortfolioProjectionV1(canonical, { now: freshNow });
  store.put({ ...structuredClone(prepared), persisted_at: "2026-09-18T12:59:59.000Z" });

  const history = await loadDecisionPortfolioProjectionHistoryV1(store, { now: freshNow, maxAgeMs: 60 * 60 * 1000 });
  assert.equal(history.truthState, "UNVERIFIED");
  assert.equal(history.decisionGrade, false);
  assert.equal(history.latestPortfolio, null);
  assert.ok(history.issues.includes("INVALID_CHRONOLOGY"));
});

test("rejects future portfolio generation instead of inventing freshness", () => {
  const future = structuredClone(portfolio());
  future.generatedAt = "2026-09-18T14:00:00.000Z";
  assert.throws(
    () => prepareDecisionPortfolioProjectionV1(future, { now: freshNow }),
    (error: unknown) => error instanceof DecisionPortfolioProjectionError && error.code === "FUTURE_PORTFOLIO"
  );
});

test("represents an empty persistence surface as unverified rather than zero or success", async () => {
  const history = await loadDecisionPortfolioProjectionHistoryV1(new InMemoryStore(), { now: freshNow, maxAgeMs: 60 * 60 * 1000 });
  assert.deepEqual(history, {
    truthState: "UNVERIFIED",
    decisionGrade: false,
    latestPortfolio: null,
    entries: [],
    issues: ["NO_PERSISTED_PORTFOLIOS"]
  });
});
