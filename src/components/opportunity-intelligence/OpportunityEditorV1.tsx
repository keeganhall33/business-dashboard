"use client";

import { useState, useTransition } from "react";

import { archiveOpportunityActionV1, saveOpportunityActionV1 } from "@/app/(app)/opportunities-actions/actions";

export type EditableOpportunityV1 = {
  id: string;
  name: string;
  organization: string | null;
  status: string;
  contactName: string | null;
  contactRole: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  valueEstimate: number | null;
  notes: string | null;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function OpportunityEditorV1({ opportunity }: { opportunity: EditableOpportunityV1 }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(formData: FormData) {
    const valueText = String(formData.get("valueEstimate") ?? "").trim();
    setMessage(null);
    startTransition(async () => {
      const result = await saveOpportunityActionV1({
        id: opportunity.id,
        name: String(formData.get("name") ?? ""),
        organization: String(formData.get("organization") ?? ""),
        status: String(formData.get("status") ?? ""),
        contactName: String(formData.get("contactName") ?? ""),
        contactRole: String(formData.get("contactRole") ?? ""),
        nextStep: String(formData.get("nextStep") ?? ""),
        nextStepDueAt: String(formData.get("nextStepDueAt") ?? ""),
        valueEstimate: valueText ? Number(valueText) : null,
        notes: String(formData.get("notes") ?? "")
      });
      setMessage(result.ok ? "Saved" : result.message);
      if (result.ok) window.location.reload();
    });
  }

  function archive() {
    if (!window.confirm("Remove this opportunity from the active pipeline? Its history will be preserved.")) return;
    startTransition(async () => {
      const result = await archiveOpportunityActionV1(opportunity.id);
      if (!result.ok) return setMessage(result.message);
      window.location.assign("/opportunities-actions");
    });
  }

  return (
    <form action={save} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Edit opportunity</h2><p className="mt-1 text-xs text-slate-500">Update the business record without leaving the dashboard.</p></div>{message ? <p role="status" className={message === "Saved" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-rose-700"}>{message}</p> : null}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([ ["Opportunity", "name", opportunity.name, "text"], ["Company", "organization", opportunity.organization, "text"], ["Status", "status", opportunity.status, "text"], ["Contact", "contactName", opportunity.contactName, "text"], ["Contact role", "contactRole", opportunity.contactRole, "text"], ["Target date", "nextStepDueAt", opportunity.nextStepDueAt?.slice(0, 10) ?? null, "date"], ["Revenue potential", "valueEstimate", opportunity.valueEstimate?.toString() ?? null, "number"] ] as const).map(([label, name, value, type]) => <label key={name} className="text-xs font-semibold text-slate-700">{label}<input name={name} type={type} min={type === "number" ? "0" : undefined} defaultValue={value ?? ""} className={inputClass} /></label>)}
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">Next move<textarea name="nextStep" defaultValue={opportunity.nextStep ?? ""} rows={3} className={inputClass} /></label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">Notes<textarea name="notes" defaultValue={opportunity.notes ?? ""} rows={5} className={inputClass} /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button disabled={pending} className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Saving..." : "Save changes"}</button><button disabled={pending} type="button" onClick={archive} className="rounded-full border border-rose-200 px-5 py-2.5 text-sm font-semibold text-rose-700">Remove from active pipeline</button></div>
    </form>
  );
}
