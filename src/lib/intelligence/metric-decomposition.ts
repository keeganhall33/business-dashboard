type DecompositionInput = {
  current: {
    revenueCents: number | null;
    orders: number | null;
    sessions: number | null;
  };
  previous: {
    revenueCents: number | null;
    orders: number | null;
    sessions: number | null;
  };
};

export type RevenueDecomposition = {
  revenue: { currentCents: number | null; previousCents: number | null; deltaCents: number | null; percent: number | null };
  sessions: { current: number | null; previous: number | null; delta: number | null; percent: number | null };
  conversionRate: { current: number | null; previous: number | null; delta: number | null; percent: number | null };
  aovCents: { current: number | null; previous: number | null; delta: number | null; percent: number | null };
  driverRanking: Array<{ key: "sessions" | "conversion" | "aov"; score: number }>;
  caveats: string[];
};

function pct(current: number | null, previous: number | null) {
  if (current == null || previous == null) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function delta(current: number | null, previous: number | null) {
  if (current == null || previous == null) return null;
  return current - previous;
}

export function decomposeRevenue({ current, previous }: DecompositionInput): RevenueDecomposition {
  const caveats: string[] = [];

  const conv = (orders: number | null, sessions: number | null) => {
    if (orders == null || sessions == null || sessions <= 0) return null;
    return (orders / sessions) * 100;
  };

  const aov = (revenueCents: number | null, orders: number | null) => {
    if (revenueCents == null || orders == null || orders <= 0) return null;
    return Math.round(revenueCents / orders);
  };

  const currentConv = conv(current.orders, current.sessions);
  const prevConv = conv(previous.orders, previous.sessions);
  const currentAov = aov(current.revenueCents, current.orders);
  const prevAov = aov(previous.revenueCents, previous.orders);

  if ((current.sessions ?? 0) < 50 || (previous.sessions ?? 0) < 50) {
    caveats.push("Small session counts can make conversion changes noisy.");
  }

  const revenueDelta = delta(current.revenueCents, previous.revenueCents);
  const revenuePct = pct(current.revenueCents, previous.revenueCents);

  // Rank drivers by absolute percent change magnitude, but degrade when undefined.
  const sessionPct = pct(current.sessions, previous.sessions);
  const convPct = pct(currentConv, prevConv);
  const aovPct = pct(currentAov, prevAov);

  const score = (v: number | null) => (v == null ? 0 : Math.min(100, Math.abs(v)));
  const driverRanking = [
    { key: "sessions" as const, score: score(sessionPct) },
    { key: "conversion" as const, score: score(convPct) },
    { key: "aov" as const, score: score(aovPct) }
  ].sort((a, b) => b.score - a.score);

  return {
    revenue: {
      currentCents: current.revenueCents,
      previousCents: previous.revenueCents,
      deltaCents: revenueDelta,
      percent: revenuePct
    },
    sessions: {
      current: current.sessions,
      previous: previous.sessions,
      delta: delta(current.sessions, previous.sessions),
      percent: sessionPct
    },
    conversionRate: {
      current: currentConv,
      previous: prevConv,
      delta: delta(currentConv, prevConv),
      percent: convPct
    },
    aovCents: {
      current: currentAov,
      previous: prevAov,
      delta: delta(currentAov, prevAov),
      percent: aovPct
    },
    driverRanking,
    caveats
  };
}
