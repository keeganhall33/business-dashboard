import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { EMPTY_CRM_DIRECTORY_INDEX_V1 } from "@/lib/relationships-crm/crm-directory-index-v1";

export default function RelationshipPeoplePage() {
  return <CrmDirectoryIndexV1 index={EMPTY_CRM_DIRECTORY_INDEX_V1} mode="PEOPLE" />;
}
