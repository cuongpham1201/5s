"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Thin top banner shown only when offline. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] text-center text-[12px] font-semibold text-white bg-[#B10E1C] py-1.5"
      style={{ paddingTop: "calc(6px + env(safe-area-inset-top))" }}
    >
      🔴 Offline — vẫn chụp & nộp được, ảnh sẽ chờ đồng bộ
    </div>
  );
}
