const BLOCKED_KEY_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /token/i,
  /secret/i,
  /password/i,
  /recipient/i,
  /email/i,
  /phone/i
];

function shouldStripKey(key: string): boolean {
  return BLOCKED_KEY_PATTERNS.some((p) => p.test(key));
}

export function sanitizeAuditMetadata(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 5) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (shouldStripKey(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeAuditMetadata(v as Record<string, unknown>, depth + 1);
      continue;
    }
    if (Array.isArray(v)) {
      // Arrays are kept but sanitized shallowly if they contain objects.
      out[k] = v.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? sanitizeAuditMetadata(item as Record<string, unknown>, depth + 1) : item));
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function assertAuditMetadataSanitized(input: Record<string, unknown>): void {
  for (const k of Object.keys(input)) {
    if (shouldStripKey(k)) {
      throw new Error(`Unsafe audit metadata key: ${k}`);
    }
  }
}
