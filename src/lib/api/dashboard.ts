import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";

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

type OverviewParams = {
  preset?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export async function getDashboardOverview(params: OverviewParams = {}): Promise<DashboardOverviewResponse> {
  const base = getAppUrl();
  const search = new URLSearchParams();

  if (params.preset) {
    search.set("range", params.preset);
  }
  if (params.startDate) {
    search.set("start", params.startDate);
  }
  if (params.endDate) {
    search.set("end", params.endDate);
  }

  const query = search.toString();
  const path = query ? `/api/dashboard/overview?${query}` : "/api/dashboard/overview";
  const url = base ? `${base}${path}` : path;
  return fetchJson<DashboardOverviewResponse>(url, { method: "GET" });
}

export async function getAgentDashboard(agentKey: string): Promise<AgentDashboardResponse> {
  const base = getAppUrl();
  const url = base ? `${base}/api/dashboard/agent/${agentKey}` : `/api/dashboard/agent/${agentKey}`;
  return fetchJson<AgentDashboardResponse>(url, { method: "GET" });
}
