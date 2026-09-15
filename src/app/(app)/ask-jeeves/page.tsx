import { AskJeevesWorkspaceV1 } from "@/components/ask-jeeves/AskJeevesWorkspaceV1";
import { resolveRange } from "@/lib/date/resolve-range";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AskJeevesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const params = (await searchParams) ?? {};
  const initialQuestion = typeof params?.q === "string" ? params.q.slice(0, 500) : "";
  const range = resolveRange(
    typeof params.range === "string" ? params.range : null,
    typeof params.start === "string" ? params.start : null,
    typeof params.end === "string" ? params.end : null
  );
  return <AskJeevesWorkspaceV1 initialQuestion={initialQuestion} reportingRange={range} />;
}
