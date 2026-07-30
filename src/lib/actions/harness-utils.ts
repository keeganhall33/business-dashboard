export type StepRecord = {
  scenario: string;
  step: string;
  method: string;
  path: string;
  expectedStatus: number | number[];
  actualStatus: number;
  ok: boolean;
  errorMessage: string | null;
  response: unknown;
};

export function sanitizeErrorMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 400);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const msg = obj["message"] ?? obj["error"] ?? obj["hint"] ?? obj["details"];
    return typeof msg === "string" ? msg.slice(0, 400) : null;
  }
  return String(value).slice(0, 400);
}

export function statusMatches(expected: number | number[], actual: number): boolean {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

export function coerceObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

