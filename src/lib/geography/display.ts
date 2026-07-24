import { SalesGeographyLocation } from "@/lib/types/dashboard";

export type SalesGeographyDisplay = {
  id: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  privacyLevel: SalesGeographyLocation["privacyLevel"];
  revenue: number;
  orderCount: number;
  sharePercent: number;
  topProduct?: string | null;
};

export function buildDisplayLocations(locations: SalesGeographyLocation[]): SalesGeographyDisplay[] {
  const totalRevenue = locations.reduce((sum, location) => sum + (location.revenue ?? 0), 0) || 0;
  return locations.map((location) => {
    const { primary, secondary } = buildLabels(location);
    const sharePercent = totalRevenue > 0 ? (location.revenue / totalRevenue) * 100 : 0;
    return {
      id: location.id,
      primaryLabel: primary,
      secondaryLabel: secondary,
      privacyLevel: location.privacyLevel,
      revenue: location.revenue,
      orderCount: location.orderCount,
      sharePercent: Number(sharePercent.toFixed(2)),
      topProduct: location.topProducts?.[0]?.name ?? null
    } satisfies SalesGeographyDisplay;
  });
}

function buildLabels(location: SalesGeographyLocation) {
  if (location.privacyLevel === "city" && location.city) {
    const city = location.city;
    const state = location.state ? `, ${location.state}` : "";
    return {
      primary: `${city}${state}`,
      secondary: location.country ?? null
    };
  }
  if (location.privacyLevel === "state" && location.state) {
    const country = location.country ? `, ${location.country}` : "";
    return {
      primary: `${location.state}${country}`,
      secondary: null
    };
  }
  const primary = location.country ?? location.label ?? "Unknown";
  return {
    primary,
    secondary: null
  };
}
