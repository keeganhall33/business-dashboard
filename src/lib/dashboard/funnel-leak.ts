import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export type FunnelLeakInsight = {
  hasData: boolean;
  stageLabel?: string;
  dropPercent?: number;
  detail?: string;
  recommendation?: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  missingReason?: string;
};

const stages = [
  { key: "sessions", label: "Sessions", extractor: (snapshot?: WebsiteConversionSnapshot | null) => snapshot?.ga4?.sessions ?? null },
  { key: "view_item", label: "Product views", extractor: (snapshot?: WebsiteConversionSnapshot | null) => snapshot?.ga4?.viewItemEvents ?? null },
  { key: "add_to_cart", label: "Add to cart", extractor: (snapshot?: WebsiteConversionSnapshot | null) => snapshot?.ga4?.addToCartEvents ?? null },
  { key: "begin_checkout", label: "Begin checkout", extractor: (snapshot?: WebsiteConversionSnapshot | null) => snapshot?.ga4?.beginCheckoutEvents ?? null },
  { key: "purchase", label: "Purchase", extractor: (snapshot?: WebsiteConversionSnapshot | null) => snapshot?.ga4?.ecommercePurchases ?? snapshot?.wooCommerce?.orderCount ?? null }
];

export function buildFunnelLeakInsight(snapshot?: WebsiteConversionSnapshot | null): FunnelLeakInsight {
  if (!snapshot) {
    return {
      hasData: false,
      confidence: "low",
      evidence: [],
      missingReason: "Need GA4 + Woo snapshot. Run `pnpm website:run`."
    };
  }

  const values = stages.map((stage) => ({ key: stage.key, label: stage.label, value: toNumber(stage.extractor(snapshot)) }));
  const transitions = [] as Array<{ from: string; to: string; retention: number | null; drop: number | null; fromValue: number; toValue: number }>;
  for (let i = 0; i < values.length - 1; i += 1) {
    const current = values[i];
    const next = values[i + 1];
    if (!current.value || current.value <= 0 || !next.value || next.value < 0) {
      transitions.push({ from: current.label, to: next.label, retention: null, drop: null, fromValue: current.value ?? 0, toValue: next.value ?? 0 });
      continue;
    }
    const retention = next.value / current.value;
    transitions.push({ from: current.label, to: next.label, retention, drop: 1 - retention, fromValue: current.value, toValue: next.value });
  }

  const validTransitions = transitions.filter((transition) => transition.retention != null);
  if (!validTransitions.length) {
    return {
      hasData: false,
      confidence: "low",
      evidence: [],
      missingReason: "Funnel counts too thin to calculate. Need ≥50 sessions and >0 orders."
    };
  }
  const worst = validTransitions.reduce((lowest, candidate) => {
    if (!lowest) return candidate;
    return (candidate.drop ?? 0) > (lowest.drop ?? 0) ? candidate : lowest;
  }, validTransitions[0]);

  const dropPercent = ((worst.drop ?? 0) * 100).toFixed(1);
  const confidence = worst.fromValue > 200 ? "high" : worst.fromValue > 50 ? "medium" : "low";
  const evidence = [`${worst.from}: ${formatNumber(worst.fromValue)}`, `${worst.to}: ${formatNumber(worst.toValue)}`];
  const recommendation = buildRecommendation(worst);

  return {
    hasData: true,
    stageLabel: `${worst.from} → ${worst.to}`,
    dropPercent: Number(dropPercent),
    detail: `Only ${(worst.retention ?? 0) * 100 < 1 ? "<1" : ((worst.retention ?? 0) * 100).toFixed(1)}% make it from ${worst.from.toLowerCase()} to ${worst.to.toLowerCase()}.`,
    recommendation,
    confidence,
    evidence
  };
}

function buildRecommendation(transition: { from: string; to: string; toValue: number; fromValue: number }) {
  if (transition.from.toLowerCase().includes("checkout")) {
    return "Audit checkout form, payment methods, and trust signals.";
  }
  if (transition.to.toLowerCase().includes("add")) {
    return "Improve product detail clarity and CTA hierarchy.";
  }
  if (transition.to.toLowerCase().includes("view")) {
    return "Drive more targeted traffic to product pages.";
  }
  return "Review offer, creative, and friction between these steps.";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
