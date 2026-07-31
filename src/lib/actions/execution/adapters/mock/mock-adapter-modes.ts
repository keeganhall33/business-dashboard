export const MOCK_ADAPTER_MODES = [
  "success",
  "failure",
  "timeout",
  "partial_success",
  "cancel_before_start",
  "cancel_during_execution",
  "rollback_success",
  "rollback_failure",
  "verification_success",
  "verification_failure"
] as const;

export type MockAdapterMode = (typeof MOCK_ADAPTER_MODES)[number];

export type MockAdapterPayload = {
  mock: {
    mode: MockAdapterMode;
    scenario?: string;
  };
};

export function parseMockMode(payload: Record<string, unknown>): { ok: true; mode: MockAdapterMode } | { ok: false; error: string } {
  const rawMock = payload["mock"];
  if (!rawMock || typeof rawMock !== "object") {
    return { ok: false, error: "Missing mock payload (payload.mock)" };
  }
  const mode = (rawMock as Record<string, unknown>)["mode"];
  if (typeof mode !== "string") {
    return { ok: false, error: "Missing mock mode (payload.mock.mode)" };
  }
  if (!(MOCK_ADAPTER_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: `Unsupported mock mode: ${mode}` };
  }
  return { ok: true, mode: mode as MockAdapterMode };
}

