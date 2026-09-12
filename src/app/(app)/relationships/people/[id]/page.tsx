import { notFound } from "next/navigation";

import { CrmPersonDetailV1 } from "@/components/relationships-crm/CrmPersonDetailV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";
import { resolveCrmPersonDetailV1 } from "@/lib/relationships-crm/crm-person-detail-v1";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RelationshipPersonDetailPage({ params }: PageProps) {
  const { id } = await params;
  const index = await loadCrmDirectoryIndexV1();
  const person = resolveCrmPersonDetailV1(index, id);

  if (!person) notFound();

  return <CrmPersonDetailV1 person={person} />;
}
