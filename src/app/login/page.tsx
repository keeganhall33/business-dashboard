import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  DASHBOARD_ALLOWED_EMAIL,
  DASHBOARD_SESSION_COOKIE,
  getDashboardSessionSecret,
  verifyDashboardSession
} from "@/lib/auth/dashboard-session";

export const dynamic = "force-dynamic";

export default async function DashboardLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const secret = getDashboardSessionSecret();
  const cookieStore = await cookies();
  const existingSession = secret
    ? verifyDashboardSession({ token: cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value, secret })
    : null;
  if (existingSession) redirect("/dashboard");

  const configurationError = params.error === "configuration";
  const invalidCredentials = params.error === "invalid";
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl sm:p-8" aria-labelledby="private-dashboard-title">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mission Control</p>
        <h1 id="private-dashboard-title" className="mt-2 text-3xl font-semibold tracking-tight">Private dashboard</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Sign in with the approved email and access code.</p>

        {configurationError ? (
          <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
            Secure sign-in is not configured on this deployment. Access remains locked.
          </p>
        ) : null}
        {invalidCredentials ? (
          <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            That email or access code was not accepted.
          </p>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-semibold text-slate-800">
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              defaultValue={DASHBOARD_ALLOWED_EMAIL}
              required
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Access code
            <input
              type="password"
              name="accessCode"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button type="submit" className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            Open Mission Control
          </button>
        </form>
      </section>
    </main>
  );
}

