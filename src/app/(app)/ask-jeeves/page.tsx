import { AskJeevesWorkspaceV1 } from "@/components/ask-jeeves/AskJeevesWorkspaceV1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AskJeevesPage({ searchParams }: { searchParams?: Promise<{ q?: string | string[] }> } = {}) {
  const params = await searchParams;
  const initialQuestion = typeof params?.q === "string" ? params.q.slice(0, 500) : "";
  return <AskJeevesWorkspaceV1 initialQuestion={initialQuestion} />;
}
