export type TimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "handler_timeout"; safe_summary: string };

export async function runWithTimeout<T>(input: {
  timeout_ms: number;
  name: string;
  fn: (signal: AbortSignal) => Promise<T>;
}): Promise<TimeoutResult<T>> {
  if (!Number.isFinite(input.timeout_ms) || input.timeout_ms <= 0 || input.timeout_ms > 10 * 60 * 1000) {
    throw new Error("invalid_timeout");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);

  try {
    const value = await Promise.race([
      input.fn(controller.signal),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("handler_timeout")),
          { once: true }
        );
      })
    ]);
    return { ok: true, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("handler_timeout")) {
      return { ok: false, code: "handler_timeout", safe_summary: `${input.name}:handler_timeout` };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function remainingLeaseMs(input: { now_iso: string; expires_at_iso: string }): number {
  return Date.parse(input.expires_at_iso) - Date.parse(input.now_iso);
}

