import type { ContentIdea } from "@/lib/dashboard/content-ideas";
import type { MarketingCommandSnapshot, PreparedAction } from "@/lib/types/dashboard";
import { createPreparedAction } from "@/lib/supabase/queries";

export type PreparedActionGenerationSummary = {
  created: number;
  skippedDuplicate: number;
  skippedUnsupported: number;
};

export async function ensurePreparedActionsFromContentIdeas(
  ideas: ContentIdea[],
  snapshot: MarketingCommandSnapshot,
  existingActions: PreparedAction[],
  limit = 2
): Promise<PreparedActionGenerationSummary> {
  const summary: PreparedActionGenerationSummary = { created: 0, skippedDuplicate: 0, skippedUnsupported: 0 };
  const activeKeys = new Set(existingActions.map((action) => action.dedupeKey).filter((key): key is string => Boolean(key)));
  const actionableIdeas = ideas.slice(0, limit);

  for (const idea of actionableIdeas) {
    const key = `content_idea:${idea.id}`;
    if (activeKeys.has(key)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    await createPreparedAction({
      title: `Draft content: ${idea.title}`,
      category: "product",
      sourcePanel: "content_intelligence",
      sourceInsightId: idea.id,
      sourceSnapshotAt: snapshot.generatedAt,
      dedupeKey: key,
      createdByAgent: "marketing_command",
      whyItMatters: idea.whyNow,
      evidence: idea.formatHints.slice(0, 2).map((hint) => ({ label: "Format", value: hint })),
      preparedAsset: [{ label: "Pitch", value: idea.pitch }],
      estimatedImpact: "Increase demand + engagement",
      riskLevel: idea.urgency === "high" ? "high" : "medium",
      confidence: idea.dataLight ? "low" : "medium",
      dataLight: idea.dataLight,
      requiredApprovalAction: "Approve draft + channel plan"
    });
    summary.created += 1;
    activeKeys.add(key);
  }

  summary.skippedUnsupported += Math.max(0, ideas.length - actionableIdeas.length);
  return summary;
}
