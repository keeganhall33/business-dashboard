import test from "node:test";
import assert from "node:assert/strict";

import { FredSeriesObservationsResponseSchema } from "@/lib/external-intelligence/collection/fred/fred.contract";
import { mapFredObservationsToArtifacts } from "@/lib/external-intelligence/collection/fred/fred.mapper";
import { createFredCollector } from "@/lib/external-intelligence/collection/fred/fred.adapter";

const FIXTURE = {
  observations: [
    { date: "2026-01-01", value: "1.0" },
    { date: "2026-01-02", value: "2.0" }
  ]
};

test("FRED fixture parses and maps deterministically", () => {
  const parsed = FredSeriesObservationsResponseSchema.parse(FIXTURE);

  const a1 = mapFredObservationsToArtifacts({
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    series_id: "TEST",
    retrieved_at: "2026-01-03T00:00:00.000Z",
    response: parsed
  });

  const a2 = mapFredObservationsToArtifacts({
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    series_id: "TEST",
    retrieved_at: "2026-01-03T00:00:00.000Z",
    response: parsed
  });

  assert.deepEqual(a1, a2);
  assert.match(a1[0]!.artifact_id, /^[a-f0-9]{64}$/);
  assert.match(a1[0]!.raw_content_hash, /^[a-f0-9]{64}$/);
});

test("FRED collector dry-run performs no network access", async () => {
  const c = createFredCollector({ apiKey: null, source_id: "economics.fred", source_config_version: "v1.0.0" });

  const res = await c.collect(
    {
      source_id: "economics.fred",
      registry_version: "v1.0.0",
      registry_hash: "a".repeat(64),
      source_sets_hash: "b".repeat(64),
      eligibility_fingerprint: "c".repeat(64),
      // plan is not used in dry-run.
      plan: {} as unknown as Parameters<typeof c.collect>[0]["plan"],
      requested_time_window: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-02T00:00:00.000Z" },
      cursor: "series_id=TEST",
      environment: "local",
      dry_run: true,
      maximum_artifact_count: 10
    },
    {
      fetch: async () => {
        throw new Error("fetch_should_not_be_called");
      }
    }
  );

  assert.equal(res.ok, true);
  assert.equal(res.artifacts.length, 0);
});
