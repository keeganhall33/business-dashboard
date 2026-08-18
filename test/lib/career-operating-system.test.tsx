import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_ACTIONS,
  buildCareerOperatingSystem,
  type CareerOutcomeRow
} from "@/lib/career/career-operating-system";

test("starts in Foundation Transition with one move per active lane", () => {
  const snapshot = buildCareerOperatingSystem([], "2026-08-18T12:00:00.000Z");
  assert.equal(snapshot.currentPhase.number, 1);
  assert.equal(snapshot.currentPhase.title, "Foundation Transition");
  assert.equal(snapshot.phaseCompletionPercent, 0);
  assert.equal(snapshot.todayMoves.length, 5);
  assert.deepEqual(snapshot.todayMoves.map((move) => move.lane), [
    "REVENUE",
    "RELATIONSHIP",
    "AUDIENCE",
    "CAREER",
    "OWNED_FUTURE"
  ]);
});

test("executed delayed actions move to Awaiting Results while the next move advances", () => {
  const rows: CareerOutcomeRow[] = [
    feedback("p1-audience-heartbeat", "DONE_WAITING", "UNKNOWN", "2026-08-18T12:00:00.000Z", "2026-08-25T12:00:00.000Z")
  ];
  const snapshot = buildCareerOperatingSystem(rows, "2026-08-18T12:05:00.000Z");
  assert.equal(snapshot.awaitingResults.length, 1);
  assert.equal(snapshot.awaitingResults[0].id, "p1-audience-heartbeat");
  assert.equal(snapshot.todayMoves.find((move) => move.lane === "AUDIENCE")?.id, "p1-audience-content-system");
});

test("negative outcomes reopen the move for adjustment", () => {
  const rows: CareerOutcomeRow[] = [
    feedback("p1-revenue-collector-test", "DONE_RESULT", "NEGATIVE", "2026-08-30T12:00:00.000Z")
  ];
  const prerequisite = feedback("p1-revenue-collector-positioning", "DONE_RESULT", "NEUTRAL", "2026-08-18T12:00:00.000Z");
  const snapshot = buildCareerOperatingSystem([prerequisite, ...rows], "2026-08-30T12:05:00.000Z");
  const revenue = snapshot.todayMoves.find((move) => move.lane === "REVENUE");
  assert.equal(revenue?.id, "p1-revenue-collector-test");
  assert.equal(revenue?.status, "ADJUST");
});

test("phase advances only when all phase gates are satisfied", () => {
  const phaseOne = CAREER_ACTIONS.filter((action) => action.phaseId === "foundation-transition");
  const rows = phaseOne.map((action, index) =>
    feedback(action.id, "DONE_RESULT", "POSITIVE", `2026-08-${String(18 + index).padStart(2, "0")}T12:00:00.000Z`)
  );
  const snapshot = buildCareerOperatingSystem(rows, "2026-09-01T12:00:00.000Z");
  assert.equal(snapshot.currentPhase.number, 2);
  assert.equal(snapshot.phaseRoadmap[0].state, "COMPLETE");
  assert.equal(snapshot.phaseRoadmap[1].state, "CURRENT");
});

function feedback(
  actionId: string,
  state: "DONE_WAITING" | "DONE_RESULT" | "BLOCKED" | "SKIPPED",
  result: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNKNOWN",
  happenedAt: string,
  followUpAt: string | null = null
): CareerOutcomeRow {
  const action = CAREER_ACTIONS.find((item) => item.id === actionId);
  assert.ok(action);
  return {
    happened_at: happenedAt,
    metadata: {
      source: "career_os_v1",
      actionId,
      phaseId: action.phaseId,
      lane: action.lane,
      state,
      result,
      followUpAt,
      userNote: null
    }
  };
}
