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
  companyId?: string | null;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Field({ label, name, defaultValue, type = "text", placeholder }: { label: string; name: string; defaultValue?: string | null; type?: string; placeholder?: string }) {
  return (
    <label className="text-xs font-semibold text-slate-700">
      {label}
      <input className={inputClass} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
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
        companyId: String(formData.get("companyId") ?? "")
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
              <select name="companyId" className={inputClass} defaultValue={values.companyId ?? ""}>
                <option value="">No company selected</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
            <Field label="LinkedIn" name="linkedinUrl" type="url" defaultValue={values.linkedinUrl} />
          </>
        ) : <Field label="Website" name="websiteUrl" type="url" defaultValue={values.websiteUrl} />}
      </div>
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
