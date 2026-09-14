import Link from "next/link";

import { CrmDirectoryIndexV1 } from "@/components/relationships-crm/CrmDirectoryIndexV1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipsPage() {
  const index = await loadCrmDirectoryIndexV1();
  return (
    <>
      <div className="bg-[#f4f7fb] px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap justify-end gap-2">
          <Link
            href="/relationships/follow-ups"
            className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-500"
          >
            Open follow-up queue
          </Link>
          <Link
            href="/relationships/activity"
            className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-500"
          >
            Open activity timeline
          </Link>
        </div>
      </div>
      <CrmDirectoryIndexV1 index={index} mode="OVERVIEW" />
    </>
  );
}
