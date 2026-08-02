import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";
import actionModelJson from "../../../docs/bi-action-model.json";
import approvalModelJson from "../../../docs/bi-approval-model.json";

type ActionModel = {
  action_levels: Array<{ level: string; name: string; definition: string; approval_required: boolean; execution_possible: boolean }>;
  prohibited_transitions?: Array<[string, string]>;
};

type ApprovalModel = {
  approval_states: string[];
  approval_classes: Record<string, { purpose: string }>;
};

export function ActVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  void data;
  const actionModel = actionModelJson as unknown as ActionModel;
  const approvalModel = approvalModelJson as unknown as ApprovalModel;

  return (
    <div className="space-y-6">
      <VerticalSliceCard
        title="Act (no execution)"
        subtitle="This milestone demonstrates L1–L3 only. L4 execution is disabled and requires explicit, hash-verified approval."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="emerald">Allowed: L1 analysis</Pill>
          <Pill tone="emerald">Allowed: L2 drafts</Pill>
          <Pill tone="amber">Allowed: L3 execution-ready packages (no side effects)</Pill>
          <Pill tone="rose">Blocked: L4 execution</Pill>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Action levels (L0–L5)" subtitle="Loaded from discovery artifacts to keep UI aligned with the safety model.">
        {actionModel ? (
          <div className="space-y-3">
            {actionModel.action_levels.map((lvl) => (
              <div key={lvl.level} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{lvl.level} — {lvl.name.replace(/_/g, " ")}</div>
                    <div className="mt-1 text-sm text-zinc-300">{lvl.definition}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Pill tone={lvl.approval_required ? "amber" : "zinc"}>approval: {lvl.approval_required ? "required" : "none"}</Pill>
                    <Pill tone={lvl.execution_possible ? "rose" : "zinc"}>execution: {lvl.execution_possible ? "possible" : "no"}</Pill>
                  </div>
                </div>
              </div>
            ))}
            <div className="text-xs text-zinc-500">
              Prohibited transitions: {(actionModel.prohibited_transitions ?? []).map((p) => p.join("→")).join(", ") || "—"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">Action model artifact unavailable in runtime environment.</div>
        )}
      </VerticalSliceCard>

      <VerticalSliceCard title="Approval classes" subtitle="Any future execution requires these approvals depending on side effects.">
        {approvalModel ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(approvalModel.approval_classes).map(([key, val]) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">{key.replace(/_/g, " ")}</div>
                  <Pill tone="zinc">class</Pill>
                </div>
                <div className="mt-2 text-sm text-zinc-300">{val.purpose}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">Approval model artifact unavailable in runtime environment.</div>
        )}
      </VerticalSliceCard>

      <VerticalSliceCard title="Demonstration only" subtitle="Prepared-action packaging is shown conceptually; no real platform writes occur.">
        <div className="space-y-2 text-sm text-zinc-300">
          <DefinitionRow label="Execution" value="Disabled in Milestone 8" />
          <DefinitionRow label="Credentials" value="Read-only for analytics; no execution credentials used" />
          <DefinitionRow label="Audit" value="All future executions must write pre/post audit records" />
          <DefinitionRow label="Idempotency" value="Required for any external execution" />
        </div>
      </VerticalSliceCard>
    </div>
  );
}
