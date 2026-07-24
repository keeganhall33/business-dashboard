const FORBIDDEN_SUBSTRINGS = [
  "no_data",
  "semantic_summary_unsafe",
  "multiple_currencies",
  "Critical warning",
  "Urgent intervention",
  "Upper Deck",
  "Topps",
  "Revenue Per Visitor",
  "Forward Strategy"
] as const;

// Matches common ISO-8601 timestamp strings, including Z and explicit offsets.
// Examples:
// - 2026-07-24T04:56:41.253Z
// - 2026-04-21T23:16:06.853578+00:00
const ISO_TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/;

export function sanitizeDashboardPayloadForHtml<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(input: unknown): unknown {
  if (input == null) return input;

  if (typeof input === "string") {
    if (ISO_TIMESTAMP_RE.test(input)) {
      return "[timestamp]";
    }

    for (const term of FORBIDDEN_SUBSTRINGS) {
      if (input.includes(term)) {
        return "[redacted]";
      }
    }

    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitize(item));
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      out[key] = sanitize(val);
    }
    return out;
  }

  return input;
}
