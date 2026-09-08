import { z } from "zod";

export const IngestionConnectionStateSchema = z.enum([
  "CONNECTED_AND_INGESTING",
  "CONNECTED_PARTIAL",
  "AVAILABLE_NEEDS_IMPLEMENTATION",
  "NEEDS_KEEGAN_CONNECTION",
  "MANUAL_ONLY",
  "DISABLED",
  "NOT_AVAILABLE",
  "NOT_RECOMMENDED"
]);

export const EvidenceQualityStateSchema = z.enum([
  "FRESH",
  "EXPECTED_LAG",
  "STALE",
  "FAILED",
  "CONFLICTED",
  "PARTIAL",
  "UNKNOWN",
  "NO_DATA"
]);

const SourceTierSchema = z.enum([
  "TIER_A_FIRST_PARTY_OR_OFFICIAL_API",
  "TIER_B_PRIMARY_EXTERNAL",
  "TIER_C_HIGH_QUALITY_SECONDARY",
  "TIER_D_OPEN_WEB_DISCOVERY",
  "TIER_E_PAID_OR_LICENSED"
]);

const ExecutionVenueSchema = z.enum([
  "DASHBOARD_WORKER",
  "GITHUB_ACTIONS",
  "LOCAL_AUTHORIZED_WORKER",
  "MANUAL_ONLY",
  "DISABLED"
]);

const AdapterStateSchema = z.enum(["OPERATIONAL", "READY", "PARTIAL", "UNIMPLEMENTED", "BLOCKED"]);
const LegalStatusSchema = z.enum([
  "INTERNAL_AUTHORIZED",
  "APPROVED",
  "APPROVED_WITH_RESTRICTIONS",
  "PENDING_REVIEW",
  "NEEDS_CONNECTION",
  "PROHIBITED"
]);
const AutomationSuitabilitySchema = z.enum(["ALLOWED", "METADATA_ONLY", "MANUAL_ONLY", "PROHIBITED"]);

const CadenceSchema = z
  .object({
    mode: z.enum(["EVENT_DRIVEN", "INTERVAL", "CRON", "MANUAL", "DISABLED"]),
    expression: z.string().min(1).max(80).nullable(),
    timezone: z.literal("America/Los_Angeles")
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "CRON" && !value.expression) {
      ctx.addIssue({ code: "custom", message: "CRON cadence requires an expression" });
    }
    if (value.mode !== "CRON" && value.mode !== "INTERVAL" && value.expression) {
      ctx.addIssue({ code: "custom", message: `${value.mode} cadence cannot include an expression` });
    }
    if (value.mode === "CRON" && value.expression?.includes(",")) {
      ctx.addIssue({ code: "custom", message: "comma-list cron expressions are unsupported" });
    }
  });

const SecretReferenceSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,79}$/, "secret references must be environment-variable names only");

