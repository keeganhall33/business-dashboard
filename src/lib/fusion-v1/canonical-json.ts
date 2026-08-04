import crypto from "node:crypto";

export function canonicalizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeJson(v));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = canonicalizeJson(obj[k]);
    return out;
  }
  return value;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function canonicalJsonSha256Hex(value: unknown): string {
  const bytes = Buffer.from(canonicalJsonString(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

