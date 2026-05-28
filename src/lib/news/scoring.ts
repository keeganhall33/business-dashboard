import type { FeedItem } from "@/lib/news/rss";

export type ScoredItem = FeedItem & {
  score: number;
  scoreSignals: string[];
};

const KEYWORD_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /partnership|partner(s|ed|ing)?/i, weight: 10, label: "partnership" },
  { pattern: /collab(oration)?/i, weight: 10, label: "collab" },
  { pattern: /sponsor(ship|ed)?|sponsoring/i, weight: 9, label: "sponsorship" },
  { pattern: /brand deal|deal\b|rights deal|licens(e|ing)/i, weight: 8, label: "deal/licensing" },
  { pattern: /launch(es|ed)?|drops?\b|collection\b/i, weight: 6, label: "launch/drop" },
  { pattern: /tour\b|festival\b|album\b|single\b/i, weight: 6, label: "music moment" },
  { pattern: /athlete\b|player\b|nba\b|wnba\b|nfl\b|mlb\b|nhl\b|olympic/i, weight: 6, label: "sports" },
  { pattern: /creator\b|influencer\b|stream(er|ing)\b|youtuber/i, weight: 5, label: "creator" },
  { pattern: /series\b|film\b|tv\b|documentary\b|streaming\b/i, weight: 5, label: "film/tv" },
  { pattern: /luxury\b|fashion\b|sneaker\b|streetwear\b/i, weight: 5, label: "fashion" },
  { pattern: /acquire(s|d)?|acquisition\b|merger\b|raises?\b|funding\b|valuation\b|ipo\b/i, weight: 6, label: "corp finance" },
  { pattern: /exclusive\b|first look\b|reveal\b/i, weight: 3, label: "exclusive" }
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function safeText(item: FeedItem) {
  return `${item.title}\n${item.summary ?? ""}`;
}

export function scoreFeedItem(item: FeedItem): ScoredItem {
  const text = safeText(item);

  let score = 10; // baseline: has some chance of relevance
  const signals: string[] = [];

  for (const signal of KEYWORD_SIGNALS) {
    if (signal.pattern.test(text)) {
      score += signal.weight;
      signals.push(signal.label);
    }
  }

  // Prefer recent content when publishedAt is present.
  if (item.publishedAt) {
    const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
    if (Number.isFinite(ageHours)) {
      if (ageHours <= 12) score += 10;
      else if (ageHours <= 24) score += 6;
      else if (ageHours <= 48) score += 2;
      else score -= Math.min(8, Math.floor(ageHours / 24));
    }
  }

  // Cap and return.
  return {
    ...item,
    score: clampScore(score),
    scoreSignals: signals
  };
}
