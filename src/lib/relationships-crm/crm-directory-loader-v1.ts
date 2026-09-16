import "@/lib/server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  EMPTY_CRM_DIRECTORY_INDEX_V1,
  buildCrmDirectoryIndexV1,
  crmCompanyDetailHrefV1,
  crmPersonDetailHrefV1,
  type CrmCompanyDirectoryRecordV1,
  type CrmDirectoryIndexV1,
  type CrmPersonDirectoryRecordV1
} from "@/lib/relationships-crm/crm-directory-index-v1";

type CanonicalEntityRowV1 = {
  entity_id: string;
  entity_type: "organization" | "person";
  canonical_name: string;
  resolution_status: "active";
};

export type CrmDirectoryLoaderDependenciesV1 = {
  loadActiveEntities?: () => Promise<readonly unknown[] | null>;
  loadRelationshipStates?: () => Promise<readonly unknown[] | null>;
  loadActivities?: () => Promise<readonly unknown[] | null>;
  loadFollowUps?: () => Promise<readonly unknown[] | null>;
  loadOpportunityLinks?: () => Promise<readonly unknown[] | null>;
  loadOpportunities?: () => Promise<readonly unknown[] | null>;
  loadProfiles?: () => Promise<readonly unknown[] | null>;
  loadEntityLinks?: () => Promise<readonly unknown[] | null>;
};

type RelationshipRowV1 = { contact_entity_id: string; primary_state: string; states: string[]; truth_state: string; freshness_state: string; last_meaningful_interaction_json: Record<string, unknown> | null; next_best_move_json: Record<string, unknown>; generated_at: string };
type ActivityRowV1 = { contact_entity_id: string; occurred_at: string; summary: string; truth_state: string };
type FollowUpRowV1 = { contact_entity_id: string; opportunity_id: string | null; due_at: string | null; status: string; truth_state: string; freshness_state: string };
type OpportunityLinkRowV1 = { opportunity_id: string; entity_id: string; role: string; truth_state: string; freshness_state: string };
type EntityProfileRowV1 = { entity_id: string; title: string | null; category: string | null; primary_email: string | null; phone: string | null; linkedin_url: string | null; website_url: string | null; notes_md: string | null; relationship_state: string | null; relationship_quality: string | null; last_touch_at: string | null; next_follow_up_at: string | null; next_move: string | null; supported_value: number | null };
type EntityLinkRowV1 = { subject_entity_id: string; relationship_type: string; object_entity_id: string; role_title: string | null; is_primary: boolean };
type OpportunityRowV1 = {
  id: string;
  name: string;
  organization: string | null;
  status: string;
  next_step: string | null;
  next_step_due_at: string | null;
  value_estimate: number | null;
  contact_name: string | null;
  contact_role: string | null;
  source: string | null;
  updated_at: string | null;
};

function isActiveCanonicalEntityRowV1(value: unknown): value is CanonicalEntityRowV1 {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;

  return (
    typeof row.entity_id === "string" &&
    row.entity_id.trim().length > 0 &&
    (row.entity_type === "organization" || row.entity_type === "person") &&
    typeof row.canonical_name === "string" &&
    row.canonical_name.trim().length > 0 &&
    row.resolution_status === "active"
  );
}

async function queryActiveCanonicalEntitiesV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient()
    .from("entities_v1")
    .select("entity_id,entity_type,canonical_name,resolution_status")
    .eq("resolution_status", "active")
    .in("entity_type", ["person", "organization"]);

  if (error) throw error;
  return data ?? [];
}

async function queryRelationshipStatesV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_relationship_states_v1")
    .select("contact_entity_id,primary_state,states,truth_state,freshness_state,last_meaningful_interaction_json,next_best_move_json,generated_at")
    .order("generated_at", { ascending: false }).limit(5_000);
  if (error) throw error;
  return data ?? [];
}

async function queryActivitiesV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_activities_v1")
    .select("contact_entity_id,occurred_at,summary,truth_state").order("occurred_at", { ascending: false }).limit(10_000);
  if (error) throw error;
  return data ?? [];
}

