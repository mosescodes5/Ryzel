/**
 * Every provider adapter calls out to a real third-party API (5SIM,
 * SMS-Man) over the open internet — and until now, nothing bounded how
 * long we'd wait for that. A slow or unresponsive upstream meant the
 * Worker's own request just hung indefinitely, which is exactly what
 * produced "Workers runtime canceled this request because it detected
 * your Worker's code had hung" in production. This wraps every such
 * fetch with a hard timeout so a flaky upstream fails fast and cleanly
 * (as a normal thrown error the fallback chain already knows how to
 * handle) instead of hanging the whole request until a platform-level
 * kill switch eventually fires.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`Request to ${input} timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
