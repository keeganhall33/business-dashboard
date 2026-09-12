import { notFound } from "next/navigation";

import { CrmCompanyDetailV1 } from "@/components/relationships-crm/CrmCompanyDetailV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";
import { resolveCrmCompanyDetailV1 } from "@/lib/relationships-crm/crm-company-detail-v1";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RelationshipCompanyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const index = await loadCrmDirectoryIndexV1();
  const company = resolveCrmCompanyDetailV1(index, id);

  if (!company) notFound();

  return <CrmCompanyDetailV1 company={company} />;
}
