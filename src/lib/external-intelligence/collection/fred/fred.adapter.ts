import { FredCollectionParamsSchema, FredSeriesObservationsResponseSchema } from "@/lib/external-intelligence/collection/fred/fred.contract";
import { FredCredentialMissingError, FredMalformedResponseError } from "@/lib/external-intelligence/collection/fred/fred.errors";
import { mapFredObservationsToArtifacts } from "@/lib/external-intelligence/collection/fred/fred.mapper";
import type { CollectionRequest, CollectionResult, SourceCollector } from "@/lib/external-intelligence/collection/contracts";

const FRED_ENDPOINT = "https://api.stlouisfed.org/fred/series/observations";

export function createFredCollector(input: {
  apiKey: string | null;
  source_id: string;
  source_config_version: string;
}): SourceCollector {
  return {
    source_id: input.source_id,

    validateRequest(req: CollectionRequest) {
      if (req.source_id !== input.source_id) throw new Error("adapter_source_id_mismatch");
      if (req.maximum_artifact_count <= 0) throw new Error("invalid_maximum_artifact_count");
    },

    async collect(req: CollectionRequest, deps: { fetch: typeof fetch }): Promise<CollectionResult> {
      this.validateRequest(req);

      if (req.dry_run) {
        return {
          ok: true,
          artifacts: [],
          next_cursor: null,
          health: { state: "ready", reason: null },
          rate_limit: null,
          error: null
        };
      }

      if (!input.apiKey) {
        const err = new FredCredentialMissingError("FRED_API_KEY missing");
        return {
          ok: false,
          artifacts: [],
          next_cursor: null,
          health: { state: "credential_missing", reason: err.message },
          rate_limit: null,
          error: { code: "CREDENTIAL_MISSING", message: err.message }
        };
      }

      // NOTE: CollectionPlan is governance-only. Adapter-specific parameters are conveyed
      // through a validated cursor/continuation token in B1.
      const cursor = req.cursor ?? "";
      const seriesMatch = /^series_id=([A-Za-z0-9_\-\.]+)$/.exec(cursor);
      if (!seriesMatch) {
        return {
          ok: false,
          artifacts: [],
          next_cursor: null,
          health: { state: "blocked", reason: "missing series_id cursor" },
          rate_limit: null,
          error: { code: "PLAN_INVALID", message: "missing series_id cursor" }
        };
      }

      const params = FredCollectionParamsSchema.parse({ series_id: seriesMatch[1] });

      const u = new URL(FRED_ENDPOINT);
      u.searchParams.set("file_type", "json");
      u.searchParams.set("series_id", params.series_id);
      u.searchParams.set("api_key", input.apiKey);
      u.searchParams.set("limit", String(Math.min(params.limit, req.maximum_artifact_count)));

      const res = await deps.fetch(u.toString(), { method: "GET" });
      const text = await res.text();

      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        const err = new FredMalformedResponseError("FRED response was not JSON");
        return {
          ok: false,
          artifacts: [],
          next_cursor: null,
          health: { state: "failed", reason: err.message },
          rate_limit: null,
          error: { code: "MALFORMED_RESPONSE", message: err.message }
        };
      }

      const parsed = FredSeriesObservationsResponseSchema.safeParse(json);
      if (!parsed.success) {
        const err = new FredMalformedResponseError("FRED response failed schema validation");
        return {
          ok: false,
          artifacts: [],
          next_cursor: null,
          health: { state: "failed", reason: err.message },
          rate_limit: null,
          error: { code: "MALFORMED_RESPONSE", message: err.message }
        };
      }

      const retrieved_at = new Date().toISOString();
      const artifacts = mapFredObservationsToArtifacts({
        source_id: input.source_id,
        source_config_version: input.source_config_version,
        series_id: params.series_id,
        retrieved_at,
        response: parsed.data
      }).slice(0, req.maximum_artifact_count);

      return {
        ok: true,
        artifacts,
        next_cursor: null,
        health: { state: "healthy", reason: null },
        rate_limit: null,
        error: null
      };
    },

    health() {
      if (!input.apiKey) return { state: "credential_missing", reason: "FRED_API_KEY missing" };
      return { state: "ready", reason: null };
    }
  };
}
