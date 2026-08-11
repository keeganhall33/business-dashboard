import type { OpportunitySeed } from "./types";

export function opportunityDedupeKey(name: string | null | undefined, organization: string | null | undefined) {
  return `${(name ?? "").trim().toLowerCase()}|${(organization ?? "").trim().toLowerCase()}`;
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function guessOrganizationFromSeed(seed: OpportunitySeed): string | null {
  const org = seed.organization?.trim();
  if (org) return org;
  // Very light heuristic: if the name contains a hyphen with a brand prefix.
  const parts = seed.name.split("-").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 3 && parts[0].length <= 30) return parts[0];
  return null;
}

