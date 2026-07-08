"use client";

import Link from "next/link";
import { useQueue } from "@/hooks/useQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Thanh trạng thái đồng bộ CỐ ĐỊNH cuối màn hình (nằm ngay trên BottomNav trong
 * layout flex — không che nút thao tác). Chỉ HIỂN THỊ trạng thái từ queue/online
 * hiện có; KHÔNG đụng queue/service sync.
 *   🟢 Đã đồng bộ · 🟡 Đang chờ (n) · 🔵 Đang tải… · 🔴 Offline · ❗ n lỗi
 */
export function SyncStatusBar() {
  const { summary } = useQueue();
  const online = useOnlineStatus();
  const waiting = summary.queued + summary.uploading;

  let dot: string;
  let icon: IconName;
  let text: string;
  let cls: string;
  let href: string | null = null;

  if (!online) {
    dot = "bg-danger"; icon = "wifiOff"; cls = "text-danger";
    text = waiting > 0 ? `Offline — ${waiting} phiếu chờ đồng bộ` : "Offline — ảnh sẽ chờ đồng bộ";
  } else if (summary.failed > 0) {
    dot = "bg-danger"; icon = "alert"; cls = "text-danger"; href = "/history";
    text = `${summary.failed} phiếu lỗi — chạm để thử lại`;
  } else if (summary.uploading > 0) {
    dot = "bg-info"; icon = "upload"; cls = "text-info";
    text = `Đang tải lên… (${summary.uploading})`;
  } else if (summary.queued > 0) {
    dot = "bg-warning"; icon = "clock"; cls = "text-ink"; href = "/history";
    text = `Đang chờ đồng bộ (${summary.queued} phiếu)`;
  } else {
    dot = "bg-success"; icon = "check"; cls = "text-ink-muted";
    text = "Đã đồng bộ";
  }

  const inner = (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <span className={`w-2 h-2 rounded-pill flex-none ${dot} ${summary.uploading > 0 && online ? "animate-pulse" : ""}`} />
      <Icon name={icon} size={14} className={cls} />
      <span className={`text-[12px] font-medium flex-1 truncate ${cls}`}>{text}</span>
      {href && <Icon name="chevronRight" size={14} className="text-ink-disabled flex-none" />}
    </div>
  );

  return (
    <div className="flex-none border-t border-line bg-white">
      {href ? <Link href={href} className="block active:bg-surface-2">{inner}</Link> : inner}
    </div>
  );
}