async function queryFollowUpsV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_follow_ups_v1")
    .select("contact_entity_id,opportunity_id,due_at,status,truth_state,freshness_state").eq("status", "OPEN").order("due_at").limit(10_000);
  if (error) throw error;
  return data ?? [];
}

async function queryOpportunityLinksV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_opportunity_entities_v1")
    .select("opportunity_id,entity_id,role,truth_state,freshness_state").limit(10_000);
  if (error) throw error;
  return data ?? [];
}

async function queryOpportunitiesV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("opportunity_pipeline")
    .select("id,name,organization,status,next_step,next_step_due_at,value_estimate,contact_name,contact_role,source,updated_at").limit(5_000);
  if (error) throw error;
  return data ?? [];
}

async function queryEntityProfilesV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_entity_profiles_v1")
    .select("entity_id,title,category,primary_email,phone,linkedin_url,website_url,notes_md,relationship_state,relationship_quality,last_touch_at,next_follow_up_at,next_move,supported_value").limit(10_000);
  if (error) {
    console.warn("[crm-directory] optional profile metadata unavailable", {
      code: error.code ?? null,
      message: error.message
    });
    return [];
  }
  return data ?? [];
}

async function queryEntityLinksV1(): Promise<readonly unknown[]> {
  const { data, error } = await getSupabaseServerClient().from("crm_entity_links_v1")
    .select("subject_entity_id,relationship_type,object_entity_id,role_title,is_primary").limit(10_000);
  if (error) {
    console.warn("[crm-directory] optional entity links unavailable", {
      code: error.code ?? null,
      message: error.message
    });
    return [];
  }
  return data ?? [];
}

