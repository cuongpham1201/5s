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
  const feed = latestFeed(8);
  const [openDept, setOpenDept] = useState<string | null>(null);

  return (
    <AppShell>
      <AppHeader showBell />
      <div className="px-4 pb-6 flex flex-col gap-5">
        {/* Hero KPI */}
        <div
          className="rounded-[24px] p-5 text-white shadow-ctaBlue"
          style={{ background: "linear-gradient(135deg, #1f8bff 0%, #0A74DA 55%, #0860B5 100%)" }}
        >
          <div className="text-[13px] font-medium opacity-90">Hôm nay · Thứ Ba 17/06/2026</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[34px] font-extrabold leading-none">{kpi.shot}</span>
            <span className="text-[16px] font-semibold opacity-85 mb-0.5">/ {kpi.total} phòng ban đã chụp</span>
          </div>
          <div className="mt-4 h-2.5 rounded-pill bg-white/25 overflow-hidden">
            <i className="block h-full rounded-pill bg-white" style={{ width: `${kpi.pct}%` }} />
          </div>
          <div className="mt-2 text-[13px] font-semibold">{kpi.pct}% hoàn thành</div>
        </div>

        {/* CTA premium */}
        <Link
          href="/capture"
          className="flex items-center gap-4 rounded-[24px] p-4 text-white shadow-cta"
          style={{ background: "linear-gradient(135deg, #22c55e 0%, #16A34A 60%, #138a3e 100%)" }}
        >
          <span className="w-12 h-12 rounded-pill grid place-items-center bg-white/20 flex-none">
            <Icon name="camera" size={24} strokeWidth={2} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[18px] font-bold leading-tight">CHỤP ẢNH 5S</span>
            <span className="block text-[13px] opacity-90">Gửi ảnh mới / bổ sung</span>
          </span>
          <Icon name="upload" size={22} className="opacity-90" />
        </Link>

        {/* Chưa chụp hôm nay */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[15px] font-bold">Chưa chụp hôm nay</span>
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-pill grid place-items-center text-[12px] font-bold bg-danger-bg text-danger">
              {missing.length}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
            {missing.map((d) => (
              <button
                key={d.code}
                onClick={() => setOpenDept(d.code)}
                className="flex-none px-3.5 h-9 rounded-pill text-[13px] font-semibold bg-danger-bg text-danger"
              >
                {d.code}
              </button>
            ))}
          </div>
        </section>

        {/* Ảnh mới nhất — thumbnail cards */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[15px] font-bold">Ảnh mới nhất</span>
            <Link href="/overview" className="flex items-center gap-0.5 text-[13px] font-semibold text-primary-600">
              Toàn cảnh <Icon name="chevronRight" size={16} />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
            {feed.map((f) => (
              <button key={f.id} onClick={() => setOpenDept(f.code)} className="flex-none w-[150px] text-left">
                <MockPhoto hue={f.hue} className="h-[110px] w-full">
                  <span className="absolute left-2 top-2 px-2 h-6 rounded-pill grid place-items-center text-[11px] font-bold bg-black/45 text-white backdrop-blur">
                    {f.code}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-5 pb-2">
                    <div className="text-white text-[11px] font-semibold truncate">{f.name}</div>
                    <div className="text-white/85 text-[11px]">{f.time}</div>
                  </div>
                </MockPhoto>
              </button>
            ))}
          </div>
        </section>
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}
