"use client";

import { useQueue } from "@/hooks/useQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Home sync-visibility card: queue state + online status (future upload status). */
export function QueueStatusCard() {
  const { summary } = useQueue();
  const online = useOnlineStatus();
  const waiting = summary.queued + summary.uploading;

  let tone: string;
  let icon: string;
  let text: string;
  if (summary.failed > 0) {
    tone = "bg-danger-bg text-danger";
    icon = "❌";
    text = `${summary.failed} lần gửi lỗi đồng bộ`;
  } else if (waiting > 0) {
    tone = "bg-warning-bg text-warning";
    icon = "⚠";
    text = `${waiting} lần gửi đang chờ đồng bộ`;
  } else {
    tone = "bg-success-bg text-success";
    icon = "✓";
    text = "Đã đồng bộ";
  }

  return (
    <div className={`mt-4 flex items-center gap-3 rounded-md px-4 py-3 ${tone}`}>
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-[14px] font-semibold">{text}</span>
      <span className="text-[12px] font-semibold opacity-80">{online ? "🟢 Online" : "🔴 Offline"}</span>
    </div>
  );
}
