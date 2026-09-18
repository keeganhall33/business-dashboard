import "@/lib/server-only";

import {
  buildAutonomousGrowthBriefingV1,
  type AutonomousGrowthBriefingV1,
} from "@/lib/executive-home/autonomous-growth-briefing-v1";
import { compareDecisionPortfoliosV1 } from "@/lib/strategy-engine/decision-portfolio-change-v1";
import {
  loadLiveDecisionPortfolioProjectionHistoryV1,
  type DecisionPortfolioProjectionHistoryV1,
} from "@/lib/strategy-engine/decision-portfolio-loader-v1";

export const AUTONOMOUS_GROWTH_LIVE_BRIEFING_VERSION_V1 =
  "AUTONOMOUS_GROWTH_LIVE_BRIEFING_V1" as const;

export type AutonomousGrowthHistoryLoaderV1 = (options: {
  now: string;
  maxAgeMs: number;
  limit?: number;
}) => Promise<DecisionPortfolioProjectionHistoryV1>;

export type LoadAutonomousGrowthLiveBriefingInputV1 = Readonly<{
  now: string;
  /**
   * Required caller-owned freshness policy. There is intentionally no default:
   * the executive surface must not silently decide how old strategy truth may be.
   */
  maxAgeMs: number;
  historyLimit?: number;
  loadHistory?: AutonomousGrowthHistoryLoaderV1;
}>;

function unavailable(issue: string): AutonomousGrowthBriefingV1 {
  return buildAutonomousGrowthBriefingV1({
    history: {
      truthState: "UNVERIFIED",
      decisionGrade: false,
      latestPortfolio: null,
      entries: [],
      issues: [issue],
    },
  });
}

function validEvaluationPolicy(input: LoadAutonomousGrowthLiveBriefingInputV1): boolean {
  return (
    typeof input.now === "string" &&
    input.now.trim().length > 0 &&
    Number.isFinite(Date.parse(input.now)) &&
    Number.isFinite(input.maxAgeMs) &&
    input.maxAgeMs >= 0 &&
    (input.historyLimit == null ||
      (Number.isInteger(input.historyLimit) && input.historyLimit >= 1 && input.historyLimit <= 100))
  );
}

/**
 * Loads the canonical persisted DecisionPortfolioV1 projection and converts it
 * into the already-governed chief-of-staff briefing contract.
 *
 * This is intentionally a read-only bridge. It does not create a portfolio,
 * infer missing evidence, start delegated work, mutate allocation, or authorize
 * any external action. A load/integrity/freshness failure returns an unavailable
 * briefing rather than falling back to fixture or remembered strategy state.
 */
export async function loadAutonomousGrowthLiveBriefingV1(
  input: LoadAutonomousGrowthLiveBriefingInputV1,
): Promise<AutonomousGrowthBriefingV1> {
  if (!validEvaluationPolicy(input)) {
    return unavailable("AUTONOMOUS_GROWTH_INVALID_LIVE_POLICY");
  }

  const loadHistory = input.loadHistory ?? loadLiveDecisionPortfolioProjectionHistoryV1;
  let history: DecisionPortfolioProjectionHistoryV1;

  try {
    history = await loadHistory({
      now: input.now,
      maxAgeMs: input.maxAgeMs,
      limit: input.historyLimit,
    });
  } catch {
    return unavailable("DECISION_PORTFOLIO_LIVE_LOAD_FAILED");
  }

  if (
    history.truthState === "LIVE" &&
    history.decisionGrade &&
    history.latestPortfolio &&
    history.entries.length > 0
  ) {
    const head = history.entries[0];
    if (
      !head.portfolio ||
      head.portfolio.portfolioId !== history.latestPortfolio.portfolioId ||
      head.truthState !== "LIVE" ||
      !head.decisionGrade
    ) {
      return unavailable("DECISION_PORTFOLIO_HISTORY_HEAD_MISMATCH");
    }
  }

  let change = null;
  if (history.truthState === "LIVE" && history.decisionGrade && history.latestPortfolio) {
    const current = history.latestPortfolio;
    const previous = history.entries.find(
      (entry) => entry.portfolio != null && entry.portfolio.portfolioId !== current.portfolioId,
    )?.portfolio;

    if (previous) {
      try {
        change = compareDecisionPortfoliosV1({
          previous,
          current,
          comparedAt: input.now,
        });
      } catch {
        // Historical comparison is additive context, never a prerequisite for
        // current portfolio truth. Withhold the delta rather than inventing one.
        change = null;
      }
    }
  }

  return buildAutonomousGrowthBriefingV1({ history, change });
}
