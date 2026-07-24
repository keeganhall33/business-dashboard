export type InternalAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "Unauthorized" | "Service misconfigured" };

function readEnvToken() {
  return process.env.INTERNAL_API_TOKEN?.trim() || null;
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function authorizeInternalRequest(request: Request): InternalAuthResult {
  const token = readEnvToken();
  if (!token) {
    return { ok: false, status: 503, error: "Service misconfigured" };
  }

  const supplied =
    request.headers.get("x-internal-token")?.trim() ||
    readBearerToken(request) ||
    null;

  if (!supplied || supplied !== token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
