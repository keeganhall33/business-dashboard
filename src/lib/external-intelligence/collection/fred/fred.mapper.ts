import { sha256CanonicalJson } from "@/lib/external-intelligence/hashing/content-hash";
import type { CollectedArtifact } from "@/lib/external-intelligence/collection/contracts";
import type { FredSeriesObservationsResponse } from "@/lib/external-intelligence/collection/fred/fred.contract";

export function mapFredObservationsToArtifacts(input: {
  source_id: string;
  source_config_version: string;
  series_id: string;
  retrieved_at: string;
  response: FredSeriesObservationsResponse;
}): CollectedArtifact[] {
  // Deterministic: stable order by date.
  const obs = input.response.observations.slice().sort((a, b) => a.date.localeCompare(b.date));

  return obs.map((o) => {
    const payload = { series_id: input.series_id, date: o.date, value: o.value };
    const raw_content_hash = sha256CanonicalJson({ v: "fred-observation/v1", ...payload });

    const artifact_id = sha256CanonicalJson({
      v: "artifact-id/v1",
      source_id: input.source_id,
      series_id: input.series_id,
      date: o.date,
      raw_content_hash
    });

    return {
      artifact_id,
      source_id: input.source_id,
      source_config_version: input.source_config_version,
      artifact_type: "time_series_observations",
      source_reference: { url: null, external_id: `${input.series_id}:${o.date}` },
      published_at: o.date,
      retrieved_at: input.retrieved_at,
      raw_content_hash,
      payload,
      retention_classification: "metadata_only",
      access_legal_metadata: { provider: "fred", method: "official_api" },
      correction_retraction_metadata: {},
      provenance_metadata: { series_id: input.series_id }
    };
  });
}
