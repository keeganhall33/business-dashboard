import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export default async function RelationshipCompaniesPage({ searchParams }: { searchParams?: Promise<{ q?: string | string[] }> }) {
  const index = await loadCrmDirectoryIndexV1();
  const params = await searchParams;
  return <CrmDirectoryIndexV1 index={index} mode="COMPANIES" query={typeof params?.q === "string" ? params.q : ""} />;
}
