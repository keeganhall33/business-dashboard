import { notFound } from "next/navigation";

import { CrmPersonDetailV1 } from "@/components/relationships-crm/CrmPersonDetailV1";
import { EMPTY_CRM_DIRECTORY_INDEX_V1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import { resolveCrmPersonDetailV1 } from "@/lib/relationships-crm/crm-person-detail-v1";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RelationshipPersonDetailPage({ params }: PageProps) {
  const { id } = await params;
  const person = resolveCrmPersonDetailV1(EMPTY_CRM_DIRECTORY_INDEX_V1, id);

  if (!person) notFound();

  return <CrmPersonDetailV1 person={person} />;
}
