import React from "react";

import { CrmFollowUpQueueV1 } from "@/components/relationships-crm/CrmFollowUpQueueV1";
import { loadProductionFollowUpQueueV1 } from "@/lib/relationships-crm/production-follow-up-queue-loader-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function RelationshipFollowUpsPage() {
  const queue = await loadProductionFollowUpQueueV1();
  return <CrmFollowUpQueueV1 queue={queue} />;
}
