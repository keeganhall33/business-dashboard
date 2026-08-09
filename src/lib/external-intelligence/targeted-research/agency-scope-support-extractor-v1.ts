import { normalizeExcerptTextV1 } from "@/lib/external-intelligence/targeted-research/support-excerpts-v1";

function stripHtmlToTextV1(html: string): string {
  // Minimal, deterministic tag stripping (no DOM deps).
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceSplitV1(text: string): string[] {
  // Conservative sentence split.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractAgencyScopeSupportExcerptsFromHtmlV1(input: { html: string }): {
  content_and_channel: string | null;
  campaign_delivery: string | null;
  campaign_planning_execution: string | null;
} {
  const text = stripHtmlToTextV1(input.html);
  const sentences = sentenceSplitV1(text);

  const find = (re: RegExp) => {
    const hit = sentences.find((s) => re.test(s));
    return hit ? normalizeExcerptTextV1(hit) : null;
  };

  return {
    content_and_channel: find(/content\s+and\s+channel\s+strategy/i),
    campaign_delivery: find(/campaign\s+delivery/i),
    campaign_planning_execution: find(/campaign\s+planning\s+and\s+execution/i)
  };
}
