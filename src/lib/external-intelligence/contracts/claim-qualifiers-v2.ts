import { z } from "zod";

export type ClaimQualifierValueTypeV2 = "string" | "number" | "boolean" | "null";

export type ClaimQualifierV2 =
  | { key: string; value_type: "string"; value: string }
  | { key: string; value_type: "number"; value: number }
  | { key: string; value_type: "boolean"; value: boolean }
  | { key: string; value_type: "null"; value: null };

export const ClaimQualifierKeyRegexV2 = /^[a-z][a-z0-9_]{0,63}$/;

const ClaimQualifierSchemaV2 = z
  .object({
    key: z.string().regex(ClaimQualifierKeyRegexV2),
    value_type: z.enum(["string", "number", "boolean", "null"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()])
  })
  .strict()
  .superRefine((val, ctx) => {
    const vt = val.value_type;
    const ok =
      (vt === "string" && typeof val.value === "string") ||
      (vt === "number" && typeof val.value === "number") ||
      (vt === "boolean" && typeof val.value === "boolean") ||
      (vt === "null" && val.value === null);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value_type"],
        message: "value_type must match value"
      });
    }

    if (vt === "number" && typeof val.value === "number" && !Number.isFinite(val.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "number qualifiers must be finite"
      });
    }
  });

export const ClaimQualifiersSchemaV2 = z.array(ClaimQualifierSchemaV2);

export type CanonicalizeClaimQualifiersPolicyV2 = {
  max_qualifiers: number;
  allow_null: boolean;
};

export const DEFAULT_CANONICALIZE_CLAIM_QUALIFIERS_POLICY_V2: CanonicalizeClaimQualifiersPolicyV2 = Object.freeze({
  max_qualifiers: 8,
  allow_null: false
});

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function canonicalizeQualifierValueStringV2(input: string): string {
  const s = normalizeWhitespace(input);
  if (!s) throw new Error("empty_string_qualifier");
  if (s.length > 240) throw new Error("qualifier_string_too_long");
  return s;
}

function qualifierSortKeyV2(q: ClaimQualifierV2): string {
  const v =
    q.value_type === "string"
      ? q.value
      : q.value_type === "number"
        ? String(q.value)
        : q.value_type === "boolean"
          ? String(q.value)
          : "null";
  return `${q.key}\u0000${q.value_type}\u0000${v}`;
}

/**
 * Canonical, bounded qualifier normalization.
 *
 * Contract:
 * - No predicate semantics here.
 * - Rejects duplicates.
 * - Normalizes whitespace for string qualifiers.
 * - Deterministically sorts.
 */
export function canonicalizeClaimQualifiersV2(
  input: unknown,
  policy: CanonicalizeClaimQualifiersPolicyV2 = DEFAULT_CANONICALIZE_CLAIM_QUALIFIERS_POLICY_V2
): ClaimQualifierV2[] {
  const parsed = ClaimQualifiersSchemaV2.parse(input) as unknown as ClaimQualifierV2[];

  if (parsed.length > policy.max_qualifiers) {
    throw new Error("too_many_qualifiers");
  }

  const seen = new Set<string>();
  const out: ClaimQualifierV2[] = [];

  for (const q of parsed) {
    if (seen.has(q.key)) {
      throw new Error("duplicate_qualifier_key");
    }
    seen.add(q.key);

    if (q.value_type === "null" && !policy.allow_null) {
      throw new Error("null_qualifier_not_allowed");
    }

    if (q.value_type === "string") {
      out.push({ key: q.key, value_type: "string", value: canonicalizeQualifierValueStringV2(q.value) });
      continue;
    }

    if (q.value_type === "number") {
      // Finite check is enforced by schema, but keep it defensive.
      if (!Number.isFinite(q.value)) throw new Error("qualifier_number_not_finite");
      out.push({ key: q.key, value_type: "number", value: q.value });
      continue;
    }

    if (q.value_type === "boolean") {
      out.push({ key: q.key, value_type: "boolean", value: q.value });
      continue;
    }

    // null
    out.push({ key: q.key, value_type: "null", value: null });
  }

  out.sort((a, b) => qualifierSortKeyV2(a).localeCompare(qualifierSortKeyV2(b)));

  // Freeze entries (not the array) to discourage mutation without breaking typing.
  for (let i = 0; i < out.length; i++) {
    out[i] = Object.freeze(out[i] as ClaimQualifierV2);
  }
  return out;
}
