import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export default async function RelationshipPeoplePage({ searchParams }: { searchParams?: Promise<{ q?: string | string[] }> } = {}) {
  const index = await loadCrmDirectoryIndexV1();
  const params = await searchParams;
  return <CrmDirectoryIndexV1 index={index} mode="PEOPLE" query={typeof params?.q === "string" ? params.q : ""} />;
}
