"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useSessionCapture } from "@/features/capture/session-context";
import { useQueue } from "@/hooks/useQueue";
import type { QueueStatus } from "@/lib/queue/queue-types";

const TABS = ["Hôm nay", "Tuần", "Tháng"] as const;

type SyncTone = "success" | "warning" | "danger" | "neutral";
interface Row {
  date: string;
  department: string;
  area: string;
  photoCount: number;
  hue: number;
  syncLabel: string;
  syncTone: SyncTone;
}

function syncFromStatus(status?: QueueStatus): { label: string; tone: SyncTone } {
  switch (status) {
    case "uploaded":
      return { label: "Đã đồng bộ", tone: "success" };
    case "uploading":
      return { label: "Đang đồng bộ…", tone: "warning" };
    case "failed":
      return { label: "Lỗi đồng bộ", tone: "danger" };
    case "queued":
    case "ready":
    case "draft":
      return { label: "Đang chờ đồng bộ", tone: "warning" };
    case "cancelled":
      return { label: "Đã huỷ", tone: "neutral" };
    default:
      return { label: "Đã đồng bộ", tone: "success" };
  }
}

const DEMO: Row[] = [
  { date: "15/06/2026", department: "PMKT", area: "Văn phòng", photoCount: 3, hue: 210, syncLabel: "Đã đồng bộ", syncTone: "success" },
  { date: "15/06/2026", department: "PMKT", area: "Kho POSM", photoCount: 2, hue: 150, syncLabel: "Đang chờ đồng bộ", syncTone: "warning" },
  { date: "14/06/2026", department: "PMKT", area: "Phòng họp", photoCount: 1, hue: 280, syncLabel: "Đã đồng bộ", syncTone: "success" },
];

function dmy(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function HistoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Hôm nay");
  const { history } = useSessionCapture();
  const { items } = useQueue();

  const statusBySubmission = new Map(items.map((q) => [q.submissionId, q.status]));

  const rows: Row[] =
    history.length > 0
      ? history.map((h, i) => {
          const sync = syncFromStatus(statusBySubmission.get(h.submissionId));
          return {
            date: dmy(h.submittedAt),
            department: h.departmentCode,
            area: h.areaName,
            photoCount: h.photoCount,
            hue: (i * 47 + 200) % 360,
            syncLabel: sync.label,
            syncTone: sync.tone,
          };
        })
      : DEMO;

  return (
    <AppShell>
      <div className="px-5 pt-3 pb-3">
        <div className="text-[22px] font-semibold">Lịch sử của tôi</div>
        <div className="text-[13px] text-ink-muted">
          {history.length > 0 ? `${history.length} lần gửi đã lưu (cục bộ)` : "Chưa có lần gửi — đang xem ví dụ"}
        </div>
      </div>

      <div className="px-5 pb-6">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 mt-[18px]">
          {rows.map((r, i) => (
            <div key={i} className="card-flat p-3 flex items-center gap-3">
              <div className="flex -space-x-2">
                {Array.from({ length: Math.min(r.photoCount, 3) }).map((_, k) => (
                  <span
                    key={k}
                    className="w-10 h-10 rounded-md border-2 border-white"
                    style={{ background: `linear-gradient(135deg, hsl(${r.hue + k * 15} 32% 74%), hsl(${r.hue + k * 15} 28% 52%))` }}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]">
                  {r.department} · {r.area}
                </div>
                <div className="text-[13px] text-ink-muted">
                  {r.date} · {r.photoCount} ảnh
                </div>
              </div>
              <StatusBadge tone={r.syncTone}>{r.syncLabel}</StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
