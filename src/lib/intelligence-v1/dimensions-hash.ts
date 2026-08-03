import crypto from "node:crypto";

/**
 * Deterministic dimensions hashing for intelligence facts.
 *
 * Requirements:
 * - recursively sort object keys
 * - preserve array order (arrays are treated as ordered)
 * - normalize undefined -> null (so JSON serialization is stable)
 * - serialize deterministically
 * - hash using SHA-256 hex
 */

export function canonicalizeDimensions(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeDimensions(v));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = canonicalizeDimensions(obj[k]);
    }
    return out;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }

  return value;
}

export function computeDimensionsHash(dimensions: Record<string, unknown> | null | undefined): string {
  const canonical = canonicalizeDimensions(dimensions ?? {});
  const bytes = Buffer.from(JSON.stringify(canonical));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

