import test from "node:test";
import assert from "node:assert/strict";

import type { ConfidenceSummary, ConfidenceEntry } from "../src/lib/data-confidence.ts";
import { buildCoverageIssues } from "../src/lib/data-confidence/coverage.ts";

const baseEntry: ConfidenceEntry = {
  id: "woo",
  label: "Woo",
  state: "unavailable",
  freshnessHours: null,
  coverage: "Unknown",
  completeness: "Unknown",
  provenance: "",
  lastSuccess: null,
  lastVerified: null,
  warningCodes: [],
  confidenceScore: 0,
  executiveImpact: "",
  decisionImpact: ""
};

const baseSummary: ConfidenceSummary = {
  entries: [baseEntry],
  partialDay: false,
  overall: { label: "Normal", tone: "emerald", rationale: "", state: "mixed", lastRefresh: null },
  trustedSources: [],
  caveatSources: [],
  insufficientSources: [],
  conflictingSources: [],
  topRisk: null,
  decisionsAffected: [],
  recommendedActions: []
};

test("buildCoverageIssues highlights unavailable sources", () => {
  const issues = buildCoverageIssues(baseSummary);
  assert.ok(issues.some((issue) => issue.label.includes("Unavailable")));
});

test("buildCoverageIssues surfaces range mismatches and partial days", () => {
  const entry: ConfidenceEntry = { ...baseEntry, id: "ga4", label: "GA4", state: "trusted", warningCodes: ["Range mismatch"] };
  const summary: ConfidenceSummary = { ...baseSummary, entries: [entry], partialDay: true };
  const issues = buildCoverageIssues(summary);
  assert.ok(issues.some((issue) => issue.label.includes("Range mismatch")));
  assert.ok(issues.some((issue) => issue.label.includes("Partial day")));
});
