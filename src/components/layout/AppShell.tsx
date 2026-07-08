import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { AppSidebar } from "./AppSidebar";
import { SyncStatusBar } from "@/components/system/SyncStatusBar";

/**
 * Responsive application shell.
 *  - Mobile / tablet (<1024px): full-bleed content + BottomNav (PWA feel).
 *  - Desktop (≥1024px): persistent sidebar + centered content (max 1500px),
 *    BottomNav hidden (CSS). The full-screen capture flow passes showNav={false}
 *    to render plain content with no chrome.
 */
export function AppShell({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  if (!showNav) {
    return (
      <div className="app-shell-plain">
        <div className="app-screen">{children}</div>
      </div>
    );
  }
  return (
    <div className="shell-root">
      <AppSidebar />
      <div className="shell-main">
        <div className="app-screen">{children}</div>
        <SyncStatusBar />
        <BottomNav />
      </div>
    </div>
  );
}
