import type { ArchitectCheckpointV1, OrchestrationResultContractV1 } from "./types";

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```json\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const trimmed = candidate.trim();
  return JSON.parse(trimmed);
}

export function parseOrchestrationResult(text: string):
  | { kind: "result"; value: OrchestrationResultContractV1 }
  | { kind: "checkpoint"; value: ArchitectCheckpointV1 }
  | { kind: "invalid"; error: string } {
  try {
    const obj = extractJsonObject(text) as any;
    if (obj && typeof obj === "object") {
      if (typeof obj.TASK_ID === "string" && typeof obj.STATUS === "string" && typeof obj.SUMMARY === "string") {
        return { kind: "result", value: obj as OrchestrationResultContractV1 };
      }
      if (typeof obj.TASK_ID === "string" && typeof obj.CHECKPOINT_ID === "string" && typeof obj.QUESTION_OR_DECISION === "string") {
        return { kind: "checkpoint", value: obj as ArchitectCheckpointV1 };
      }
    }
    return { kind: "invalid", error: "JSON parsed but did not match known contracts" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "invalid", error: message };
  }
}

