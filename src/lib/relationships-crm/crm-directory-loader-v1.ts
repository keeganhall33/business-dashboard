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
};

type RelationshipRowV1 = { contact_entity_id: string; primary_state: string; states: string[]; truth_state: string; freshness_state: string; last_meaningful_interaction_json: Record<string, unknown> | null; next_best_move_json: Record<string, unknown>; generated_at: string };
type ActivityRowV1 = { contact_entity_id: string; occurred_at: string; summary: string; truth_state: string };
type FollowUpRowV1 = { contact_entity_id: string; opportunity_id: string | null; due_at: string | null; status: string; truth_state: string; freshness_state: string };
type OpportunityLinkRowV1 = { opportunity_id: string; entity_id: string; role: string; truth_state: string; freshness_state: string };
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
    .select("id,name,organization,status,next_step,next_step_due_at,value_estimate,contact_name,contact_role,source").limit(5_000);
  if (error) throw error;
  return data ?? [];
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

function money(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
    : null;
}

function normalizedName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

function pipelinePersonRecordV1(name: string, opportunities: OpportunityRowV1[]): CrmPersonDirectoryRecordV1 {
  const primary = opportunities[0];
  const id = `pipeline-person:${normalizedName(name)}`;
  return {
    id,
    name,
    title: text(primary?.contact_role),
    companyName: text(primary?.organization),
    contactChannels: [],
    relationshipState: humanize(text(primary?.status)) ?? "Opportunity contact",
    relationshipStrength: "UNKNOWN",
    lastTouchAt: null,
    nextFollowUpAt: text(primary?.next_step_due_at),
    activeOpportunity: text(primary?.name),
    activeAsk: text(primary?.next_step),
    evidenceState: "KNOWN",
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
    relationshipState: opportunities.some((opportunity) => !/closed|lost|archived/i.test(opportunity.status)) ? "Active opportunity" : humanize(text(opportunities[0]?.status)),
    activeOpportunities: opportunities.map((opportunity) => opportunity.name),
    lastActivityAt: null,
    nextMove: opportunities.find((opportunity) => text(opportunity.next_step))?.next_step ?? null,
    supportedValue: money(valued?.value_estimate),
    evidenceState: "KNOWN",
    detailHref: crmCompanyDetailHrefV1(id)
  };
}

function toPersonRecordV1(row: CanonicalEntityRowV1, context?: {
  relationship?: RelationshipRowV1;
  activity?: ActivityRowV1;
  followUp?: FollowUpRowV1;
  opportunity?: OpportunityRowV1;
  companyName?: string | null;
}): CrmPersonDirectoryRecordV1 {
  const id = row.entity_id.trim();
  const relationship = context?.relationship;
  const linked = Boolean(context?.opportunity || context?.companyName);
  const nextMove = text(relationship?.next_best_move_json?.move);

  return {
    id,
    name: row.canonical_name.trim(),
    title: null,
    companyName: context?.companyName ?? null,
    contactChannels: [],
    relationshipState: humanize(text(relationship?.primary_state)) ?? (linked ? "Linked to active opportunity" : null),
    relationshipStrength: relationshipStrength(relationship?.states),
    lastTouchAt: text(context?.activity?.occurred_at) ?? text(relationship?.last_meaningful_interaction_json?.effectiveTimestamp),
    nextFollowUpAt: text(context?.followUp?.due_at),
    activeOpportunity: text(context?.opportunity?.name),
    activeAsk: humanize(nextMove),
    evidenceState: relationship ? evidenceState(text(relationship.truth_state), text(relationship.freshness_state)) : linked ? "KNOWN" : "KNOWN",
    detailHref: crmPersonDetailHrefV1(id)
  };
}

function toCompanyRecordV1(row: CanonicalEntityRowV1, context?: { people?: string[]; opportunities?: OpportunityRowV1[]; latestActivityAt?: string | null }): CrmCompanyDirectoryRecordV1 {
  const id = row.entity_id.trim();

  return {
    id,
    name: row.canonical_name.trim(),
    category: null,
    keyPeople: context?.people ?? [],
    relationshipState: context?.opportunities?.length ? "Active opportunity" : null,
    activeOpportunities: context?.opportunities?.map((opportunity) => opportunity.name) ?? [],
    lastActivityAt: context?.latestActivityAt ?? null,
    nextMove: context?.opportunities?.find((opportunity) => text(opportunity.next_step))?.next_step ?? null,
    supportedValue: money(context?.opportunities?.find((opportunity) => opportunity.value_estimate != null)?.value_estimate),
    evidenceState: "KNOWN",
    detailHref: crmCompanyDetailHrefV1(id)
  };
}

