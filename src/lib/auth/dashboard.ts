import "server-only";

import { unauthorized } from "@/lib/api/responses";

function requireAdminToken(): string | null {
  const token = process.env.DASHBOARD_ADMIN_TOKEN?.trim();
  if (!token) {
    // Local/dev ergonomics: allow the dashboard to run without a secret token.
    // Production remains locked down.
    if (process.env.NODE_ENV !== "production") return null;
    throw new Error("Missing DASHBOARD_ADMIN_TOKEN environment variable");
  }
  return token;
}

export function enforceDashboardAuth(request: Request): Response | null {
  const token = requireAdminToken();
  if (!token) return null;

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-dashboard-secret");

  let provided: string | null = null;
  if (headerSecret) {
    provided = headerSecret.trim();
  } else if (authHeader?.toLowerCase().startsWith("bearer ")) {
    provided = authHeader.slice(7).trim();
  }

  if (!provided || provided !== token) {
    return unauthorized("Unauthorized");
  }

  return null;
}