async function loadOptionalCrmMetadataV1(
  label: "profiles" | "entity links",
  loader: () => Promise<readonly unknown[] | null>
): Promise<readonly unknown[]> {
  try {
    return (await loader()) ?? [];
  } catch (error) {
    console.warn(`[crm-directory] optional ${label} loader failed`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rows<T>(values: readonly unknown[] | null): T[] {
  return (values ?? []).filter((value) => record(value) != null) as T[];
}

function humanize(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function evidenceState(truth: string | null, freshness: string | null): CrmPersonDirectoryRecordV1["evidenceState"] {
  if (truth === "CONFLICTED") return "CONFLICTED";
  if (freshness === "STALE") return "STALE";
  if (truth === "KNOWN") return "KNOWN";
  return "UNKNOWN";
}

function relationshipStrength(states: readonly string[] | null | undefined): CrmPersonDirectoryRecordV1["relationshipStrength"] {
  if (states?.includes("HIGH_VALUE")) return "HIGH";
  if (states?.length) return "MEDIUM";
  return "UNKNOWN";
}

function profileRelationshipStrength(value: string | null | undefined): CrmPersonDirectoryRecordV1["relationshipStrength"] | null {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : null;
}

function money(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
    : null;
}

function normalizedName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

function isEngagedOpportunityV1(opportunity: OpportunityRowV1) {
  return !/^(research|researching|ready_for_research|archived|lost|won|parked)$/i.test(opportunity.status.trim());
}

function pipelineEvidenceStateV1(opportunity: OpportunityRowV1): CrmPersonDirectoryRecordV1["evidenceState"] {
  const updatedAt = text(opportunity.updated_at);
  const dueAt = text(opportunity.next_step_due_at);
  const now = Date.now();
  const isOld = updatedAt ? now - Date.parse(updatedAt) > 21 * 86_400_000 : true;
  const isOverdue = dueAt ? Date.parse(dueAt) < now : false;
  return isOld || isOverdue ? "STALE" : /keegan[_ -]?confirmed|user[_ -]?confirmed/i.test(opportunity.source ?? "") ? "KNOWN" : "UNKNOWN";
}

function pipelinePersonRecordV1(name: string, opportunities: OpportunityRowV1[]): CrmPersonDirectoryRecordV1 {
  const primary = opportunities[0];
  const evidence = pipelineEvidenceStateV1(primary);
  const id = `pipeline-person:${normalizedName(name)}`;
  return {
    id,
    name,
    title: text(primary?.contact_role),
    companyName: text(primary?.organization),
    companyId: null,
    companyHref: null,
    contactChannels: [],
    relationshipState: humanize(text(primary?.status)) ?? "Opportunity contact",
    relationshipStrength: "UNKNOWN",
    lastTouchAt: null,
    nextFollowUpAt: text(primary?.next_step_due_at),
    activeOpportunity: text(primary?.name),
    activeOpportunityHref: primary?.id ? `/opportunities-actions/opportunity/${encodeURIComponent(primary.id)}` : null,
    activeAsk: evidence === "STALE" ? "Review and update this record before acting." : text(primary?.next_step),
    evidenceState: evidence,
    notesMd: null,
    detailHref: crmPersonDetailHrefV1(id)
  };
}

function pipelineCompanyRecordV1(name: string, opportunities: OpportunityRowV1[]): CrmCompanyDirectoryRecordV1 {
  const id = `pipeline-company:${normalizedName(name)}`;
  const valued = opportunities.find((opportunity) => opportunity.value_estimate != null);
  return {
    id,
    name,
    category: null,
    keyPeople: [...new Set(opportunities.map((opportunity) => text(opportunity.contact_name)).filter((value): value is string => Boolean(value)))],
    keyPeopleLinks: [],
    relationshipState: opportunities.some((opportunity) => !/closed|lost|archived/i.test(opportunity.status)) ? "Active opportunity" : humanize(text(opportunities[0]?.status)),
    activeOpportunities: opportunities.map((opportunity) => opportunity.name),
    activeOpportunityLinks: opportunities.map((opportunity) => ({ id: opportunity.id, label: opportunity.name, href: `/opportunities-actions/opportunity/${encodeURIComponent(opportunity.id)}` })),
    lastActivityAt: null,
    nextMove: opportunities.some((opportunity) => pipelineEvidenceStateV1(opportunity) === "STALE") ? "Review and update stale relationship records." : opportunities.find((opportunity) => text(opportunity.next_step))?.next_step ?? null,
    supportedValue: money(valued?.value_estimate),
    evidenceState: opportunities.some((opportunity) => pipelineEvidenceStateV1(opportunity) === "STALE") ? "STALE" : opportunities.every((opportunity) => pipelineEvidenceStateV1(opportunity) === "KNOWN") ? "KNOWN" : "UNKNOWN",
    primaryEmail: null,
    phone: null,
    websiteUrl: null,
    notesMd: null,
    relatedCompanies: [],
    detailHref: crmCompanyDetailHrefV1(id)
  };
}

function toPersonRecordV1(row: CanonicalEntityRowV1, context?: {
  relationship?: RelationshipRowV1;
  activity?: ActivityRowV1;
  followUp?: FollowUpRowV1;
  opportunity?: OpportunityRowV1;
  companyName?: string | null;
  companyId?: string | null;
  profile?: EntityProfileRowV1;
}): CrmPersonDirectoryRecordV1 {
  const id = row.entity_id.trim();
  const relationship = context?.relationship;
  const linked = Boolean(context?.opportunity || context?.companyName);
  const nextMove = text(relationship?.next_best_move_json?.move);

  return {
    id,
    name: row.canonical_name.trim(),
    title: text(context?.profile?.title),
    companyName: context?.companyName ?? null,
    companyId: context?.companyId ?? null,
    companyHref: context?.companyId ? crmCompanyDetailHrefV1(context.companyId) : null,
    contactChannels: [
      context?.profile?.primary_email ? { kind: "EMAIL" as const, value: context.profile.primary_email, evidenceState: "KNOWN" as const } : null,
      context?.profile?.phone ? { kind: "PHONE" as const, value: context.profile.phone, evidenceState: "KNOWN" as const } : null,
      context?.profile?.linkedin_url ? { kind: "LINKEDIN" as const, value: context.profile.linkedin_url, evidenceState: "KNOWN" as const } : null
    ].filter((channel): channel is NonNullable<typeof channel> => Boolean(channel)),
    relationshipState: text(context?.profile?.relationship_state) ?? humanize(text(relationship?.primary_state)),
    relationshipStrength: profileRelationshipStrength(context?.profile?.relationship_quality) ?? relationshipStrength(relationship?.states),
    lastTouchAt: text(context?.profile?.last_touch_at) ?? text(context?.activity?.occurred_at) ?? text(relationship?.last_meaningful_interaction_json?.effectiveTimestamp),
    nextFollowUpAt: text(context?.profile?.next_follow_up_at) ?? text(context?.followUp?.due_at),
    activeOpportunity: text(context?.opportunity?.name),
    activeOpportunityHref: context?.opportunity?.id ? `/opportunities-actions/opportunity/${encodeURIComponent(context.opportunity.id)}` : null,
    activeAsk: text(context?.profile?.next_move) ?? humanize(nextMove),
    evidenceState: relationship ? evidenceState(text(relationship.truth_state), text(relationship.freshness_state)) : linked ? "KNOWN" : "KNOWN",
    notesMd: text(context?.profile?.notes_md),
    detailHref: crmPersonDetailHrefV1(id)
  };
}

function toCompanyRecordV1(row: CanonicalEntityRowV1, context?: { people?: Array<{ id: string; name: string }>; opportunities?: OpportunityRowV1[]; latestActivityAt?: string | null; profile?: EntityProfileRowV1; relatedCompanies?: Array<{ id: string; label: string; relationship: string }> }): CrmCompanyDirectoryRecordV1 {
  const id = row.entity_id.trim();

  return {
    id,
    name: row.canonical_name.trim(),
    category: text(context?.profile?.category),
    keyPeople: context?.people?.map((person) => person.name) ?? [],
    keyPeopleLinks: context?.people?.map((person) => ({ id: person.id, label: person.name, href: crmPersonDetailHrefV1(person.id) })) ?? [],
    relationshipState: text(context?.profile?.relationship_state) ?? (context?.opportunities?.length ? "Active opportunity" : null),
    relationshipStrength: profileRelationshipStrength(context?.profile?.relationship_quality) ?? "UNKNOWN",
    activeOpportunities: context?.opportunities?.map((opportunity) => opportunity.name) ?? [],
    activeOpportunityLinks: context?.opportunities?.map((opportunity) => ({ id: opportunity.id, label: opportunity.name, href: `/opportunities-actions/opportunity/${encodeURIComponent(opportunity.id)}` })) ?? [],
    lastActivityAt: text(context?.profile?.last_touch_at) ?? context?.latestActivityAt ?? null,
    nextFollowUpAt: text(context?.profile?.next_follow_up_at),
    nextMove: text(context?.profile?.next_move) ?? context?.opportunities?.find((opportunity) => text(opportunity.next_step))?.next_step ?? null,
    supportedValue: money(context?.profile?.supported_value ?? context?.opportunities?.find((opportunity) => opportunity.value_estimate != null)?.value_estimate),
    evidenceState: "KNOWN",
    primaryEmail: text(context?.profile?.primary_email),
    phone: text(context?.profile?.phone),
    websiteUrl: text(context?.profile?.website_url),
    notesMd: text(context?.profile?.notes_md),
    relatedCompanies: context?.relatedCompanies?.map((company) => ({ ...company, href: crmCompanyDetailHrefV1(company.id) })) ?? [],
    detailHref: crmCompanyDetailHrefV1(id)
  };
}

export async function loadCrmDirectoryIndexV1(
  dependencies: CrmDirectoryLoaderDependenciesV1 = {}
): Promise<CrmDirectoryIndexV1> {
  try {
    const injected = Boolean(dependencies.loadActiveEntities);
    const empty = async () => [] as readonly unknown[];
    const [entityValues, relationshipValues, activityValues, followUpValues, linkValues, opportunityValues, profileValues, entityLinkValues] = await Promise.all([
      (dependencies.loadActiveEntities ?? queryActiveCanonicalEntitiesV1)(),
      (dependencies.loadRelationshipStates ?? (injected ? empty : queryRelationshipStatesV1))(),
      (dependencies.loadActivities ?? (injected ? empty : queryActivitiesV1))(),
      (dependencies.loadFollowUps ?? (injected ? empty : queryFollowUpsV1))(),
      (dependencies.loadOpportunityLinks ?? (injected ? empty : queryOpportunityLinksV1))(),
      (dependencies.loadOpportunities ?? (injected ? empty : queryOpportunitiesV1))(),
      loadOptionalCrmMetadataV1("profiles", dependencies.loadProfiles ?? (injected ? empty : queryEntityProfilesV1)),
      loadOptionalCrmMetadataV1("entity links", dependencies.loadEntityLinks ?? (injected ? empty : queryEntityLinksV1))
    ]);
    const activeRows = (entityValues ?? []).filter(isActiveCanonicalEntityRowV1);
    const relationships = rows<RelationshipRowV1>(relationshipValues);
    const activities = rows<ActivityRowV1>(activityValues);
    const followUps = rows<FollowUpRowV1>(followUpValues);
    const links = rows<OpportunityLinkRowV1>(linkValues);
    const opportunities = rows<OpportunityRowV1>(opportunityValues).filter(isEngagedOpportunityV1);
    const profiles = rows<EntityProfileRowV1>(profileValues);
    const entityLinks = rows<EntityLinkRowV1>(entityLinkValues);
    const entityNames = new Map(activeRows.map((row) => [row.entity_id, row.canonical_name]));
    const opportunitiesById = new Map(opportunities.map((row) => [String(row.id), row]));

    function linkedOpportunities(entityId: string) {
      return links.filter((link) => link.entity_id === entityId).map((link) => opportunitiesById.get(String(link.opportunity_id))).filter((value): value is OpportunityRowV1 => Boolean(value));
    }

    function linkedCompany(personId: string): { id: string; name: string } | null {
      const direct = entityLinks.find((link) => link.subject_entity_id === personId && link.relationship_type === "WORKS_AT" && link.is_primary)
        ?? entityLinks.find((link) => link.subject_entity_id === personId && link.relationship_type === "WORKS_AT");
      if (direct) {
        const name = entityNames.get(direct.object_entity_id);
        if (name) return { id: direct.object_entity_id, name };
      }
      const personOpportunityIds = new Set(links.filter((link) => link.entity_id === personId).map((link) => String(link.opportunity_id)));
      const organizationLink = links
        .filter((link) => personOpportunityIds.has(String(link.opportunity_id)) && link.entity_id !== personId && entityNames.has(link.entity_id))
        .sort((left, right) => ({ BRAND: 0, ORGANIZATION: 1, AGENCY: 2 }[left.role] ?? 3) - ({ BRAND: 0, ORGANIZATION: 1, AGENCY: 2 }[right.role] ?? 3))[0];
      if (organizationLink) return { id: organizationLink.entity_id, name: entityNames.get(organizationLink.entity_id) ?? "Company" };
      return linkedOpportunities(personId)[0]?.organization ? { id: "", name: linkedOpportunities(personId)[0].organization! } : null;
    }

    const canonicalPeople = activeRows
      .filter((row) => row.entity_type === "person")
      .map((row) => {
        const company = linkedCompany(row.entity_id);
        return toPersonRecordV1(row, {
          relationship: relationships.find((item) => item.contact_entity_id === row.entity_id),
          activity: activities.find((item) => item.contact_entity_id === row.entity_id),
          followUp: followUps.find((item) => item.contact_entity_id === row.entity_id),
          opportunity: linkedOpportunities(row.entity_id)[0],
          companyName: company?.name ?? null,
          companyId: company?.id || null,
          profile: profiles.find((profile) => profile.entity_id === row.entity_id)
        });
      });
    const canonicalCompanies = activeRows
        .filter((row) => row.entity_type === "organization")
        .map((row) => {
          const companyLinks = links.filter((link) => link.entity_id === row.entity_id);
          const opportunityIds = new Set(companyLinks.map((link) => String(link.opportunity_id)));
          const directPeople = entityLinks.filter((link) => link.object_entity_id === row.entity_id && link.relationship_type === "WORKS_AT")
            .map((link) => ({ id: link.subject_entity_id, name: entityNames.get(link.subject_entity_id) ?? "" })).filter((person) => Boolean(person.name));
          const opportunityPeople = links.filter((link) => opportunityIds.has(String(link.opportunity_id)) && link.entity_id.startsWith("person:"))
            .map((link) => ({ id: link.entity_id, name: entityNames.get(link.entity_id) ?? "" })).filter((person) => Boolean(person.name));
          const people = [...new Map([...directPeople, ...opportunityPeople].map((person) => [person.id, person])).values()];
          const companyOpportunities = [...opportunityIds].map((id) => opportunitiesById.get(id)).filter((value): value is OpportunityRowV1 => Boolean(value));
          const latestActivityAt = activities.find((activity) => links.some((link) => link.entity_id === activity.contact_entity_id && opportunityIds.has(String(link.opportunity_id))))?.occurred_at ?? null;
          const relatedCompanies = entityLinks.filter((link) => link.subject_entity_id === row.entity_id || link.object_entity_id === row.entity_id)
            .map((link) => {
              const relatedId = link.subject_entity_id === row.entity_id ? link.object_entity_id : link.subject_entity_id;
              return { id: relatedId, label: entityNames.get(relatedId) ?? "", relationship: humanize(link.relationship_type) ?? link.relationship_type };
            }).filter((company) => Boolean(company.label) && company.id.startsWith("organization:"));
          return toCompanyRecordV1(row, { people, opportunities: companyOpportunities, latestActivityAt, profile: profiles.find((profile) => profile.entity_id === row.entity_id), relatedCompanies });
        });

    const canonicalPersonNames = new Set(canonicalPeople.map((person) => normalizedName(person.name)));
    const canonicalCompanyNames = new Set(canonicalCompanies.map((company) => normalizedName(company.name)));
    const pipelinePeople = new Map<string, { name: string; opportunities: OpportunityRowV1[] }>();
    const pipelineCompanies = new Map<string, { name: string; opportunities: OpportunityRowV1[] }>();

    for (const opportunity of opportunities) {
      const personName = text(opportunity.contact_name);
      const personKey = normalizedName(personName);
      if (personName && personKey && !canonicalPersonNames.has(personKey)) {
        const entry = pipelinePeople.get(personKey) ?? { name: personName, opportunities: [] };
        entry.opportunities.push(opportunity);
        pipelinePeople.set(personKey, entry);
      }

      const companyName = text(opportunity.organization);
      const companyKey = normalizedName(companyName);
      if (companyName && companyKey && !canonicalCompanyNames.has(companyKey)) {
        const entry = pipelineCompanies.get(companyKey) ?? { name: companyName, opportunities: [] };
        entry.opportunities.push(opportunity);
        pipelineCompanies.set(companyKey, entry);
      }
    }

    return buildCrmDirectoryIndexV1({
      people: [
        ...canonicalPeople.filter((person) => profiles.some((profile) => profile.entity_id === person.id) || Boolean(person.relationshipState || person.lastTouchAt || person.nextFollowUpAt || person.activeOpportunity)),
        ...[...pipelinePeople.values()].map((entry) => pipelinePersonRecordV1(entry.name, entry.opportunities))
      ],
      companies: [
        ...canonicalCompanies.filter((company) => profiles.some((profile) => profile.entity_id === company.id) || Boolean(company.keyPeople.length || company.activeOpportunities.length || company.lastActivityAt)),
        ...[...pipelineCompanies.values()].map((entry) => pipelineCompanyRecordV1(entry.name, entry.opportunities))
      ]
    });
  } catch {
    return EMPTY_CRM_DIRECTORY_INDEX_V1;
  }
}
