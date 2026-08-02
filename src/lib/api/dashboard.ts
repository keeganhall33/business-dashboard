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

  // Next.js dev server origin (includes port) when available.
  if (process.env.__NEXT_PRIVATE_ORIGIN) {
    return process.env.__NEXT_PRIVATE_ORIGIN;
  }

  // Local dev fallback.
  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}

let hasLoggedMissingToken = false;

function getServerAuthHeaders(): HeadersInit | null {
  if (typeof window !== "undefined") return null;
  const token = process.env.DASHBOARD_ADMIN_TOKEN?.trim();
  if (!token) {
    if (!hasLoggedMissingToken) {
      console.warn("[dashboard] Missing DASHBOARD_ADMIN_TOKEN; internal fetches may fail");
      hasLoggedMissingToken = true;
    }
    return null;
  }
  return { "x-dashboard-secret": token };
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const serverHeaders = getServerAuthHeaders();
  if (serverHeaders) {
    for (const [key, value] of Object.entries(serverHeaders)) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers, cache: "no-store" });
  } catch (error) {
    throw new Error(`[dashboard] fetch failed for ${String(input)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  const safeTarget = (() => {
    try {
      const u = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(String(input));
      return u.pathname;
    } catch {
      return typeof input === "string" ? input.split("?")[0] : String(input);
    }
  })();

  if (!res.ok) {
    // Do not include response bodies (can be HTML redirects/login pages).
    throw new Error(`[dashboard] request failed (${res.status}) for ${safeTarget} (content-type: ${contentType || "unknown"})`);
  }

  if (!/application\/(json|problem\+json)/i.test(contentType)) {
    // Avoid crashing on HTML responses (e.g., deployment protection / login redirects).
    throw new Error(`[dashboard] expected JSON for ${safeTarget} but received ${contentType || "unknown"}`);
  }

  return (await res.json()) as T;
}

type OverviewParams = {
  preset?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type ServerRequestContext = {
  baseUrl: string;
  cookie: string | null;
};

export async function getDashboardOverview(params: OverviewParams = {}, ctx?: ServerRequestContext): Promise<DashboardOverviewResponse> {
  const base = ctx?.baseUrl ?? getAppUrl();
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

  const headers = new Headers();
  if (ctx?.cookie) headers.set("cookie", ctx.cookie);

  return fetchJson<DashboardOverviewResponse>(url, { method: "GET", headers });
}

export async function getAgentDashboard(agentKey: string): Promise<AgentDashboardResponse> {
  const base = getAppUrl();
  const url = base ? `${base}/api/dashboard/agent/${agentKey}` : `/api/dashboard/agent/${agentKey}`;
  return fetchJson<AgentDashboardResponse>(url, { method: "GET" });
}
