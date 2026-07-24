import type { MarketingCommandProductMomentum } from "@/lib/types/dashboard";

export type PromoteProtectCardType =
  | "promote_now"
  | "protect_revenue"
  | "cooling_off"
  | "emerging_opportunity"
  | "email_hero"
  | "website_hero"
  | "paid_ad_candidate"
  | "partnership_candidate"
  | "collector_outreach_candidate";

export type PromoteProtectCard = {
  id: string;
  type: PromoteProtectCardType;
  productName?: string | null;
  headline: string;
  reason: string;
  recommendedChannel?: string | null;
  nextAction?: string | null;
  metricLabel?: string | null;
  metricValue?: string | null;
  confidence: "high" | "medium" | "low";
  isEmpty?: boolean;
};

const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, signDisplay: "always" });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatPercent(value?: number | null) {
  if (value == null) return null;
  return percent.format(value);
}

function formatCurrency(value?: number | null) {
  if (value == null) return null;
  return currency.format(value);
}

function buildEmptyCard(type: PromoteProtectCardType, reason: string): PromoteProtectCard {
  return {
    id: `empty-${type}`,
    type,
    headline: friendlyTypeLabel(type),
    reason,
    confidence: "low",
    isEmpty: true
  };
}

function friendlyTypeLabel(type: PromoteProtectCardType) {
  switch (type) {
    case "promote_now":
      return "Promote now";
    case "protect_revenue":
      return "Protect revenue";
    case "cooling_off":
      return "Cooling off";
    case "emerging_opportunity":
      return "Emerging opportunity";
    case "email_hero":
      return "Email hero";
    case "website_hero":
      return "Website hero";
    case "paid_ad_candidate":
      return "Paid ad candidate";
    case "partnership_candidate":
      return "Partnership candidate";
    case "collector_outreach_candidate":
      return "Collector outreach";
    default:
      return type;
  }
}

type TopProductSummary = { name?: string | null; revenue?: number | null; units?: number | null; orderCount?: number | null };

