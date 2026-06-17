"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { latestFeed, missingDepartments, todayKpi } from "@/lib/mock-overview";

export default function HomePage() {
  const kpi = todayKpi();
  const missing = missingDepartments();
  const feed = latestFeed(8);
  const [openDept, setOpenDept] = useState<string | null>(null);

  return (
    <AppShell>
      <AppHeader />
      <div className="px-5 pb-6">
        {/* KPI hôm nay */}
        <div className="rounded-lg p-5 shadow-e4 text-white bg-gradient-to-br from-[#1480d4] to-[#115EA3]">
          <div className="text-[13px] opacity-90">Hôm nay · Thứ Ba 17/06/2026</div>
          <div className="text-[30px] font-bold mt-1 leading-none">
            {kpi.shot} / {kpi.total} <span className="text-[16px] font-semibold opacity-90">phòng ban đã chụp</span>
          </div>
          <div className="mt-3 h-2.5 rounded-pill bg-white/25 overflow-hidden">
            <i className="block h-full rounded-pill bg-white" style={{ width: `${kpi.pct}%` }} />
          </div>
          <div className="text-[13px] font-semibold mt-2">{kpi.pct}% hoàn thành</div>
        </div>

        {/* Big CTA */}
        <Link
          href="/capture"
          className="block mt-5 w-full rounded-xl text-white text-center shadow-e8 bg-gradient-to-b from-[#0E700E] to-[#0a5c0a]"
        >
          <span className="flex flex-col items-center justify-center gap-1.5 min-h-[120px]">
            <span className="text-[40px] leading-none">📷</span>
            <span className="text-[20px] font-bold tracking-wide">CHỤP ẢNH 5S</span>
          </span>
        </Link>

        {/* Chưa chụp */}
        <div className="flex items-center justify-between mt-6 mb-2">
          <span className="text-[16px] font-semibold">Chưa chụp hôm nay</span>
          <span className="badge badge-danger">{missing.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {missing.map((d) => (
            <button
              key={d.code}
              onClick={() => setOpenDept(d.code)}
              className="badge badge-warning text-[13px]"
            >
              {d.code}
            </button>
          ))}
        </div>

        {/* Feed ảnh mới nhất */}
        <div className="flex items-center justify-between mt-6 mb-2">
          <span className="text-[16px] font-semibold">Ảnh mới nhất</span>
          <Link href="/overview" className="text-[13px] font-semibold text-primary-600">
            Toàn cảnh →
          </Link>
        </div>
        <div className="flex flex-col gap-2.5">
          {feed.map((f) => (
            <button
              key={f.id}
              onClick={() => setOpenDept(f.code)}
              className="card-flat p-2.5 flex items-center gap-3 text-left"
            >
              <span
                className="w-12 h-12 rounded-md grid place-items-center text-white text-[11px] font-extrabold flex-none"
                style={{ background: `linear-gradient(135deg, hsl(${f.hue} 34% 70%), hsl(${f.hue} 30% 48%))` }}
              >
                5S
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-[15px]">{f.code}</span>
                <span className="block text-[13px] text-ink-muted truncate">{f.name}</span>
              </span>
              <span className="text-[13px] text-ink-muted">{f.time}</span>
            </button>
          ))}
        </div>
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}
