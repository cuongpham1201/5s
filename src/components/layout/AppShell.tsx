import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

/**
 * Employee AppShell (Phase 1C — real-device clean shell).
 *
 * Production: full browser viewport (100dvh), NO fake iPhone bezel, NO fake
 * status bar, safe-area aware. On desktop it renders as a centered phone-width
 * column (still no bezel). A fake device frame is shown ONLY in an explicit
 * dev preview mode (NEXT_PUBLIC_DEVICE_PREVIEW=true).
 */
const DEV_PREVIEW = process.env.NEXT_PUBLIC_DEVICE_PREVIEW === "true";

export function AppShell({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  const shell = (
    <div className="app-shell">
      <div className="app-screen">{children}</div>
      {showNav && <BottomNav />}
    </div>
  );

  if (DEV_PREVIEW) {
    return (
      <div className="device-preview-stage">
        <div className="device-preview">{shell}</div>
      </div>
    );
  }
  return shell;
}
