"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { Icon } from "@/components/ui/Icon";
import { ALL_DEPARTMENTS, todayKpi } from "@/lib/mock-overview";

export default function OverviewPage() {
  const kpi = todayKpi();
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ALL_DEPARTMENTS.slice()
      .filter((d) => !term || d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term))
      .sort((a, b) => (a.shotToday !== b.shotToday ? (a.shotToday ? 1 : -1) : a.code.localeCompare(b.code)));
  }, [q]);

  return (
    <AppShell>
      <AppHeader title="Toàn cảnh hôm nay" subtitle="Thứ Ba · 17/06/2026" />
      <div className="px-4 pb-6 flex flex-col gap-4">
        {/* KPI nhỏ */}
        <div className="card p-4 flex items-center gap-4">
          <div className="text-[26px] font-extrabold leading-none">
            {kpi.shot}<span className="text-ink-muted text-[15px] font-bold"> / {kpi.total}</span>
          </div>
          <div className="flex-1">
            <div className="text-[12.5px] text-ink-muted mb-1.5">phòng ban đã chụp · {kpi.pct}%</div>
            <div className="h-2 rounded-pill bg-surface overflow-hidden">
              <i className="block h-full rounded-pill bg-success" style={{ width: `${kpi.pct}%` }} />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 rounded-[14px] bg-white border border-line px-3.5 h-12 shadow-e2">
          <Icon name="search" size={18} className="text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm phòng ban…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-disabled"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-ink-muted" aria-label="Xoá">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {/* Rows */}
        <div className="card-flat divide-y divide-line overflow-hidden">
          {list.map((d) => (
            <button
              key={d.code}
              onClick={() => setOpenDept(d.code)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2"
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-none ${d.shotToday ? "bg-success" : "bg-danger"}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[15px] leading-tight">{d.code}</span>
                <span className="block text-[12px] text-ink-muted truncate">{d.name}</span>
              </span>
              {d.shotToday ? (
                <span className="text-[12px] font-semibold px-2 h-6 rounded-pill grid place-items-center bg-success-bg text-success">
                  {d.lastTime}
                </span>
              ) : (
                <span className="text-[12px] font-semibold px-2 h-6 rounded-pill grid place-items-center bg-danger-bg text-danger">
                  Chưa chụp
                </span>
              )}
              <Icon name="chevronRight" size={18} className="text-ink-disabled flex-none" />
            </button>
          ))}
          {list.length === 0 && <div className="px-4 py-6 text-center text-ink-muted text-[14px]">Không tìm thấy.</div>}
        </div>
        <p className="text-[12px] text-ink-disabled text-center">Chạm vào phòng ban để xem ảnh hôm nay.</p>
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}
