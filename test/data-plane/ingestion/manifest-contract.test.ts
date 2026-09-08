import assert from "node:assert/strict";
import test from "node:test";

import manifestJson from "../../../config/data-plane/ingestion_manifest.v1.json";
import { IngestionManifestSchema, parseIngestionManifest } from "../../../src/lib/data-plane/ingestion/manifest-contract";
import { evaluateSourceDecisionEligibility, loadIngestionManifest } from "../../../src/lib/data-plane/ingestion/load-manifest";

const clone = <T>(value: T): T => structuredClone(value);

test("canonical manifest covers first-party systems and every governed external registry source", () => {
  const manifest = loadIngestionManifest();
  const ids = new Set(manifest.sources.map((source) => source.source_id));

  assert.equal(manifest.sources.length, 39);
  for (const required of [
    "commerce.woocommerce",
    "analytics.ga4",
    "commerce.funnelkit",
    "website.wordpress",
    "edge.cloudflare",
    "ads.meta",
    "ads.google",
    "search.google_search_console",
    "behavior.microsoft_clarity",
    "email.ionos",
    "crm.native",
    "social.owned_channels",
    "operations.stamps",
    "intelligence.supabase",
    "sports_business.boardroom",
    "sports.basketball.hoophall.official",
    "economics.fred"
  ]) assert.ok(ids.has(required), `missing ${required}`);

  const external = manifest.sources.filter((source) => source.registry_source_id);
  assert.equal(external.length, 25);
  assert.equal(new Set(external.flatMap((source) => source.registry_source_set_ids)).size, 10);
});

test("Boardroom is visible and adapter-ready without bypassing its access gate", () => {
  const source = loadIngestionManifest().sources.find((candidate) => candidate.source_id === "sports_business.boardroom");
  assert.ok(source);
  assert.equal(source.adapter.state, "READY");
  assert.match(source.adapter.identity, /boardroom\.adapter\.ts$/);
  assert.equal(source.connection_state, "AVAILABLE_NEEDS_IMPLEMENTATION");
  assert.equal(source.execution_venue, "MANUAL_ONLY");
  assert.equal(source.legal_access.status, "PENDING_REVIEW");
  assert.equal(source.legal_access.automation_suitability, "MANUAL_ONLY");
});

test("schema rejects duplicate IDs, plaintext-looking secrets, unsupported cron lists, and unknown enums", () => {
  const duplicate = clone(manifestJson);
  duplicate.sources.push(clone(duplicate.sources[0]));
  assert.equal(IngestionManifestSchema.safeParse(duplicate).success, false);

  const secret = clone(manifestJson);
  secret.sources[0].secret_refs = ["actual-secret-value"];
  assert.equal(IngestionManifestSchema.safeParse(secret).success, false);

  const cron = clone(manifestJson);
  cron.sources[0].cadence = { mode: "CRON", expression: "0 2,8 * * *", timezone: "America/Los_Angeles" };
  assert.equal(IngestionManifestSchema.safeParse(cron).success, false);

  const state = clone(manifestJson) as unknown as { sources: Array<{ connection_state: string }> };
  state.sources[0].connection_state = "SORT_OF_CONNECTED";
  assert.equal(IngestionManifestSchema.safeParse(state).success, false);
});

test("schema rejects executable sources without an adapter or approved access", () => {
  const noAdapter = clone(manifestJson);
  const executableIndex = noAdapter.sources.findIndex((source) => source.source_id === "commerce.woocommerce");
  assert.notEqual(executableIndex, -1);
  noAdapter.sources[executableIndex].adapter.state = "UNIMPLEMENTED";
  assert.equal(IngestionManifestSchema.safeParse(noAdapter).success, false);

  const noApproval = clone(manifestJson);
  noApproval.sources[executableIndex].legal_access.status = "PENDING_REVIEW";
  assert.equal(IngestionManifestSchema.safeParse(noApproval).success, false);
});

test("missing and stale evidence never becomes decision eligible", () => {
  const source = parseIngestionManifest(manifestJson).sources.find((candidate) => candidate.source_id === "commerce.woocommerce");
  assert.ok(source);

  assert.deepEqual(
    evaluateSourceDecisionEligibility({
      source,
      quality_state: "NO_DATA",
      source_as_of: null,
      now: "2026-09-08T05:00:00.000Z",
      required_fields_complete: false,
      reconciled: false
    }),
    {
      eligible: false,
      reasons: ["QUALITY_STATE_BLOCKED", "SOURCE_AS_OF_UNKNOWN", "REQUIRED_FIELDS_INCOMPLETE", "RECONCILIATION_INCOMPLETE"]
    }
  );

  const stale = evaluateSourceDecisionEligibility({
    source,
    quality_state: "FRESH",
    source_as_of: "2026-09-01T05:00:00.000Z",
    now: "2026-09-08T05:00:00.000Z",
    required_fields_complete: true,
    reconciled: true
  });
  assert.equal(stale.eligible, false);
  assert.deepEqual(stale.reasons, ["SOURCE_TOO_STALE"]);
});

test("fresh, complete, reconciled, authorized evidence is eligible", () => {
  const source = loadIngestionManifest().sources.find((candidate) => candidate.source_id === "intelligence.supabase");
  assert.ok(source);
  assert.deepEqual(
    evaluateSourceDecisionEligibility({
      source,
      quality_state: "FRESH",
      source_as_of: "2026-09-08T04:59:00.000Z",
      now: "2026-09-08T05:00:00.000Z",
      required_fields_complete: true,
      reconciled: true
    }),
    { eligible: true, reasons: [] }
  );
});