export function buildPromoteProtectCards(options: {
  momentum?: MarketingCommandProductMomentum | null;
  topProducts?: TopProductSummary[] | null;
}) {
  const { momentum, topProducts } = options;
  const winners = momentum?.winners ?? [];
  const laggards = momentum?.laggards ?? [];
  const breakouts = momentum?.newBreakouts ?? [];
  const revenueProducts = topProducts ?? [];
  const cards: PromoteProtectCard[] = [];

  const promoteWinner = winners[0];
  if (promoteWinner) {
    cards.push({
      id: `promote-${promoteWinner.name ?? promoteWinner.productId ?? "winner"}`,
      type: "promote_now",
      productName: promoteWinner.name ?? "Top performer",
      headline: "Feature immediately",
      reason: `${promoteWinner.name ?? "This piece"} is up ${formatPercent(promoteWinner.revenueDeltaPercent) ?? "strong"} vs last window.`,
      recommendedChannel: "Email + site hero",
      nextAction: "Slot into the next campaign and homepage hero block.",
      metricLabel: "Δ Revenue",
      metricValue: formatPercent(promoteWinner.revenueDeltaPercent) ?? formatCurrency(promoteWinner.revenueDelta),
      confidence: "high"
    });
  } else {
    cards.push(buildEmptyCard("promote_now", "No surging artwork detected."));
  }

  if (momentum?.concentration?.topProduct && momentum.concentration.sharePercent != null) {
    cards.push({
      id: `protect-${momentum.concentration.topProduct}`,
      type: "protect_revenue",
      productName: momentum.concentration.topProduct,
      headline: "Protect revenue leader",
      reason: `${momentum.concentration.topProduct} = ${momentum.concentration.sharePercent.toFixed(1)}% of Woo revenue.`,
      recommendedChannel: "Quality control",
      nextAction: "Keep quality checks tight + prep backup hero.",
      metricLabel: "Revenue share",
      metricValue: `${momentum.concentration.sharePercent.toFixed(1)}%`,
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("protect_revenue", "No single piece is dominating revenue."));
  }

  const laggard = laggards[0];
  if (laggard) {
    cards.push({
      id: `cooling-${laggard.name ?? laggard.productId ?? "laggard"}`,
      type: "cooling_off",
      productName: laggard.name,
      headline: "Cooling – refresh story",
      reason: `${laggard.name ?? "This piece"} fell ${formatPercent(laggard.revenueDeltaPercent) ?? formatCurrency(laggard.revenueDelta)} vs last week.`,
      recommendedChannel: "Story refresh",
      nextAction: "Share a behind-the-scenes or collector feature.",
      metricLabel: "Δ Revenue",
      metricValue: formatPercent(laggard.revenueDeltaPercent) ?? formatCurrency(laggard.revenueDelta),
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("cooling_off", "No cooling products in the current window."));
  }

  const breakout = breakouts[0];
  if (breakout) {
    cards.push({
      id: `emerging-${breakout.name ?? breakout.productId ?? "breakout"}`,
      type: "emerging_opportunity",
      productName: breakout.name,
      headline: "Emerging opportunity",
      reason: `${breakout.name ?? "This piece"} just spiked—capitalize while momentum is fresh.`,
      recommendedChannel: "Social drop",
      nextAction: "Tease sketches + push to waitlist.",
      metricLabel: "Δ Revenue",
      metricValue: formatPercent(breakout.revenueDeltaPercent) ?? formatCurrency(breakout.revenueDelta),
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("emerging_opportunity", "No breakout data this week."));
  }

  const emailHeroMomentum = winners[1];
  if (emailHeroMomentum) {
    cards.push({
      id: `email-${emailHeroMomentum.productId ?? emailHeroMomentum.name ?? "hero"}`,
      type: "email_hero",
      productName: emailHeroMomentum.name ?? "High-interest piece",
      headline: "Email hero candidate",
      reason: "Consistent buyer interest + strong open-rate potential.",
      recommendedChannel: "Email hero",
      nextAction: "Build the next newsletter around this piece.",
      metricLabel: "Units",
      metricValue: emailHeroMomentum.orderCount != null ? `${emailHeroMomentum.orderCount} orders` : null,
      confidence: "medium"
    });
  } else if (revenueProducts[0]) {
    const fallback = revenueProducts[0];
    cards.push({
      id: `email-${fallback.name ?? "hero"}`,
      type: "email_hero",
      productName: fallback.name ?? "High-interest piece",
      headline: "Email hero candidate",
      reason: "Woo revenue shows steady demand—feature it to keep energy high.",
      recommendedChannel: "Email hero",
      nextAction: "Center the next send on this product.",
      metricLabel: fallback.orderCount != null ? "Orders" : fallback.units != null ? "Units" : undefined,
      metricValue: fallback.orderCount != null ? `${fallback.orderCount} orders` : fallback.units != null ? `${fallback.units} units` : undefined,
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("email_hero", "Need fresh Woo revenue data for email hero."));
  }

  const websiteHero = revenueProducts[1];
  if (websiteHero) {
    const websiteHeroRevenue = (websiteHero as { revenue?: number | null }).revenue ?? null;
    cards.push({
      id: `site-${websiteHero.name ?? "site"}`,
      type: "website_hero",
      productName: websiteHero.name,
      headline: "Website hero refresh",
      reason: `${websiteHero.name ?? "This piece"} is the next-best seller—swap it onto the homepage hero.`,
      recommendedChannel: "Homepage",
      nextAction: "Update hero module + CTA.",
      metricLabel: "Revenue",
      metricValue: formatCurrency(websiteHeroRevenue),
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("website_hero", "Homepage hero awaiting new data."));
  }

  const paidCandidate = winners.find((item) => (item.orderCount ?? 0) >= 2) ?? breakouts[1];
  if (paidCandidate) {
    cards.push({
      id: `paid-${paidCandidate.name ?? paidCandidate.productId ?? "paid"}`,
      type: "paid_ad_candidate",
      productName: paidCandidate.name,
      headline: "Low-risk paid test",
      reason: "Momentum + proven conversion window makes it safe for a small spend test.",
      recommendedChannel: "Meta prospecting",
      nextAction: "Spin up fresh creative and cap spend.",
      metricLabel: "Orders",
      metricValue: paidCandidate.orderCount != null ? `${paidCandidate.orderCount} orders` : undefined,
      confidence: "medium"
    });
  } else {
    cards.push(buildEmptyCard("paid_ad_candidate", "Hold paid tests until a winner sustains demand."));
  }

  const partnershipCandidate = breakouts[2] ?? winners.find((item) => (item.revenueDeltaPercent ?? 0) > 50);
  if (partnershipCandidate) {
    cards.push({
      id: `partner-${partnershipCandidate.name ?? partnershipCandidate.productId ?? "partner"}`,
      type: "partnership_candidate",
      productName: partnershipCandidate.name,
      headline: "Partnership-ready storyline",
      reason: `${partnershipCandidate.name ?? "This piece"} aligns with current cultural moment—package for brand conversations.`,
      recommendedChannel: "Partnership deck",
      nextAction: "Add to next partner outreach deck.",
      metricLabel: "Δ Units",
      metricValue: partnershipCandidate.unitsDeltaPercent != null
        ? percent.format(partnershipCandidate.unitsDeltaPercent)
        : partnershipCandidate.unitsDelta != null
          ? `${partnershipCandidate.unitsDelta} units`
          : undefined,
      confidence: "low"
    });
  } else {
    cards.push(buildEmptyCard("partnership_candidate", "Awaiting a culturally-aligned spike before pitching."));
  }

  cards.push({
    id: "collector-outreach",
    type: "collector_outreach_candidate",
    productName: promoteWinner?.name ?? revenueProducts[0]?.name ?? null,
    headline: "Collector touchpoint",
    reason:
      promoteWinner?.name
        ? `${promoteWinner.name} buyers are active—follow up with top collectors.`
        : "Need fresher collector telemetry before targeting outreach.",
    recommendedChannel: "Personal outreach",
    nextAction: promoteWinner ? "Send a personal update or preview sketch." : "Refresh collector import before planning outreach.",
    metricLabel: promoteWinner ? "Orders" : null,
    metricValue: promoteWinner?.orderCount != null ? `${promoteWinner.orderCount} orders` : null,
    confidence: promoteWinner ? "medium" : "low",
    isEmpty: !promoteWinner
  });

  return cards;
}
