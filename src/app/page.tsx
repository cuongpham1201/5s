"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { Icon } from "@/components/ui/Icon";
import { MockPhoto } from "@/components/ui/MockPhoto";
import { latestFeed, missingDepartments, todayKpi } from "@/lib/mock-overview";

export default function HomePage() {
  const kpi = todayKpi();
  const missing = missingDepartments();
  const feed = latestFeed(6);
  const [openDept, setOpenDept] = useState<string | null>(null);

  return (
    <AppShell>
      <AppHeader showBell />
      <div className="px-4 pb-6 flex flex-col gap-4">
        {/* Today summary — white card */}
        <div className="card">
          <div className="text-[12px] text-ink-muted">Hôm nay · Thứ Ba 17/06/2026</div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <div className="text-[34px] font-extrabold leading-none text-ink">
                {kpi.shot}<span className="text-ink-disabled text-[20px] font-bold">/{kpi.total}</span>
              </div>
              <div className="text-[12.5px] text-ink-muted mt-1">phòng ban đã chụp</div>
            </div>
            <div className="text-right">
              <div className="text-[28px] font-extrabold leading-none text-success">{kpi.pct}%</div>
              <div className="text-[12.5px] text-ink-muted mt-1">Hoàn thành</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-pill bg-surface overflow-hidden">
            <i className="block h-full rounded-pill bg-success" style={{ width: `${kpi.pct}%` }} />
          </div>
        </div>

        {/* Quick action — compact white card */}
        <Link
          href="/capture"
          className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2"
        >
          <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-success-bg text-success flex-none">
            <Icon name="camera" size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-ink leading-tight">Chụp ảnh 5S</span>
            <span className="block text-[12.5px] text-ink-muted">Gửi ảnh mới · bổ sung</span>
          </span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>

        {/* Missing departments */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[15px] font-bold text-ink">Chưa chụp hôm nay</span>
            <span className="min-w-[20px] h-5 px-1.5 rounded-pill grid place-items-center text-[11px] font-bold bg-danger-bg text-danger">
              {missing.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((d) => (
              <button
                key={d.code}
                onClick={() => setOpenDept(d.code)}
                className="px-3 h-8 rounded-pill text-[12.5px] font-semibold bg-danger-bg text-danger"
              >
                {d.code}
              </button>
            ))}
          </div>
        </section>

        {/* Latest photos — compact list */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-bold text-ink">Ảnh mới nhất</span>
            <Link href="/overview" className="flex items-center gap-0.5 text-[13px] font-semibold text-primary-600">
              Toàn cảnh <Icon name="chevronRight" size={15} />
            </Link>
          </div>
          <div className="card-flat divide-y divide-line overflow-hidden">
            {feed.map((f) => (
              <button key={f.id} onClick={() => setOpenDept(f.code)} className="w-full flex items-center gap-3 p-2.5 text-left active:bg-surface-2">
                <MockPhoto className="w-14 h-14 flex-none" rounded="12px" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-ink leading-tight">{f.code} · {f.name}</span>
                  <span className="block text-[12px] text-ink-muted mt-0.5">{f.time}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-ink-disabled flex-none" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}
