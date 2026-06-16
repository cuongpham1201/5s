import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

/**
 * Employee AppShell — renders the prototype phone frame (390×844) on large
 * screens and goes full-bleed on real phones. Optionally shows the bottom nav.
 */
export function AppShell({
  children,
  showNav = true,
  showStatusBar = true,
}: {
  children: ReactNode;
  showNav?: boolean;
  showStatusBar?: boolean;
}) {
  return (
    <div className="phone-stage">
      <div className="phone">
        {showStatusBar && (
          <div className="statusbar">
            <span>9:41</span>
            <span className="flex items-center gap-1.5">📶 📡 🔋</span>
          </div>
        )}
        <div className="screen">{children}</div>
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
