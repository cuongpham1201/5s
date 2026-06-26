/**
 * Temporary capture-flow diagnostics (Phase 3.x hotfix).
 *
 * - console.warn ALWAYS runs (prod included) so the issue can be observed on
 *   device — filter the console by `5S_CAPTURE_DEBUG`. No secrets are logged.
 * - The visible on-screen panel is gated by NEXT_PUBLIC_CAPTURE_DEBUG=true
 *   (inlined at build time). When false/missing the panel is hidden but logs
 *   keep flowing.
 */
export const DEBUG_PREFIX = "[5S_CAPTURE_DEBUG]";

export function captureDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAPTURE_DEBUG === "true";
}

interface DebugState {
  lastAction: string | null;
  lastActionAt: string | null;
  lastError: string | null;
}

const state: DebugState = { lastAction: null, lastActionAt: null, lastError: null };

/** Log a capture-flow step (always) and remember it for the on-screen panel. */
export function clog(action: string, data: Record<string, unknown> = {}): void {
  state.lastAction = action;
  state.lastActionAt = new Date().toISOString();
  if ("error" in data && data.error) state.lastError = String(data.error);
  else if ("message" in data && data.message) state.lastError = String(data.message);
  else if (/error|fail/i.test(action)) state.lastError = action;
  // eslint-disable-next-line no-console
  console.warn(DEBUG_PREFIX, action, data);
}

export function getCaptureDebugState(): DebugState {
  return { ...state };
}
