import type { MarketingCommandSnapshot, MarketingCommandInsight, MarketingCommandProductMomentum } from "@/lib/types/dashboard";

export type ContentIdea = {
  id: string;
  title: string;
  pitch: string;
  formatHints: string[];
  whyNow: string;
  channels: string[];
  urgency: "high" | "medium" | "low";
  dataLight: boolean;
};

export function buildContentIdeas(snapshot: MarketingCommandSnapshot | null, limit = 4): ContentIdea[] {
  if (!snapshot) return [];

  const ideas: ContentIdea[] = [];
  const insightMap = new Map((snapshot.topConnectedInsights ?? []).map((insight) => [insight.id, insight]));
  const momentum = snapshot.productMomentum ?? null;

  const addIdea = (idea: ContentIdea | null | undefined) => {
    if (!idea) return;
    if (ideas.find((existing) => existing.id === idea.id)) return;
    ideas.push(idea);
  };

  addIdea(buildMomentumIdea(momentum));
  addIdea(buildConcentrationIdea(insightMap.get("product_revenue_concentration")));
  addIdea(buildCheckoutTrustIdea(insightMap.get("cart_checkout_drop")));
  addIdea(buildMetaCreativeIdea(insightMap.get("meta_low_volume") ?? insightMap.get("meta_single_campaign")));

  return ideas.slice(0, limit);
}

function buildMomentumIdea(momentum: MarketingCommandProductMomentum | null): ContentIdea | null {
  const winner = momentum?.winners?.[0];
  if (!winner?.name) return null;
  return {
    id: `content:momentum:${slugify(winner.name)}`,
    title: `Hero drop: ${winner.name}`,
    pitch: `${winner.name} revenue is spiking — capture the surge with a behind-the-scenes story and collector proof.`,
    formatHints: ["IG Reel", "Email hero block", "Paid retargeting clip"],
    whyNow: `Revenue up ${formatPercent(winner.revenueDeltaPercent)} vs prior window.`,
    channels: ["Instagram", "Email", "Paid social"],
    urgency: "high",
    dataLight: (winner.orderCount ?? 0) < 3
  };
}

function buildConcentrationIdea(insight: MarketingCommandInsight | undefined): ContentIdea | null {
  if (!insight?.triggerMetrics) return null;
  const product = typeof insight.triggerMetrics.topProduct === "string" ? insight.triggerMetrics.topProduct : null;
  const share = typeof insight.triggerMetrics.concentration === "number" ? insight.triggerMetrics.concentration : null;
  if (!product || share == null) return null;
  return {
    id: `content:backup:${slugify(product)}`,
    title: `Backup hero: ${product}`,
    pitch: `Share the story behind ${product}'s rise and tease the next collector piece to balance revenue.`,
    formatHints: ["Carousel", "Blog post", "Long-form caption"],
    whyNow: `${product} controls ${formatPercent(share)} of Woo revenue.`,
    channels: ["Instagram", "Blog", "Collectors email"],
    urgency: share >= 80 ? "high" : "medium",
    dataLight: false
  };
}

function buildCheckoutTrustIdea(insight: MarketingCommandInsight | undefined): ContentIdea | null {
  if (!insight) return null;
  const addToCart = toNumber(insight.triggerMetrics?.addToCart);
  const beginCheckout = toNumber(insight.triggerMetrics?.beginCheckout);
  if (addToCart == null || beginCheckout == null) return null;
  const retention = beginCheckout && addToCart ? (beginCheckout / addToCart) * 100 : null;
  return {
    id: "content:checkout-trust",
    title: "Checkout trust blitz",
    pitch: "Create quick reels/posts showing packaging, shipping speed, and collector testimonials to rebuild checkout confidence.",
    formatHints: ["Testimonial reel", "Story series", "FAQ email"],
    whyNow: `Checkout retention is ${formatPercent(retention ?? 0)}% (${beginCheckout} / ${addToCart}).`,
    channels: ["Instagram Stories", "Email", "Site banner"],
    urgency: "high",
    dataLight: beginCheckout < 10
  };
}

function buildMetaCreativeIdea(insight: MarketingCommandInsight | undefined): ContentIdea | null {
  if (!insight) return null;
  return {
    id: `content:meta-refresh:${slugify(insight.id)}`,
    title: "Meta creative refresh",
    pitch: "Film a fast time-lapse or collector reaction to use as a new hook for the top Meta campaign.",
    formatHints: ["Time-lapse", "Collector quote graphic", "30s vertical ad"],
    whyNow: insight.insight ?? "Meta spend is too thin to scale until creative resets.",
    channels: ["Paid social", "Organic social"],
    urgency: "medium",
    dataLight: true
  };
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "n/a";
  return `${value.toFixed(1)}%`;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
