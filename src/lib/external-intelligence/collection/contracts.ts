import { z } from "zod";

import type { CollectionPlan } from "@/lib/external-intelligence/config/collection-plan.contract";

export type RateLimitState = {
  scope: "global" | "source";
  limit_per_minute: number;
  remaining: number;
  reset_at: string; // ISO
};

export type CollectionHealth = {
  state:
    | "not_configured"
    | "ready"
    | "healthy"
    | "degraded"
    | "blocked"
    | "credential_missing"
    | "rate_limited"
    | "access_revoked"
    | "terms_expired"
    | "failed";
  reason: string | null;
};

export type CollectionError = {
  code:
    | "PLAN_INVALID"
    | "PLAN_EXPIRED"
    | "ELIGIBILITY_NOT_ALLOWED_NOW"
    | "MODE_NOT_ALLOWED_NOW"
    | "SOURCE_VERSION_MISMATCH"
    | "REGISTRY_HASH_MISMATCH"
    | "POLICY_PINS_MISMATCH"
    | "ADAPTER_MISMATCH"
    | "ADAPTER_NOT_OPERATIONAL"
    | "CREDENTIAL_MISSING"
    | "RETENTION_UNSUPPORTED"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MALFORMED_RESPONSE"
    | "UNKNOWN";
  message: string;
};

export const ArtifactTypeSchema = z.enum(["time_series_observations", "series_metadata", "trademark_case_metadata", "service_alert_metadata", "article_metadata", "excerpt", "calendar_event_metadata", "trend_timeseries_metadata"]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export type CollectedArtifact = {
  artifact_id: string;
  source_id: string;
  source_config_version: string;

  artifact_type: ArtifactType;

  source_reference: {
    url: string | null;
    external_id: string | null;
  };

  published_at: string | null;
  retrieved_at: string;

  raw_content_hash: string;
  payload: unknown;

  retention_classification: "metadata_only" | "link_only" | "excerpt_limited" | "no_copy";
  access_legal_metadata: Record<string, unknown>;
  correction_retraction_metadata: Record<string, unknown>;
  provenance_metadata: Record<string, unknown>;
};

export type CollectionRequest = {
  source_id: string;

  // Exact governance pins.
  registry_version: string;
  registry_hash: string;
  source_sets_hash: string;

  eligibility_fingerprint: string;
  plan: CollectionPlan;

  requested_time_window: { start: string; end: string };
  cursor: string | null;

  environment: "production" | "staging" | "local";
  dry_run: boolean;
  maximum_artifact_count: number;
};

export type CollectionResult = {
  ok: boolean;
  artifacts: CollectedArtifact[];
  next_cursor: string | null;
  health: CollectionHealth;
  rate_limit: RateLimitState | null;
  error: CollectionError | null;
};

export type SourceCollector = {
  source_id: string;

  /** Pure validation; never performs network. */
  validateRequest: (req: CollectionRequest) => void;

  /** Execute collection. Must honor dry_run=true by performing validation only. */
  collect: (req: CollectionRequest, deps: { fetch: typeof fetch }) => Promise<CollectionResult>;

  /** Current operational health of the collector implementation (not source credibility). */
  health: () => CollectionHealth;
};
