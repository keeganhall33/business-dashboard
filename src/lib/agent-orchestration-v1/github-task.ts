import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { OrchestrationResultContractV1 } from "./types";

export function formatResultContractMarkdown(result: OrchestrationResultContractV1) {
  // Stable and copy/paste-safe for GitHub.
  return [
    "## OrchestrationResultContractV1",
    "",
    "```json",
    JSON.stringify(result, null, 2),
    "```",
    ""
  ].join("\n");
}

export function stableTaskRunId(params: {
  task_id: string;
  issue_number: number;
  head_sha: string;
}) {
  // Deterministic id to correlate repeats; does not include timestamps.
  return canonicalJsonSha256Hex({
    v: "agent_orchestration_task_run_v1",
    task_id: params.task_id,
    issue_number: params.issue_number,
    head_sha: params.head_sha
  }).slice(0, 20);
}

