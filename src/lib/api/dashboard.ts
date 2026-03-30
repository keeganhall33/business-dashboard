import { DashboardOverviewResponse } from "@/lib/types/dashboard";

function getAppUrl() {
  // Client-side: use relative fetches.
  if (typeof window !== "undefined") {
    return "";
  }

  // Server-side: prefer explicit public URL, otherwise fall back to Vercel host.
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local dev fallback.
  return "http://localhost:3000";
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const base = getAppUrl();
  const url = base ? `${base}/api/dashboard/overview` : "/api/dashboard/overview";
  return fetchJson<DashboardOverviewResponse>(url, { method: "GET" });
}

export async function getAgentDashboard(agentKey: string): Promise<unknown> {
  const base = getAppUrl();
  const url = base ? `${base}/api/dashboard/agent/${agentKey}` : `/api/dashboard/agent/${agentKey}`;
  return fetchJson(url, { method: "GET" });
}

