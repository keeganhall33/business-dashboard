import { createPreparedAction } from "@/lib/supabase/queries";
import type { PreparedAction, PreparedActionEvidence, PreparedActionAsset, SocialContentSnapshot } from "@/lib/types/dashboard";

const ACTIVE_STATUSES = new Set(["draft", "ready_for_review", "approved"]);

type Summary = {
  created: number;
  skippedDuplicate: number;
  message?: string;
};

export async function ensurePreparedActionFromSocialSnapshot(
  snapshot: SocialContentSnapshot | null,
  existing: PreparedAction[]
): Promise<Summary> {
  if (!snapshot) {
    return { created: 0, skippedDuplicate: 0, message: "No social snapshot available." };
  }

  const post = pickTopPost(snapshot);
  if (!post) {
    return { created: 0, skippedDuplicate: 0, message: "No qualifying social posts found." };
  }

  const dedupeKey = `lyra:social:${post.postId}`;
  const hasDuplicate = existing.some(
    (action) => action.dedupeKey === dedupeKey && ACTIVE_STATUSES.has(action.status)
  );
  if (hasDuplicate) {
    return { created: 0, skippedDuplicate: 1, message: "Lyra prepared action already staged." };
  }

  const engagementLabel = post.metrics.engagementRate
    ? `${formatPercent(post.metrics.engagementRate)} engagement`
    : "steady engagement";
  const whyItMatters = `Top-performing ${post.format} reached ${formatNumber(post.metrics.reach)} with ${engagementLabel}. Extend the story with a fresh brief while momentum is high.`;

  const evidence: PreparedActionEvidence[] = [
    { label: "Hook", value: post.hook || post.caption.slice(0, 80) },
    {
      label: "Metrics",
      value: [
        `${formatNumber(post.metrics.reach)} reach`,
        `${formatNumber(post.metrics.likes)} likes`,
        `${formatNumber(post.metrics.comments)} comments`,
        `${formatNumber(post.metrics.shares)} shares`
      ].join(" · ")
    }
  ];
  if (post.permalink) {
    evidence.push({ label: "Permalink", value: post.permalink });
  }

  const asset: PreparedActionAsset = {
    label: "Content brief",
    value: [
      `Format: ${post.format}`,
      `Hook: ${post.hook || "DreamBIG follow-up"}`,
      `Angle: Highlight Obama Library permanent collection placement + behind-the-scenes detail.`,
      `CTA: Invite collectors to reserve the next limited drop or museum prints.`
    ].join("\n")
  };

  await createPreparedAction({
    title: `Stage ${post.subject || "DreamBIG"} content drop`,
    category: "product",
    sourcePanel: "social_content",
    sourceSnapshotAt: snapshot.generatedAt ?? null,
    sourceUrl: post.permalink ?? null,
    dedupeKey,
    whyItMatters,
    evidence,
    preparedAsset: [asset],
    riskLevel: "medium",
    confidence: post.metrics.engagementRate && post.metrics.engagementRate > 0.08 ? "high" : "medium",
    dataLight: false,
    requiredApprovalAction: "Approve Lyra's social content brief so the team can stage it manually.",
    createdByAgent: "lyra"
  });

  return { created: 1, skippedDuplicate: 0 };
}

function pickTopPost(snapshot: SocialContentSnapshot) {
  const posts = snapshot.posts ?? [];
  if (!posts.length) return null;
  return posts
    .map((post) => ({
      post,
      engagement: interactionScore(post.metrics)
    }))
    .sort((a, b) => b.engagement - a.engagement)[0]?.post;
}

function interactionScore(metrics: SocialContentSnapshot["posts"][number]["metrics"]) {
  return (
    (metrics.likes ?? 0) +
    (metrics.comments ?? 0) +
    (metrics.shares ?? 0) +
    (metrics.saves ?? 0)
  );
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "0";
  return value.toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}
