"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const crmEntityInputSchema = z.object({
  id: z.string().trim().max(240).nullable().optional(),
  entityType: z.enum(["person", "organization"]),
  name: z.string().trim().min(1).max(200),
  title: optionalText(200),
  category: optionalText(200),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]).nullable().optional(),
  phone: optionalText(80),
  linkedinUrl: optionalText(500),
  websiteUrl: optionalText(500),
  notes: optionalText(10_000),
  companyName: optionalText(240),
  relationshipState: optionalText(200),
  relationshipQuality: z.enum(["", "LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  lastTouchAt: optionalText(40),
  nextFollowUpAt: optionalText(40),
  nextMove: optionalText(2_000),
  supportedValue: z.union([z.number().nonnegative(), z.null()]).optional()
});

export type CrmEntityMutationInputV1 = z.input<typeof crmEntityInputSchema>;
export type CrmEntityMutationResultV1 = { ok: true; id: string } | { ok: false; message: string };

function value(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "record";
}

function canonicalId(type: "person" | "organization", name: string) {
  return `${type}:${slug(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function resolveCompanyIdV1(companyName: string | null): Promise<string | null> {
  if (!companyName) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("entities_v1")
    .select("entity_id,canonical_name")
    .eq("entity_type", "organization")
    .eq("resolution_status", "active")
    .limit(5_000);
  if (error) throw error;
  const normalizedName = companyName.toLocaleLowerCase("en-US");
  const existingCompany = data?.find((company) => company.canonical_name.trim().toLocaleLowerCase("en-US") === normalizedName);
  if (existingCompany?.entity_id) return String(existingCompany.entity_id);

  const id = canonicalId("organization", companyName);
  const { error: createError } = await supabase.from("entities_v1").insert({
    entity_id: id,
    entity_type: "organization",
    canonical_name: companyName,
    resolution_status: "active"
  });
  if (createError) throw createError;
  const { error: profileError } = await supabase.from("crm_entity_profiles_v1").upsert({
    entity_id: id,
    source: "DASHBOARD_MANUAL"
  }, { onConflict: "entity_id" });
  if (profileError) throw profileError;
  return id;
}

function isCanonicalId(id: string | null | undefined) {
  return Boolean(id && (id.startsWith("person:") || id.startsWith("organization:")));
}

function refreshCrmPaths(id?: string) {
  revalidatePath("/relationships");
  revalidatePath("/relationships/people");
  revalidatePath("/relationships/companies");
  if (id) {
    revalidatePath(`/relationships/people/${encodeURIComponent(id)}`);
    revalidatePath(`/relationships/companies/${encodeURIComponent(id)}`);
  }
}

export async function saveCrmEntityActionV1(input: CrmEntityMutationInputV1): Promise<CrmEntityMutationResultV1> {
  const parsed = crmEntityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the record and try again." };

  try {
    const supabase = getSupabaseServerClient();
    const existingId = value(parsed.data.id);
    const id = isCanonicalId(existingId) ? existingId! : canonicalId(parsed.data.entityType, parsed.data.name);
    const { error: entityError } = await supabase.from("entities_v1").upsert({
      entity_id: id,
      entity_type: parsed.data.entityType,
      canonical_name: parsed.data.name,
      resolution_status: "active"
    }, { onConflict: "entity_id" });
    if (entityError) throw entityError;

    const { error: profileError } = await supabase.from("crm_entity_profiles_v1").upsert({
      entity_id: id,
      title: value(parsed.data.title),
      category: value(parsed.data.category),
      primary_email: value(parsed.data.email),
      phone: value(parsed.data.phone),
      linkedin_url: value(parsed.data.linkedinUrl),
      website_url: value(parsed.data.websiteUrl),
      notes_md: value(parsed.data.notes),
      relationship_state: value(parsed.data.relationshipState),
      relationship_quality: value(parsed.data.relationshipQuality),
      last_touch_at: value(parsed.data.lastTouchAt),
      next_follow_up_at: value(parsed.data.nextFollowUpAt),
      next_move: value(parsed.data.nextMove),
      supported_value: parsed.data.supportedValue ?? null,
      source: "DASHBOARD_MANUAL"
    }, { onConflict: "entity_id" });
    if (profileError) throw profileError;

    if (parsed.data.entityType === "person") {
      const companyId = await resolveCompanyIdV1(value(parsed.data.companyName));
      const { error: clearError } = await supabase.from("crm_entity_links_v1")
        .delete().eq("subject_entity_id", id).eq("relationship_type", "WORKS_AT").eq("is_primary", true);
      if (clearError) throw clearError;
      if (companyId) {
        const { error: linkError } = await supabase.from("crm_entity_links_v1").upsert({
          subject_entity_id: id,
          relationship_type: "WORKS_AT",
          object_entity_id: companyId,
          role_title: value(parsed.data.title),
          is_primary: true,
          source: "DASHBOARD_MANUAL"
        }, { onConflict: "subject_entity_id,relationship_type,object_entity_id" });
        if (linkError) throw linkError;
      }
    }

    refreshCrmPaths(id);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The CRM record could not be saved." };
  }
}

export async function retireCrmEntityActionV1(rawId: string): Promise<CrmEntityMutationResultV1> {
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!isCanonicalId(id)) return { ok: false, message: "Save this imported record before removing it." };
  try {
    const { error } = await getSupabaseServerClient().from("entities_v1")
      .update({ resolution_status: "retired" }).eq("entity_id", id);
    if (error) throw error;
    refreshCrmPaths(id);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The CRM record could not be removed." };
  }
}
