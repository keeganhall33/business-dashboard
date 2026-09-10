import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildProductionOpportunityRadarV1,
  type CanonicalExternalEventRowV1
} from "@/lib/discovery-intelligence/production-opportunity-radar/engine";

const MAX_EVENTS = 250;
const client = getSupabaseServerClient();
const events = await client
  .from("external_events_v1")
  .select("event_id,event_type,lifecycle_status,current_content_hash")
  .eq("lifecycle_status", "active")
  .order("created_at", { ascending: false })
  .limit(MAX_EVENTS);

if (events.error) throw new Error(`PRODUCTION_RADAR_EVENT_READ_FAILED:${events.error.code ?? "UNKNOWN"}`);
const eventRows = events.data ?? [];
const ids = eventRows.map((row) => String(row.event_id));
let rows: CanonicalExternalEventRowV1[] = [];

if (ids.length > 0) {
  const versions = await client
    .from("external_event_versions_v1")
    .select("event_id,content_hash,schema_version,policy_version,created_at,payload_json")
    .in("event_id", ids)
    .limit(MAX_EVENTS * 4);
  if (versions.error) throw new Error(`PRODUCTION_RADAR_VERSION_READ_FAILED:${versions.error.code ?? "UNKNOWN"}`);
  const current = new Map(eventRows.map((row) => [String(row.event_id), row]));
  rows = (versions.data ?? []).flatMap((version) => {
    const event = current.get(String(version.event_id));
    if (!event || String(event.current_content_hash) !== String(version.content_hash)) return [];
    return [{
      event_id: String(event.event_id),
      event_type: String(event.event_type),
      lifecycle_status: String(event.lifecycle_status),
      current_content_hash: String(event.current_content_hash),
      content_hash: String(version.content_hash),
      schema_version: String(version.schema_version),
      policy_version: String(version.policy_version),
      created_at: version.created_at == null ? null : String(version.created_at),
      payload_json: version.payload_json
    }];
  });
}

const result = buildProductionOpportunityRadarV1({ rows, nowIso: new Date().toISOString(), limit: 5 });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.proof_status !== "LIVE_PRECISION_PROVEN") process.exitCode = 2;
