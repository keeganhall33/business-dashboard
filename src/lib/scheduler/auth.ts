import { createPublicKey, verify } from "node:crypto";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "business-dashboard-scheduler";
const DEFAULT_SCHEDULER_REPO = "keeganhall33/business-dashboard";
const AUTOPILOT_WORKFLOW_PATH = ".github/workflows/autopilot.yml";

type GithubOidcClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  workflow_ref?: string;
};

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string };

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function audienceMatches(aud: string | string[] | undefined) {
  return Array.isArray(aud) ? aud.includes(GITHUB_OIDC_AUDIENCE) : aud === GITHUB_OIDC_AUDIENCE;
}

async function verifyGithubActionsOidcToken(token: string | null) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = decodeBase64UrlJson<{ kid?: string; alg?: string }>(parts[0]);
  const claims = decodeBase64UrlJson<GithubOidcClaims>(parts[1]);
  if (!header?.kid || header.alg !== "RS256" || !claims) return false;

  const now = Math.floor(Date.now() / 1000);
  const allowedRepo = process.env.SCHEDULER_GITHUB_REPO || DEFAULT_SCHEDULER_REPO;
  const expectedWorkflowPrefix = `${allowedRepo}/${AUTOPILOT_WORKFLOW_PATH}@`;

  if (claims.iss !== GITHUB_OIDC_ISSUER) return false;
  if (!audienceMatches(claims.aud)) return false;
  if (claims.repository !== allowedRepo) return false;
  if (!claims.workflow_ref?.startsWith(expectedWorkflowPrefix)) return false;
  if (typeof claims.exp !== "number" || claims.exp < now - 30) return false;
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) return false;

  const jwksResponse = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`, { cache: "no-store" });
  if (!jwksResponse.ok) return false;
  const jwks = (await jwksResponse.json()) as { keys?: JsonWebKeyWithKid[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && (!key.alg || key.alg === "RS256"));
  if (!jwk) return false;

  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    return verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return false;
  }
}

export async function assertSchedulerAuth(request: Request) {
  const expectedSecret = process.env.SCHEDULER_SECRET;

  const suppliedSecret = request.headers.get("x-scheduler-secret");
  if (expectedSecret && suppliedSecret === expectedSecret) {
    return;
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? null;

  // Vercel Cron may use the existing scheduler secret as a bearer token.
  if (expectedSecret && token === expectedSecret) {
    return;
  }

  // GitHub Actions uses a short-lived, repository- and workflow-bound OIDC token.
  // This removes the need to keep a second copy of SCHEDULER_SECRET synchronized
  // between GitHub Actions and the production host.
  if (await verifyGithubActionsOidcToken(token)) {
    return;
  }

  throw new Error("Unauthorized scheduler request");
}
