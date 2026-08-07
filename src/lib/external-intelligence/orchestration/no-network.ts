import "@/lib/server-only";

type FetchLike = typeof globalThis.fetch | undefined;

/**
 * Hard guard: disallow any network fetch during a critical internal-only execution window.
 *
 * This is not a general sandbox; it is a narrow, testable invariant for Phase B5.
 */
export async function withNoNetwork<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const originalFetch: FetchLike = globalThis.fetch;

  const deny = () => {
    throw new Error("no_network_violation:fetch");
  };

  try {
    // Ensure any attempted fetch fails closed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = deny;
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
  }
}
