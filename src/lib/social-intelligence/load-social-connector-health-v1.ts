import "@/lib/server-only";

import { getDashboardSnapshots, type DashboardSnapshotRecord } from "@/lib/supabase/queries";
import {
  compileSocialConnectorHealthReviewV1,
  type SocialConnectorHealthReviewV1
} from "@/lib/social-intelligence/social-connector-health-review-v1";
import type { SocialPlatformConnectorInputV1 } from "@/lib/social-intelligence/social-connector-proof-v1";
import type { SocialLiveProviderRunInputV1 } from "@/lib/social-intelligence/social-live-provider-run-v1";

export type SocialConnectorHealthSurfaceStateV1 = "PROVEN" | "UNPROVEN" | "UNAVAILABLE";

export type SocialConnectorHealthSurfaceV1 = {
  state: SocialConnectorHealthSurfaceStateV1;
  generatedAt: string | null;
  review: SocialConnectorHealthReviewV1 | null;
  summary: string;
  detail: string;
  nextAction: string;
};

const HEALTH_KEY = "social_connector_health_v1";
const LEGACY_KEY = "social";

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function buildUnavailableSocialConnectorHealthSurfaceV1(): SocialConnectorHealthSurfaceV1 {
  return {
    state: "UNAVAILABLE",
    generatedAt: null,
    review: null,
    summary: "Social connector health is not available yet.",
    detail: "No validated live first-party social connector proof was returned.",
    nextAction: "Persist a validated connector health snapshot before using social performance in decisions."
  };
}

export function projectSocialConnectorHealthSurfaceV1(
  snapshots: readonly DashboardSnapshotRecord[],
  now: string | Date = new Date()
): SocialConnectorHealthSurfaceV1 {
  const healthSnapshot = snapshots.find((snapshot) => snapshot.key === HEALTH_KEY) ?? null;
  const legacySnapshot = snapshots.find((snapshot) => snapshot.key === LEGACY_KEY) ?? null;
  const healthPayload = object(healthSnapshot?.payload);

  if (healthPayload) {
    try {
      if (!Array.isArray(healthPayload.connectorInputs) || !Array.isArray(healthPayload.providerRunInputs)) {
        throw new Error("SOCIAL_CONNECTOR_HEALTH_INPUTS_REQUIRED");
      }
      const generatedAt = timestamp(healthPayload.generatedAt)
        ?? timestamp(healthSnapshot?.generated_at)
        ?? timestamp(healthSnapshot?.updated_at)
        ?? (now instanceof Date ? now.toISOString() : new Date(now).toISOString());
      const staleAfterHours = typeof healthPayload.staleAfterHours === "number"
        ? healthPayload.staleAfterHours
        : 48;
      const review = compileSocialConnectorHealthReviewV1(
        healthPayload.connectorInputs as SocialPlatformConnectorInputV1[],
        healthPayload.providerRunInputs as SocialLiveProviderRunInputV1[],
        generatedAt,
        staleAfterHours
      );
      return {
        state: "PROVEN",
        generatedAt: review.generatedAt,
        review,
        summary: `${review.liveFirstPartyPlatforms.length} social platform${review.liveFirstPartyPlatforms.length === 1 ? " has" : "s have"} validated first-party proof.`,
        detail: "Platform health is compiled from read-only provider runs and canonical social snapshots.",
        nextAction: review.platformsNeedingKeeganAction.length
          ? "Complete the account connections identified below."
          : review.platformsNeedingEngineeringAction.length
            ? "Complete the engineering work identified below."
            : "No connector action is currently required."
      };
    } catch {
      return {
        ...buildUnavailableSocialConnectorHealthSurfaceV1(),
        generatedAt: timestamp(healthSnapshot?.generated_at) ?? timestamp(healthSnapshot?.updated_at),
        summary: "The stored social connector health record could not be validated.",
        detail: "The dashboard withheld platform claims because the persisted proof bundle failed validation.",
        nextAction: "Repair and republish the connector health proof bundle."
      };
    }
  }

  if (legacySnapshot) {
    const legacyPayload = object(legacySnapshot.payload);
    return {
      state: "UNPROVEN",
      generatedAt: timestamp(legacyPayload?.generatedAt)
        ?? timestamp(legacySnapshot.generated_at)
        ?? timestamp(legacySnapshot.updated_at),
      review: null,
      summary: "Live first-party social performance is not yet proven.",
      detail: "The current social snapshot is a scaffold for manual observations, not a validated platform connection.",
      nextAction: "Connect read-only provider ingestion and persist canonical proof before using social metrics."
    };
  }

  return buildUnavailableSocialConnectorHealthSurfaceV1();
}

export async function loadSocialConnectorHealthSurfaceV1(): Promise<SocialConnectorHealthSurfaceV1> {
  const snapshots = await getDashboardSnapshots([HEALTH_KEY, LEGACY_KEY]);
  return projectSocialConnectorHealthSurfaceV1(snapshots);
}
