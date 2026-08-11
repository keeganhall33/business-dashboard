import type { ResearchQuestion } from "./types";

export type ResearchMemoryStatus = "open" | "answered" | "blocked" | "ceiling_reached" | "closed";

export type ResearchMemoryRecord = {
  opportunity_id: string;
  question_id: string;
  status: ResearchMemoryStatus;
  last_attempted_at?: string | null;
  answer_summary?: string | null;
  supporting_refs?: unknown;
  ceiling_reason?: string | null;
};

export function applyResearchMemoryGate(params: {
  questions: ResearchQuestion[];
  memoryRecords: ResearchMemoryRecord[];
}): ResearchQuestion[] {
  const byId = new Map<string, ResearchMemoryRecord>();
  for (const rec of params.memoryRecords) {
    byId.set(`${rec.opportunity_id}:${rec.question_id}`, rec);
  }

  return params.questions.filter((q) => {
    const rec = byId.get(`${q.opportunity_id}:${q.question_id}`);
    if (!rec) return true;
    return !(rec.status === "answered" || rec.status === "closed" || rec.status === "ceiling_reached");
  });
}