export const IngestionManifestEntrySchema = z
  .object({
    source_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/),
    registry_source_id: z.string().nullable(),
    registry_source_set_ids: z.array(z.string()).default([]),
    source_tier: SourceTierSchema,
    connection_state: IngestionConnectionStateSchema,
    business_domains: z.array(z.string()).min(1),
    capabilities: z.array(z.string()).min(1),
    decisions_supported: z.array(z.string()).min(1),
    adapter: z
      .object({
        identity: z.string().min(1),
        state: AdapterStateSchema,
        version: z.string().min(1)
      })
      .strict(),
    execution_venue: ExecutionVenueSchema,
    cadence: CadenceSchema,
    expected_source_latency_seconds: z.number().int().nonnegative(),
    freshness_sla_seconds: z.number().int().positive(),
    maximum_decision_staleness_seconds: z.number().int().positive(),
    incremental: z
      .object({ strategy: z.enum(["WEBHOOK", "CURSOR", "WATERMARK", "ETAG", "SNAPSHOT_DIFF", "NONE"]), checkpoint: z.string().min(1) })
      .strict(),
    backfill: z
      .object({ strategy: z.enum(["BOUNDED_WINDOW", "PAGED_HISTORY", "MANUAL", "NONE"]), maximum_days: z.number().int().nonnegative(), priority: z.literal("LOW") })
      .strict(),
    secret_refs: z.array(SecretReferenceSchema),
    legal_access: z
      .object({ status: LegalStatusSchema, automation_suitability: AutomationSuitabilitySchema, policy_version: z.string().min(1) })
      .strict(),
    destinations: z.object({ raw: z.string().min(1), canonical: z.string().min(1) }).strict(),
    provenance: z.object({ source_as_of_required: z.boolean(), raw_hash_required: z.boolean() }).strict(),
    idempotency_key_fields: z.array(z.string()).min(1),
    retry: z
      .object({ max_attempts: z.number().int().min(0).max(12), base_delay_seconds: z.number().int().positive(), max_delay_seconds: z.number().int().positive(), dead_letter: z.boolean() })
      .strict(),
    downstream: z
      .object({ decision_eligible_states: z.array(EvidenceQualityStateSchema), fail_closed_states: z.array(EvidenceQualityStateSchema).min(1) })
      .strict(),
    owner: z.string().min(1),
    verification_class: z.enum(["AUTOMATED", "INDEPENDENT", "KEEGAN"])
  })
  .strict()
  .superRefine((entry, ctx) => {
    const executable = ["DASHBOARD_WORKER", "GITHUB_ACTIONS", "LOCAL_AUTHORIZED_WORKER"].includes(entry.execution_venue);
    if (executable && ["UNIMPLEMENTED", "BLOCKED"].includes(entry.adapter.state)) {
      ctx.addIssue({ code: "custom", message: "executable source requires a usable adapter", path: ["adapter", "state"] });
    }
    if (executable && !["INTERNAL_AUTHORIZED", "APPROVED", "APPROVED_WITH_RESTRICTIONS"].includes(entry.legal_access.status)) {
      ctx.addIssue({ code: "custom", message: "executable source requires approved legal/access status", path: ["legal_access", "status"] });
    }
    if (entry.legal_access.automation_suitability === "PROHIBITED" && entry.execution_venue !== "DISABLED") {
      ctx.addIssue({ code: "custom", message: "prohibited automation must be disabled", path: ["execution_venue"] });
    }
    if (entry.adapter.state === "UNIMPLEMENTED" && entry.downstream.decision_eligible_states.length > 0) {
      ctx.addIssue({ code: "custom", message: "unimplemented source cannot be decision eligible", path: ["downstream"] });
    }
    if (entry.connection_state === "CONNECTED_AND_INGESTING" && !executable) {
      ctx.addIssue({ code: "custom", message: "connected ingestion requires an executable venue", path: ["execution_venue"] });
    }
    if (entry.maximum_decision_staleness_seconds < entry.freshness_sla_seconds) {
      ctx.addIssue({ code: "custom", message: "decision staleness cannot be stricter than freshness SLA" });
    }
    if (entry.retry.max_delay_seconds < entry.retry.base_delay_seconds) {
      ctx.addIssue({ code: "custom", message: "retry max delay must be at least the base delay", path: ["retry"] });
    }
  });

export const IngestionManifestSchema = z
  .object({
    schema_version: z.literal("ingestion_manifest_v1"),
    manifest_version: z.string().min(1),
    timezone: z.literal("America/Los_Angeles"),
    scheduler: z
      .object({ wakeup_cadence: z.literal("5m"), enqueue_only: z.literal(true), maximum_dispatch_seconds: z.number().int().positive().max(60) })
      .strict(),
    evidence_contract: z
      .object({ required_fields: z.array(z.string()).min(10), missing_is_zero: z.literal(false), collector_liveness_is_freshness: z.literal(false) })
      .strict(),
    sources: z.array(IngestionManifestEntrySchema).min(1)
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      if (seen.has(source.source_id)) ctx.addIssue({ code: "custom", message: `duplicate source_id: ${source.source_id}`, path: ["sources", index, "source_id"] });
      seen.add(source.source_id);
    }
  });

export type IngestionManifest = z.infer<typeof IngestionManifestSchema>;
export type IngestionManifestEntry = z.infer<typeof IngestionManifestEntrySchema>;

export function parseIngestionManifest(input: unknown): IngestionManifest {
  return IngestionManifestSchema.parse(input);
}
