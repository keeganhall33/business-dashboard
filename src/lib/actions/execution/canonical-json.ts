import crypto from "node:crypto";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

type CanonicalizeOptions = {
  allowDateObjects?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalizeJson(input: unknown, opts: CanonicalizeOptions = {}): CanonicalJsonValue {
  const seen = new Set<unknown>();

  function walk(value: unknown): CanonicalJsonValue {
    if (value === undefined) {
      throw new Error("canonicalizeJson: undefined is not allowed at the top level");
    }

    if (value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("canonicalizeJson: non-finite numbers are not allowed");
      return value;
    }
    if (typeof value === "bigint") throw new Error("canonicalizeJson: bigint is not allowed");
    if (typeof value === "function") throw new Error("canonicalizeJson: function is not allowed");
    if (typeof value === "symbol") throw new Error("canonicalizeJson: symbol is not allowed");

    if (value instanceof Date) {
      if (!opts.allowDateObjects) throw new Error("canonicalizeJson: Date objects are not allowed");
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) throw new Error("canonicalizeJson: cyclic value");
      seen.add(value);
      const out: CanonicalJsonValue[] = value.map((v) => (v === undefined ? null : walk(v)));
      seen.delete(value);
      return out;
    }

    if (!isPlainObject(value)) {
      throw new Error("canonicalizeJson: unsupported object type");
    }

    if (seen.has(value)) throw new Error("canonicalizeJson: cyclic value");
    seen.add(value);

    const keys = Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    const out: Record<string, CanonicalJsonValue> = {};
    for (const k of keys) {
      out[k] = walk((value as Record<string, unknown>)[k]);
    }
    seen.delete(value);
    return out;
  }

  return walk(input);
}

export function canonicalJsonString(input: unknown, opts: CanonicalizeOptions = {}): string {
  const canonical = canonicalizeJson(input, opts);
  return JSON.stringify(canonical);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(Buffer.from(input, "utf8")).digest("hex");
}

export function canonicalJsonSha256Hex(input: unknown, opts: CanonicalizeOptions = {}): string {
  return sha256Hex(canonicalJsonString(input, opts));
}

