"use client";

import { useState } from "react";
import type { ActionWorkspaceDecisionStateV1, ActionWorkspaceV1 } from "@/lib/action-workspace/fixtures";

const stateLabels: Record<ActionWorkspaceDecisionStateV1, string> = {
  READY_FOR_REVIEW: "Ready for review",
  APPROVE_DEMO: "Approve previewed",
  REJECT_DEMO: "Reject previewed",
  DEFER_DEMO: "Defer previewed"
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <div className="mt-2 text-sm leading-6 text-stone-800">{children}</div>
    </section>
  );
}

export function ActionWorkspacePanel({ workspace }: { workspace: ActionWorkspaceV1 }) {
  const [demoState, setDemoState] = useState<ActionWorkspaceDecisionStateV1>("READY_FOR_REVIEW");

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-stone-950" aria-label="Approval-ready action workspace">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Action Workspace V1</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-stone-950">Approval-ready recommendation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">{workspace.RECOMMENDATION}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800">{workspace.APPROVAL_CLASS}</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{workspace.CONFIDENCE_UNKNOWN.truth_state}</span>
            <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800">{workspace.OWNER}</span>
          </div>
        </header>

        <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Demo approval controls">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Demo controls</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">{stateLabels[demoState]}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">Fixture-only interaction. No action API, outreach, spend, publishing, pricing, contract, or production mutation runs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDemoState("APPROVE_DEMO")} className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Approve</button>
              <button type="button" onClick={() => setDemoState("REJECT_DEMO")} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">Reject</button>
              <button type="button" onClick={() => setDemoState("DEFER_DEMO")} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">Defer</button>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <Field label="OBJECTIVE">{workspace.OBJECTIVE}</Field>
          <Field label="WHY_NOW">{workspace.WHY_NOW}</Field>
          <Field label="EXPECTED_UPSIDE">{workspace.EXPECTED_UPSIDE}</Field>
          <Field label="RISK">{workspace.RISK}</Field>
          <Field label="NEXT_ACTION">{workspace.NEXT_ACTION}</Field>
          <Field label="SUCCESS_METRIC">{workspace.SUCCESS_METRIC}</Field>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <Field label="EVIDENCE">
            <ul className="space-y-2">
              {workspace.EVIDENCE.map((item) => (
                <li key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="font-semibold text-stone-950">{item.label}</span>
                  <span className="ml-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{item.source}</span>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{item.note}</p>
                </li>
              ))}
            </ul>
          </Field>
          <Field label="CONFIDENCE / UNKNOWN">
            <div className="space-y-2">
              <p>Confidence: {workspace.CONFIDENCE_UNKNOWN.confidence}</p>
              <p>Truth state: {workspace.CONFIDENCE_UNKNOWN.truth_state}</p>
              <p>UNKNOWN: {workspace.CONFIDENCE_UNKNOWN.unknowns.join(", ") || "none"}</p>
              <p>STALE / CONFLICTED: {workspace.CONFIDENCE_UNKNOWN.stale_or_conflicted.join(", ") || "none"}</p>
            </div>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label="OWNER">{workspace.OWNER}</Field>
          <Field label="APPROVAL_CLASS">{workspace.APPROVAL_CLASS}</Field>
          <Field label="EVALUATION_DATE">{workspace.EVALUATION_DATE}</Field>
        </div>

        <Field label="DEPENDENCIES">
          <ul className="list-disc space-y-1 pl-5">
            {workspace.DEPENDENCIES.map((dependency) => <li key={dependency}>{dependency}</li>)}
          </ul>
        </Field>
      </div>
    </main>
  );
}
