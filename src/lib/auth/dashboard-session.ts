import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const DASHBOARD_ALLOWED_EMAIL = "keegan@keeganhall.com";
export const DASHBOARD_SESSION_COOKIE = "__Host-jeeves_session";
export const DASHBOARD_SESSION_TTL_SECONDS = 60 * 60 * 12;

const DASHBOARD_ACCESS_CODE_SHA256 = "1d8e52dc728f382759efe049a39509560ec42508bc8be6ddb8768d1f9f8643be";

type DashboardSessionPayload = {
  email: string;
  expiresAt: number;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getDashboardSessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.DASHBOARD_ADMIN_TOKEN?.trim() || null;
}

export function canBypassDashboardAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && !getDashboardSessionSecret(env);
}

export function verifyDashboardAccessAttempt(
  email: string,
  accessCode: string,
  expectedHash: string = DASHBOARD_ACCESS_CODE_SHA256
): boolean {
  if (normalizedEmail(email) !== DASHBOARD_ALLOWED_EMAIL) return false;
  const suppliedHash = createHash("sha256").update(accessCode).digest("hex");
  return safeEqual(suppliedHash, expectedHash);
}

export function issueDashboardSession({
  email,
  secret,
  now = Date.now()
}: {
  email: string;
  secret: string;
  now?: number;
}): string {
  const normalized = normalizedEmail(email);
  if (normalized !== DASHBOARD_ALLOWED_EMAIL) throw new Error("Dashboard email is not authorized");
  if (!secret.trim()) throw new Error("Dashboard session secret is unavailable");

  const payload: DashboardSessionPayload = {
    email: normalized,
    expiresAt: Math.floor(now / 1000) + DASHBOARD_SESSION_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyDashboardSession({
  token,
  secret,
  now = Date.now()
}: {
  token: string | null | undefined;
  secret: string;
  now?: number;
}): DashboardSessionPayload | null {
  if (!token || !secret.trim()) return null;
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  if (!safeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<DashboardSessionPayload>;
    if (normalizedEmail(payload.email ?? "") !== DASHBOARD_ALLOWED_EMAIL) return null;
    if (!Number.isInteger(payload.expiresAt) || (payload.expiresAt ?? 0) <= Math.floor(now / 1000)) return null;
    return { email: DASHBOARD_ALLOWED_EMAIL, expiresAt: payload.expiresAt as number };
  } catch {
    return null;
  }
}
