/**
 * Relationship Intelligence V1 Contracts
 *
 * Defines fixtures/view-models for strategic target relationship analysis:
 * - TARGET, DECISION_MAKER, CHAMPION_CANDIDATES, RELATIONSHIP_EVIDENCE
 * - ACCESS_PATH, STRATEGIC_UPSIDE, MUTUAL_VALUE, RELATIONSHIP_RISK
 * - TIMING, UNKNOWN_GAPS, NEXT_SAFE_ACTION, APPROVAL_CLASS, WHAT_WOULD_CHANGE_THE_RANKING
 *
 * Champion ladder ordering preserves evidence and confidence dimensions rather than opaque scores.
 */

export * from "./contracts";
export * from "./fixtures";
export * from "./types";
export * from "./next-best-move/adapter";
export * from "./next-best-move/contracts";
export * from "./next-best-move/fixtures";
