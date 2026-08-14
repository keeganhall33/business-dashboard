import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import type { ExternalSourceUniverseEntryV1 } from "@/lib/external-intelligence/source-tier/source-tier-registry";

import {
  RETRIEVAL_INTENT_VERSION_V1,
  RETRIEVAL_PLAN_VERSION_V1,
  type RetrievalIntentV1,
  type RetrievalPlanV1
} from "./retrieval-plan.contract";

export type SelectedSourceForPlanningV1 = Pick<
  ExternalSourceUniverseEntryV1,
  "source_id" | "tier" | "availability" | "freshness"
> & {
  // Preserve selected source ids/order exactly; caller supplies the ordered selection.
  selected: boolean;
};

function normalizeReasonTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => String(t).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/**
 * Deterministic metadata-only bridge:
 * Ordered source selection → RetrievalPlanV1 intents.
 *
 * Does not fetch anything.
 * Does not reorder sources.
 */
export function buildRetrievalPlanFromSourceSelectionV1(input: {
  planned_at: string;
  selected_sources: SelectedSourceForPlanningV1[];
}): RetrievalPlanV1 {
  const intents: RetrievalIntentV1[] = [];

  for (const s of input.selected_sources) {
    const base = {
      v: RETRIEVAL_INTENT_VERSION_V1,
      source_id: s.source_id,
      tier: s.tier,
      availability: s.availability,
      freshness: s.freshness,
      access_mode: "READ_ONLY" as const
    };

    // Explicitly surface gaps / unavailability; do not fabricate.
    if (s.tier.kind === "SOURCE_COVERAGE_GAP") {
      intents.push(
        deepFreeze({
          ...base,
          status: "SOURCE_COVERAGE_GAP" as const,
          expected_evidence_type: "unknown",
          freshness_expectation: "unknown",
          reason_tags: normalizeReasonTags(["SOURCE_COVERAGE_GAP", ...s.tier.missing])
        })
      );
      continue;
    }

    if (s.availability === "unavailable") {
      intents.push(
        deepFreeze({
          ...base,
          status: "SKIP_UNAVAILABLE" as const,
          expected_evidence_type: "unknown",
          freshness_expectation: "unknown",
          reason_tags: normalizeReasonTags(["SKIP_UNAVAILABLE"])
        })
      );
      continue;
    }

    if (!s.selected) {
      // Not selected for this run; represent planned intents only for selected=true.
      continue;
    }

    const freshness_expectation = s.freshness?.freshness_threshold ?? "unknown";

    intents.push(
      deepFreeze({
        ...base,
        status: "PLANNED" as const,
        expected_evidence_type: "external_signal",
        freshness_expectation,
        reason_tags: normalizeReasonTags([
          `tier:${s.tier.tier}`,
          `availability:${s.availability}`,
          s.freshness ? `cadence:${s.freshness.expected_cadence}` : "freshness:unknown"
        ])
      })
    );
  }

  return deepFreeze({
    v: RETRIEVAL_PLAN_VERSION_V1,
    planned_at: input.planned_at,
    intents
  });
}
