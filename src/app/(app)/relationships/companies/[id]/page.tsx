import { notFound } from "next/navigation";

import { CrmCompanyDetailV1 } from "@/components/relationships-crm/CrmCompanyDetailV1";
import { EMPTY_CRM_DIRECTORY_INDEX_V1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import { resolveCrmCompanyDetailV1 } from "@/lib/relationships-crm/crm-company-detail-v1";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RelationshipCompanyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const company = resolveCrmCompanyDetailV1(EMPTY_CRM_DIRECTORY_INDEX_V1, id);

  if (!company) notFound();

  return <CrmCompanyDetailV1 company={company} />;
}
