import { enforceDashboardAuth } from "@/lib/auth/dashboard";

const SAFE_DIAGNOSTIC_HEADER_NAMES = [
  "host",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-vercel-id"
] as const;

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  const diagnosticHeaders: Record<string, string> = {};
  for (const name of SAFE_DIAGNOSTIC_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value !== null) diagnosticHeaders[name] = value;
  }

  return Response.json({ headers: diagnosticHeaders });
}
