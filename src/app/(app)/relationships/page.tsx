import Link from "next/link";

import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { EMPTY_CRM_DIRECTORY_INDEX_V1 } from "@/lib/relationships-crm/crm-directory-index-v1";

export default function RelationshipsPage() {
  return (
    <>
      <div className="bg-[#f8f4ec] px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] justify-end">
          <Link
            href="/relationships/activity"
            className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:border-stone-500"
          >
            Open activity timeline
          </Link>
        </div>
      </div>
      <CrmDirectoryIndexV1 index={EMPTY_CRM_DIRECTORY_INDEX_V1} mode="OVERVIEW" />
    </>
  );
}
