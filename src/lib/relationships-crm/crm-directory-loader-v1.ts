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
    .eq("resolution_status", "active");

  if (error) throw error;
  return data ?? [];
}

function toPersonRecordV1(row: CanonicalEntityRowV1): CrmPersonDirectoryRecordV1 {
  const id = row.entity_id.trim();

  return {
    id,
    name: row.canonical_name.trim(),
    title: null,
    companyName: null,
    contactChannels: [],
    relationshipState: null,
    relationshipStrength: "UNKNOWN",
    lastTouchAt: null,
    nextFollowUpAt: null,
    activeOpportunity: null,
    activeAsk: null,
    evidenceState: "KNOWN",
    detailHref: crmPersonDetailHrefV1(id)
  };
}

function toCompanyRecordV1(row: CanonicalEntityRowV1): CrmCompanyDirectoryRecordV1 {
  const id = row.entity_id.trim();

  return {
    id,
    name: row.canonical_name.trim(),
    category: null,
    keyPeople: [],
    relationshipState: null,
    activeOpportunities: [],
    lastActivityAt: null,
    nextMove: null,
    supportedValue: null,
    evidenceState: "KNOWN",
    detailHref: crmCompanyDetailHrefV1(id)
  };
}

export async function loadCrmDirectoryIndexV1(
  dependencies: CrmDirectoryLoaderDependenciesV1 = {}
): Promise<CrmDirectoryIndexV1> {
  try {
    const rows = await (dependencies.loadActiveEntities ?? queryActiveCanonicalEntitiesV1)();
    const activeRows = (rows ?? []).filter(isActiveCanonicalEntityRowV1);

    return buildCrmDirectoryIndexV1({
      people: activeRows
        .filter((row) => row.entity_type === "person")
        .map(toPersonRecordV1),
      companies: activeRows
        .filter((row) => row.entity_type === "organization")
        .map(toCompanyRecordV1)
    });
  } catch {
    return EMPTY_CRM_DIRECTORY_INDEX_V1;
  }
}
