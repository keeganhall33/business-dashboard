import type { ProductionSourceRegistryEntry, ProductionSourceRegistryFile } from "@/lib/external-intelligence/config/production-source-registry.contract";

export type SourceTierV1 =
  | "TIER_A_FIRST_PARTY_OR_OFFICIAL_API"
  | "TIER_B_PRIMARY_EXTERNAL"
  | "TIER_C_HIGH_QUALITY_SECONDARY"
  | "TIER_D_OPEN_WEB_DISCOVERY"
  | "TIER_E_PAID_OR_LICENSED";

export type SourceAvailabilityV1 = "available" | "degraded" | "unavailable" | "unknown";

export type SourceTierClassificationV1 =
  | {
      kind: "TIER";
      tier: SourceTierV1;
      reasons: string[];
    }
  | {
      kind: "SOURCE_COVERAGE_GAP";
      missing: string[];
      reasons: string[];
    };

export type ExternalSourceUniverseEntryV1 = {
  source_id: string;
  display_name: string;
  tier: SourceTierClassificationV1;
  availability: SourceAvailabilityV1;
  freshness: {
    expected_cadence: string;
    freshness_threshold: string;
  } | null;
};

export const SOURCE_TIER_POLICY_V1 = {
  version: "source_tier_policy_v1" as const
};

export function classifySourceTierV1(input: Partial<ProductionSourceRegistryEntry> | null | undefined): SourceTierClassificationV1 {
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!input) {
    return { kind: "SOURCE_COVERAGE_GAP", missing: ["source"], reasons: ["No source registry entry provided"] };
  }

  // Critical fields needed to avoid fabricating a tier.
  if (!input.source_id) missing.push("source_id");
  if (!input.access_method) missing.push("access_method");
  if (!input.authority_level) missing.push("authority_level");
  if (typeof input.licensing_required !== "boolean") missing.push("licensing_required");
  if (typeof input.paywalled !== "boolean") missing.push("paywalled");

  if (missing.length > 0) {
    reasons.push("Missing critical tier-classification fields; representing as SOURCE_COVERAGE_GAP (no inferred tier)");
    return { kind: "SOURCE_COVERAGE_GAP", missing, reasons };
  }

  const accessMethod = input.access_method!;
  const authority = input.authority_level!;
  const licensingRequired = input.licensing_required!;
  const paywalled = input.paywalled!;

  // Tier E: paid/licensed surfaces dominate regardless of authority.
  if (licensingRequired || paywalled || input.access_classification === "licensed") {
    reasons.push(
      licensingRequired
        ? "licensing_required=true"
        : paywalled
        ? "paywalled=true"
        : "access_classification=licensed"
    );
    return { kind: "TIER", tier: "TIER_E_PAID_OR_LICENSED", reasons };
  }

  // Tier A: first-party or official API.
  if (accessMethod === "official_api" || (input.source_type === "official" && authority === "primary")) {
    reasons.push(accessMethod === "official_api" ? "access_method=official_api" : "source_type=official + authority_level=primary");
    return { kind: "TIER", tier: "TIER_A_FIRST_PARTY_OR_OFFICIAL_API", reasons };
  }

  // Tier D: open web discovery (low authority, public web).
  if (accessMethod === "public_web" && authority === "tertiary") {
    reasons.push("public_web + tertiary authority implies open-web discovery");
    return { kind: "TIER", tier: "TIER_D_OPEN_WEB_DISCOVERY", reasons };
  }

  // Tier B: primary external sources.
  if (authority === "primary") {
    reasons.push("authority_level=primary");
    return { kind: "TIER", tier: "TIER_B_PRIMARY_EXTERNAL", reasons };
  }

  // Tier C: high-quality secondary sources (default for non-primary, non-discovery).
  reasons.push(`authority_level=${authority}`);
  return { kind: "TIER", tier: "TIER_C_HIGH_QUALITY_SECONDARY", reasons };
}

export function classifyAvailabilityV1(input: Partial<ProductionSourceRegistryEntry> | null | undefined): SourceAvailabilityV1 {
  const s = input?.access_status;
  if (!s) return "unknown";
  if (s === "working") return "available";
  if (s === "degraded") return "degraded";
  if (s === "broken" || s === "revoked") return "unavailable";
  return "unknown";
}

export function buildExternalSourceUniverseV1(file: ProductionSourceRegistryFile): ExternalSourceUniverseEntryV1[] {
  const out: ExternalSourceUniverseEntryV1[] = [];

  for (const s of file.sources) {
    out.push({
      source_id: s.source_id,
      display_name: s.display_name,
      tier: classifySourceTierV1(s),
      availability: classifyAvailabilityV1(s),
      freshness: s.expected_cadence && s.freshness_threshold ? { expected_cadence: s.expected_cadence, freshness_threshold: s.freshness_threshold } : null
    });
  }

  out.sort((a, b) => a.source_id.localeCompare(b.source_id));
  return out;
}
