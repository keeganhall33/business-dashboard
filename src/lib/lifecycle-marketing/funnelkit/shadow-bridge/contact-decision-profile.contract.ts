export type ShadowModeV1 = "SHADOW";

export type ContactDecisionProfileV1 = {
  contact_id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;

  // Decision-profile signals (minimal for Phase 1 mapping; keep optional/unknown explicit)
  decision_tags?: string[] | null;
  preferred_segments?: string[] | null;
  last_purchase_at?: string | null; // ISO timestamp

  custom_fields?: Record<string, string | number | boolean | null> | null;
};

export type FunnelKitShadowPayloadV1 = {
  mode: ShadowModeV1;
  live_send_enabled: false;
  fields: Record<string, string>;
  meta: {
    schema_version: "funnelkit_shadow_payload_v1";
    contact_id: string;
    mapping_version: "fk_shadow_map_v1";
    unknowns: string[];
  };
};
