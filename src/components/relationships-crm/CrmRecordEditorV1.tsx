"use client";

import { useState, useTransition } from "react";

import {
  retireCrmEntityActionV1,
  saveCrmEntityActionV1
} from "@/app/(app)/relationships/actions";

type CompanyChoice = { id: string; name: string };

export type CrmRecordEditorValuesV1 = {
  id?: string | null;
  entityType: "person" | "organization";
  name?: string | null;
  title?: string | null;
  category?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  companyName?: string | null;
  relationshipState?: string | null;
  relationshipQuality?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  lastTouchAt?: string | null;
  nextFollowUpAt?: string | null;
  nextMove?: string | null;
  supportedValue?: string | null;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Field({ label, name, defaultValue, type = "text", placeholder, help }: { label: string; name: string; defaultValue?: string | null; type?: string; placeholder?: string; help?: string }) {
  return (
    <label className="text-xs font-semibold text-slate-700">
      {label}
      <input className={inputClass} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
      {help ? <span className="mt-1 block font-normal leading-5 text-slate-500">{help}</span> : null}
    </label>
  );
}

export function CrmRecordEditorV1({
  values,
  companies = [],
  mode = "edit"
}: {
  values: CrmRecordEditorValuesV1;
  companies?: readonly CompanyChoice[];
  mode?: "create" | "edit";
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const isPerson = values.entityType === "person";

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveCrmEntityActionV1({
        id: values.id ?? null,
        entityType: values.entityType,
        name: String(formData.get("name") ?? ""),
        title: String(formData.get("title") ?? ""),
        category: String(formData.get("category") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
        websiteUrl: String(formData.get("websiteUrl") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        companyName: String(formData.get("companyName") ?? ""),
        relationshipState: String(formData.get("relationshipState") ?? ""),
        relationshipQuality: String(formData.get("relationshipQuality") ?? "") as "" | "LOW" | "MEDIUM" | "HIGH",
        lastTouchAt: String(formData.get("lastTouchAt") ?? ""),
        nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
        nextMove: String(formData.get("nextMove") ?? ""),
        supportedValue: formData.get("supportedValue") ? Number(formData.get("supportedValue")) : null
      });
      if (!result.ok) return setMessage(result.message);
      setMessage("Saved");
      if (mode === "edit" && result.id !== values.id) {
        window.location.replace(`${isPerson ? "/relationships/people" : "/relationships/companies"}/${encodeURIComponent(result.id)}`);
        return;
      }
      window.location.reload();
    });
  }

  function remove() {
    if (!values.id || !window.confirm(`Remove ${values.name ?? "this record"} from the active CRM?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await retireCrmEntityActionV1(values.id!);
      if (!result.ok) return setMessage(result.message);
      window.location.assign(isPerson ? "/relationships/people" : "/relationships/companies");
    });
  }

  return (
    <form action={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{mode === "create" ? `Add ${isPerson ? "person" : "company"}` : "Edit record"}</h2>
          <p className="mt-1 text-xs text-slate-500">Changes save directly to the CRM and remain available to Ask Jeeves.</p>
        </div>
        {message ? <p role="status" className={message === "Saved" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-rose-700"}>{message}</p> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={isPerson ? "Name" : "Company name"} name="name" defaultValue={values.name} />
        {isPerson ? <Field label="Role / title" name="title" defaultValue={values.title} /> : <Field label="Category" name="category" defaultValue={values.category} />}
        <Field label="Email" name="email" type="email" defaultValue={values.email} />
        <Field label="Phone" name="phone" type="tel" defaultValue={values.phone} />
        {isPerson ? (
          <>
            <label className="text-xs font-semibold text-slate-700">Company
              <input className={inputClass} list="crm-company-choices" name="companyName" defaultValue={values.companyName ?? ""} placeholder="Choose or type any company" />
              <datalist id="crm-company-choices">
                {companies.map((company) => <option key={company.id} value={company.name} />)}
              </datalist>
            </label>
            <Field label="LinkedIn" name="linkedinUrl" type="url" defaultValue={values.linkedinUrl} />
          </>
        ) : <Field label="Website" name="websiteUrl" type="url" defaultValue={values.websiteUrl} />}
        <Field label="Relationship status" name="relationshipState" defaultValue={values.relationshipState} placeholder="In conversation, waiting on reply, dormant..." help="Describe where the relationship stands now. The linked opportunity is shown separately." />
        <label className="text-xs font-semibold text-slate-700">Relationship strength
          <select name="relationshipQuality" className={inputClass} defaultValue={values.relationshipQuality === "UNKNOWN" ? "" : values.relationshipQuality ?? ""}>
            <option value="">Not recorded</option>
            <option value="HIGH">Strong: trusted, direct relationship</option>
            <option value="MEDIUM">Developing: active, limited history</option>
            <option value="LOW">Limited: little or no direct relationship</option>
          </select>
          <span className="mt-1 block font-normal leading-5 text-slate-500">This is your assessment, not an automated score.</span>
        </label>
        <Field label={isPerson ? "Last contact" : "Last activity"} name="lastTouchAt" type="date" defaultValue={values.lastTouchAt} help="Date of the most recent meaningful email, call, or meeting." />
        <Field label="Next follow-up reminder" name="nextFollowUpAt" type="date" defaultValue={values.nextFollowUpAt} help="Appears in the follow-up queue seven days before this date and remains visible if overdue." />
        {!isPerson ? <Field label="Estimated value" name="supportedValue" type="number" defaultValue={values.supportedValue?.replace(/[^0-9.]/g, "")} placeholder="0" /> : null}
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">Next action / waiting on
        <textarea name="nextMove" defaultValue={values.nextMove ?? ""} rows={3} className={inputClass} placeholder="Example: Waiting for Michelle to confirm the meeting date" />
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">Notes
        <textarea name="notes" defaultValue={values.notes ?? ""} rows={5} className={inputClass} placeholder="Add context, recent updates, and anything Jeeves should know." />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={pending} type="submit" className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{pending ? "Saving..." : "Save changes"}</button>
        {mode === "edit" ? <button disabled={pending} type="button" onClick={remove} className="rounded-full border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Remove record</button> : null}
      </div>
    </form>
  );
}
