"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { ALL_DEPARTMENTS, todayKpi } from "@/lib/mock-overview";

export default function OverviewPage() {
  const kpi = todayKpi();
  const [openDept, setOpenDept] = useState<string | null>(null);
  // Sort: chưa chụp lên trên (dễ thấy ai thiếu), rồi theo mã.
  const list = ALL_DEPARTMENTS.slice().sort((a, b) => {
    if (a.shotToday !== b.shotToday) return a.shotToday ? 1 : -1;
    return a.code.localeCompare(b.code);
  });

  return (
    <AppShell>
      <AppHeader title="Toàn cảnh hôm nay" subtitle="Thứ Ba · 17/06/2026" />
      <div className="px-5 pb-6">
        <div className="card-flat p-4 flex items-center gap-4">
          <div className="text-[28px] font-bold leading-none">
            {kpi.shot}<span className="text-ink-muted text-[16px]"> / {kpi.total}</span>
          </div>
          <div className="flex-1">
            <div className="text-[13px] text-ink-muted mb-1">phòng ban đã chụp · {kpi.pct}%</div>
            <div className="h-2 rounded-pill bg-surface overflow-hidden">
              <i className="block h-full rounded-pill bg-success" style={{ width: `${kpi.pct}%` }} />
            </div>
          </div>
        </div>

        <div className="card-flat mt-4 divide-y divide-line">
          {list.map((d) => (
            <button
              key={d.code}
              onClick={() => setOpenDept(d.code)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-none ${d.shotToday ? "bg-success" : "bg-danger"}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-[15px]">{d.code}</span>
                <span className="block text-[12px] text-ink-muted truncate">{d.name}</span>
              </span>
              {d.shotToday ? (
                <span className="text-[13px] text-ink-muted">{d.lastTime}</span>
              ) : (
                <span className="text-[13px] text-danger font-semibold">Chưa chụp</span>
              )}
              <span className="text-ink-muted">›</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">Chạm vào phòng ban để xem ảnh hôm nay.</p>
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}
