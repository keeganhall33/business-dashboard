import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";

function normalizeOrigin(value: string | undefined, defaultProtocol: "https:" | "http:"): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `${defaultProtocol}//${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getAppUrl() {
  // Client-side: use relative fetches.
  if (typeof window !== "undefined") {
    return "";
  }

  // Server-side: bind internal fetches to the deployment-owned origin first.
  // Never derive this origin from request Host / X-Forwarded-Host headers.
  const vercelOrigin = normalizeOrigin(process.env.VERCEL_URL, "https:");
  if (vercelOrigin) return vercelOrigin;

  const publicOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL, "https:");
  if (publicOrigin) return publicOrigin;

  // Next.js dev server origin (includes port) when available.
  const privateOrigin = normalizeOrigin(process.env.__NEXT_PRIVATE_ORIGIN, "http:");
  if (privateOrigin) return privateOrigin;

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

function assertTrustedServerFetchTarget(input: RequestInfo | URL): void {
  if (typeof window !== "undefined") return;

  const trustedBase = getAppUrl();
  const trustedUrl = new URL(trustedBase);

  let targetUrl: URL;
  try {
    if (input instanceof URL) {
      targetUrl = input;
    } else if (typeof input === "string") {
      targetUrl = new URL(input, trustedBase);
    } else {
      targetUrl = new URL(input.url, trustedBase);
    }
  } catch {
    throw new Error("[dashboard] refusing malformed server fetch target");
  }

  if (targetUrl.origin !== trustedUrl.origin) {
    throw new Error(`[dashboard] refusing server fetch to untrusted origin for ${targetUrl.pathname}`);
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  assertTrustedServerFetchTarget(input);

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
  cookie: string | null;
};

export async function getDashboardOverview(params: OverviewParams = {}, ctx?: ServerRequestContext): Promise<DashboardOverviewResponse> {
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

  const headers = new Headers();
  if (ctx?.cookie) headers.set("cookie", ctx.cookie);

  return fetchJson<DashboardOverviewResponse>(url, { method: "GET", headers });
}

export async function getAgentDashboard(agentKey: string): Promise<AgentDashboardResponse> {
  const base = getAppUrl();
  const url = base ? `${base}/api/dashboard/agent/${agentKey}` : `/api/dashboard/agent/${agentKey}`;
  return fetchJson<AgentDashboardResponse>(url, { method: "GET" });
}
