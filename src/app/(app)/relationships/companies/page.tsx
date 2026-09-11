import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export default async function RelationshipCompaniesPage() {
  const index = await loadCrmDirectoryIndexV1();
  return <CrmDirectoryIndexV1 index={index} mode="COMPANIES" />;
}
