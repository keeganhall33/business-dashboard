import crypto from "node:crypto";

export function computeRecommendationFingerprint(input: {
  category: string;
  channel: string;
  affected_products: string[];
  affected_audiences: string[];
  action_key: string; // stable key derived from recommendation type
  evidence_window: { startDate: string; endDate: string };
}): string {
  const normalized = {
    category: input.category,
    channel: input.channel,
    affected_products: [...input.affected_products].sort(),
    affected_audiences: [...input.affected_audiences].sort(),
    action_key: input.action_key,
    evidence_window: input.evidence_window
  };
  const bytes = Buffer.from(JSON.stringify(normalized));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
