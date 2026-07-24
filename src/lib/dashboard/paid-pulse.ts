import type { MetaAdsSnapshot } from "@/lib/types/dashboard";

export type PaidPulseInsight = {
  showPanel: boolean;
  headline: string;
  decision: "scale" | "pause" | "refresh" | "watch" | "thin";
  message: string;
  spendLabel: string;
  roasLabel: string;
  volumeLabel: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function buildPaidPulseInsight(snapshot?: MetaAdsSnapshot | null): PaidPulseInsight | null {
  if (!snapshot) return null;
  const spend = snapshot.summary?.spend ?? 0;
  const purchases = snapshot.summary?.purchases ?? 0;
  const roas = snapshot.summary?.roas ?? null;
  const showPanel = spend > 0;
  if (!showPanel) {
    return {
      showPanel: false,
      headline: "No paid spend in this window",
      decision: "thin",
      message: "Paid panel stays hidden until spend resumes or a paid alert triggers.",
      spendLabel: currency.format(0),
      roasLabel: roas != null ? `${roas.toFixed(2)}x` : "—",
      volumeLabel: `${purchases} purchases`,
      recommendation: "",
      confidence: "low"
    };
  }

  if (spend < 25 || purchases < 2) {
    return {
      showPanel: true,
      headline: "Too thin to judge",
      decision: "thin",
      message: "Need ≥$50 spend and ≥3 purchases before scaling or pausing.",
      spendLabel: currency.format(spend),
      roasLabel: roas != null ? `${roas.toFixed(2)}x` : "—",
      volumeLabel: `${purchases} purchases`,
      recommendation: "Let the campaign collect more signal or pause until creative is ready.",
      confidence: "low"
    };
  }

  if (roas != null && roas >= 3) {
    return {
      showPanel: true,
      headline: "Profitable – scale carefully",
      decision: "scale",
      message: "ROAS is strong with real volume.",
      spendLabel: currency.format(spend),
      roasLabel: `${roas.toFixed(2)}x`,
      volumeLabel: `${purchases} purchases`,
      recommendation: "Increase budget modestly and rotate creative to avoid fatigue.",
      confidence: "high"
    };
  }

  if (roas != null && roas < 1) {
    return {
      showPanel: true,
      headline: "ROAS underwater",
      decision: "pause",
      message: "Spend is not converting.",
      spendLabel: currency.format(spend),
      roasLabel: `${roas.toFixed(2)}x`,
      volumeLabel: `${purchases} purchases`,
      recommendation: "Pause spend, refresh creative, and verify pixel events.",
      confidence: "medium"
    };
  }

  return {
    showPanel: true,
    headline: "Hold steady",
    decision: "watch",
    message: "ROAS is acceptable but not breakout. Keep creative fresh.",
    spendLabel: currency.format(spend),
    roasLabel: roas != null ? `${roas.toFixed(2)}x` : "—",
    volumeLabel: `${purchases} purchases`,
    recommendation: "Monitor daily. Scale only after Command Feed flags a higher priority move.",
    confidence: "medium"
  };
}