export async function loadCrmDirectoryIndexV1(
  dependencies: CrmDirectoryLoaderDependenciesV1 = {}
): Promise<CrmDirectoryIndexV1> {
  try {
    const injected = Boolean(dependencies.loadActiveEntities);
    const empty = async () => [] as readonly unknown[];
    const [entityValues, relationshipValues, activityValues, followUpValues, linkValues, opportunityValues] = await Promise.all([
      (dependencies.loadActiveEntities ?? queryActiveCanonicalEntitiesV1)(),
      (dependencies.loadRelationshipStates ?? (injected ? empty : queryRelationshipStatesV1))(),
      (dependencies.loadActivities ?? (injected ? empty : queryActivitiesV1))(),
      (dependencies.loadFollowUps ?? (injected ? empty : queryFollowUpsV1))(),
      (dependencies.loadOpportunityLinks ?? (injected ? empty : queryOpportunityLinksV1))(),
      (dependencies.loadOpportunities ?? (injected ? empty : queryOpportunitiesV1))()
    ]);
    const activeRows = (entityValues ?? []).filter(isActiveCanonicalEntityRowV1);
    const relationships = rows<RelationshipRowV1>(relationshipValues);
    const activities = rows<ActivityRowV1>(activityValues);
    const followUps = rows<FollowUpRowV1>(followUpValues);
    const links = rows<OpportunityLinkRowV1>(linkValues);
    const opportunities = rows<OpportunityRowV1>(opportunityValues);
    const entityNames = new Map(activeRows.map((row) => [row.entity_id, row.canonical_name]));
    const opportunitiesById = new Map(opportunities.map((row) => [String(row.id), row]));

    function linkedOpportunities(entityId: string) {
      return links.filter((link) => link.entity_id === entityId).map((link) => opportunitiesById.get(String(link.opportunity_id))).filter((value): value is OpportunityRowV1 => Boolean(value));
    }

    function linkedCompanyName(personId: string): string | null {
      const personOpportunityIds = new Set(links.filter((link) => link.entity_id === personId).map((link) => String(link.opportunity_id)));
      const organizationLink = links
        .filter((link) => personOpportunityIds.has(String(link.opportunity_id)) && link.entity_id !== personId && entityNames.has(link.entity_id))
        .sort((left, right) => ({ BRAND: 0, ORGANIZATION: 1, AGENCY: 2 }[left.role] ?? 3) - ({ BRAND: 0, ORGANIZATION: 1, AGENCY: 2 }[right.role] ?? 3))[0];
      return organizationLink ? entityNames.get(organizationLink.entity_id) ?? null : linkedOpportunities(personId)[0]?.organization ?? null;
    }

    const canonicalPeople = activeRows
        .filter((row) => row.entity_type === "person")
        .map((row) => toPersonRecordV1(row, {
          relationship: relationships.find((item) => item.contact_entity_id === row.entity_id),
          activity: activities.find((item) => item.contact_entity_id === row.entity_id),
          followUp: followUps.find((item) => item.contact_entity_id === row.entity_id),
          opportunity: linkedOpportunities(row.entity_id)[0],
          companyName: linkedCompanyName(row.entity_id)
        }));
    const canonicalCompanies = activeRows
        .filter((row) => row.entity_type === "organization")
        .map((row) => {
          const companyLinks = links.filter((link) => link.entity_id === row.entity_id);
          const opportunityIds = new Set(companyLinks.map((link) => String(link.opportunity_id)));
          const people = links.filter((link) => opportunityIds.has(String(link.opportunity_id)) && link.entity_id.startsWith("person:"))
            .map((link) => entityNames.get(link.entity_id)).filter((name): name is string => Boolean(name));
          const companyOpportunities = [...opportunityIds].map((id) => opportunitiesById.get(id)).filter((value): value is OpportunityRowV1 => Boolean(value));
          const latestActivityAt = activities.find((activity) => links.some((link) => link.entity_id === activity.contact_entity_id && opportunityIds.has(String(link.opportunity_id))))?.occurred_at ?? null;
          return toCompanyRecordV1(row, { people: [...new Set(people)], opportunities: companyOpportunities, latestActivityAt });
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
      people: [...canonicalPeople, ...[...pipelinePeople.values()].map((entry) => pipelinePersonRecordV1(entry.name, entry.opportunities))],
      companies: [...canonicalCompanies, ...[...pipelineCompanies.values()].map((entry) => pipelineCompanyRecordV1(entry.name, entry.opportunities))]
    });
  } catch {
    return EMPTY_CRM_DIRECTORY_INDEX_V1;
  }
}
