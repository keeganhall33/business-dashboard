import type { ContactDecisionProfileV1, FunnelKitShadowPayloadV1 } from "@/lib/lifecycle-marketing/funnelkit/shadow-bridge/contact-decision-profile.contract";

function normArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => Boolean(v));
}

function toStringField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

export function buildFunnelKitShadowPayloadV1(profile: ContactDecisionProfileV1): FunnelKitShadowPayloadV1 {
  const unknowns: string[] = [];

  const fields: Record<string, string> = {};

  // Hard invariants.
  const mode = "SHADOW" as const;
  const live_send_enabled = false as const;

  // Identity.
  fields["contact.contact_id"] = profile.contact_id;

  if (profile.email) fields["contact.email"] = profile.email;
  else unknowns.push("contact.email");

  const first = profile.first_name ?? null;
  const last = profile.last_name ?? null;
  if (first) fields["contact.first_name"] = first;
  else unknowns.push("contact.first_name");
  if (last) fields["contact.last_name"] = last;
  else unknowns.push("contact.last_name");

  // Decision tags (flat, stable).
  const decisionTags = normArray(profile.decision_tags);
  if (decisionTags.length) fields["decision.tags"] = decisionTags.join(",");
  else unknowns.push("decision.tags");

  const segments = normArray(profile.preferred_segments);
  if (segments.length) fields["decision.segments"] = segments.join(",");
  else unknowns.push("decision.segments");

  if (profile.last_purchase_at) fields["commerce.last_purchase_at"] = profile.last_purchase_at;
  else unknowns.push("commerce.last_purchase_at");

  // Custom fields are namespaced and stringified; unknown/non-scalar values are omitted.
  const custom = profile.custom_fields ?? null;
  if (!custom) {
    unknowns.push("custom_fields");
  } else {
    const keys = Object.keys(custom).sort((a, b) => a.localeCompare(b));
    for (const k of keys) {
      const v = toStringField(custom[k]);
      if (v == null) continue;
      fields[`custom.${k}`] = v;
    }
  }

  return {
    mode,
    live_send_enabled,
    fields,
    meta: {
      schema_version: "funnelkit_shadow_payload_v1",
      contact_id: profile.contact_id,
      mapping_version: "fk_shadow_map_v1",
      unknowns: [...new Set(unknowns)].sort((a, b) => a.localeCompare(b))
    }
  };
}
