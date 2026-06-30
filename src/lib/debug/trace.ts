/**
 * Central gate for diagnostic trace logs ([5S_SYNC_TRACE], [5S_PROFILE],
 * [5S_CAPTURE_TRACE], [5S_IMAGE_DEBUG]). OFF by default — including production —
 * so the console is silent unless an explicit debug flag is set.
 *
 * Enable with EITHER:
 *   - DEBUG_LOG=true               (server)
 *   - NEXT_PUBLIC_DEBUG_LOG=true   (client, inlined at build)
 *   - NEXT_PUBLIC_CAPTURE_DEBUG=true (also turns logs on, for convenience)
 */
export function traceEnabled(): boolean {
  return (
    process.env.DEBUG_LOG === "true" ||
    process.env.NEXT_PUBLIC_DEBUG_LOG === "true" ||
    process.env.NEXT_PUBLIC_CAPTURE_DEBUG === "true"
  );
}

/** Gated console.warn. No-op unless a debug flag is enabled. No secrets should be passed. */
export function trace(prefix: string, action: string, data: Record<string, unknown> = {}): void {
  if (!traceEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(prefix, action, data);
}
